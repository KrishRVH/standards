import { Data, Effect, Exit } from 'effect';

export interface BodyRequest {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly headers: Headers;
  readonly signal: AbortSignal;
}

export interface BoundedBodyOptions {
  readonly maximumBytes: number;
  readonly observeCleanupFailure: (diagnostic: BodyCleanupFailureDiagnostic) => void;
}

export interface BodyCleanupFailureDiagnostic {
  readonly failureKind: 'request-body-cleanup-failure';
  readonly operation: 'cancel' | 'release-lock';
}

export class InvalidDeclaredContentLength extends Data.TaggedError('InvalidDeclaredContentLength') {}

export class DeclaredBodyTooLarge extends Data.TaggedError('DeclaredBodyTooLarge')<{
  readonly maximumBytes: number;
}> {}

export class BodyTooLarge extends Data.TaggedError('BodyTooLarge')<{
  readonly maximumBytes: number;
}> {}

export class BodyReadFailed extends Data.TaggedError('BodyReadFailed') {}

export type BoundedBodyFailure = InvalidDeclaredContentLength | DeclaredBodyTooLarge | BodyTooLarge | BodyReadFailed;

type BodyReadResult =
  | {
      readonly done: false;
      readonly value: Uint8Array;
    }
  | {
      readonly done: true;
      readonly value: Uint8Array | undefined;
    };

interface BodyReader {
  readonly cancel: (reason?: unknown) => Promise<void>;
  readonly read: () => Promise<BodyReadResult>;
  readonly releaseLock: () => void;
}

const readChunk = (reader: BodyReader, signal: AbortSignal): Effect.Effect<BodyReadResult, BodyReadFailed> =>
  Effect.async<BodyReadResult, BodyReadFailed>((resume) => {
    let settled = false;
    let onAbort = (): void => undefined;
    const complete = (result: Effect.Effect<BodyReadResult, BodyReadFailed>): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resume(result);
    };
    onAbort = (): void => {
      complete(Effect.interrupt);
    };

    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
      void reader.read().then(
        (result) => {
          complete(Effect.succeed(result));
        },
        () => {
          complete(signal.aborted ? Effect.interrupt : Effect.fail(new BodyReadFailed()));
        },
      );
    }

    return Effect.sync(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });

const observeCleanupFailure = (
  observer: BoundedBodyOptions['observeCleanupFailure'],
  operation: BodyCleanupFailureDiagnostic['operation'],
): void => {
  try {
    observer({ failureKind: 'request-body-cleanup-failure', operation });
  } catch {
    // A host observer defect cannot replace the primary body-read Exit.
  }
};

const releaseReader = (
  reader: BodyReader,
  exit: Exit.Exit<Uint8Array, BoundedBodyFailure>,
  observer: BoundedBodyOptions['observeCleanupFailure'],
): Effect.Effect<void> => {
  const cleanup = Effect.sync(() => {
    if (Exit.isFailure(exit)) {
      try {
        void reader.cancel('request-body-abandoned').catch(() => {
          observeCleanupFailure(observer, 'cancel');
        });
      } catch {
        observeCleanupFailure(observer, 'cancel');
      }
    }

    try {
      reader.releaseLock();
    } catch {
      observeCleanupFailure(observer, 'release-lock');
    }
  });

  return cleanup;
};

const readAll = (
  reader: BodyReader,
  signal: AbortSignal,
  maximumBytes: number,
): Effect.Effect<Uint8Array, BodyReadFailed | BodyTooLarge> =>
  Effect.gen(function* () {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    for (;;) {
      const result = yield* readChunk(reader, signal);
      if (result.done) {
        const output = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return output;
      }

      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        return yield* Effect.fail(new BodyTooLarge({ maximumBytes }));
      }
      chunks.push(result.value);
    }
  });

const validateDeclaredLength = (
  headers: Headers,
  maximumBytes: number,
): Effect.Effect<void, InvalidDeclaredContentLength | DeclaredBodyTooLarge> => {
  const rawLength = headers.get('content-length');
  if (rawLength === null) {
    return Effect.void;
  }
  if (!/^(?:0|[1-9]\d*)$/.test(rawLength)) {
    return Effect.fail(new InvalidDeclaredContentLength());
  }

  const declaredBytes = Number(rawLength);
  if (!Number.isSafeInteger(declaredBytes)) {
    return Effect.fail(new InvalidDeclaredContentLength());
  }
  if (declaredBytes > maximumBytes) {
    return Effect.fail(new DeclaredBodyTooLarge({ maximumBytes }));
  }

  return Effect.void;
};

export const readBoundedBody = (
  request: BodyRequest,
  { maximumBytes, observeCleanupFailure: observer }: BoundedBodyOptions,
): Effect.Effect<Uint8Array, BoundedBodyFailure> =>
  validateDeclaredLength(request.headers, maximumBytes).pipe(
    Effect.flatMap(() => {
      const body = request.body;
      if (body === null) {
        return Effect.succeed(new Uint8Array());
      }

      return Effect.acquireUseRelease(
        Effect.sync(() => body.getReader()),
        (reader) => readAll(reader, request.signal, maximumBytes),
        (reader, exit) => releaseReader(reader, exit, observer),
      );
    }),
  );
