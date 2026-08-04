import { Duration, Effect, Schema } from 'effect';

import { InvalidCheckPolicy, maximumEndpoints } from './endpoint-contracts.js';

const maximumPolicyMilliseconds = 3_600_000;
const maximumRetries = 5;

const PolicyMilliseconds = Schema.Number.pipe(Schema.int(), Schema.between(1, maximumPolicyMilliseconds));
const RetryDelayMilliseconds = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, maximumPolicyMilliseconds),
  Schema.filter((milliseconds) => !Object.is(milliseconds, -0), {
    description: 'a non-negative millisecond count excluding negative zero',
  }),
);

export const CheckPolicyInput = Schema.Struct({
  allowedOrigins: Schema.NonEmptyArray(Schema.String).pipe(Schema.maxItems(maximumEndpoints)),
  attemptTimeoutMilliseconds: PolicyMilliseconds,
  concurrency: Schema.Number.pipe(Schema.int(), Schema.between(1, maximumEndpoints)),
  retries: Schema.Number.pipe(Schema.int(), Schema.between(0, maximumRetries)),
  retryDelayMilliseconds: RetryDelayMilliseconds,
  totalDeadlineMilliseconds: PolicyMilliseconds,
});

export type CheckPolicyInput = Schema.Schema.Type<typeof CheckPolicyInput>;

export interface CheckedPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly attemptTimeout: Duration.Duration;
  readonly concurrency: number;
  readonly retries: number;
  readonly retryDelay: Duration.Duration;
  readonly totalDeadline: Duration.Duration;
}

export const defaultCheckPolicy: CheckPolicyInput = {
  allowedOrigins: ['https://example.com'],
  attemptTimeoutMilliseconds: 2_000,
  concurrency: 4,
  retries: 2,
  retryDelayMilliseconds: 100,
  totalDeadlineMilliseconds: 7_000,
};

type PolicyNormalization =
  { readonly _tag: 'Invalid'; readonly reason: string } | { readonly _tag: 'Valid'; readonly policy: CheckedPolicy };

function normalizeAllowedOrigin(input: string): string | undefined {
  try {
    const url = new URL(input);
    const isOriginOnly = url.pathname === '/' && url.search === '' && url.hash === '';
    const isSafeHttpsOrigin = url.protocol === 'https:' && url.username === '' && url.password === '' && isOriginOnly;

    return isSafeHttpsOrigin ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

// This is a total plain-TypeScript calculation. Effect begins when its result
// enters the typed failure channel below.
function normalizePolicy(input: CheckPolicyInput): PolicyNormalization {
  const origins: string[] = [];
  for (const inputOrigin of input.allowedOrigins) {
    const origin = normalizeAllowedOrigin(inputOrigin);
    if (origin === undefined) {
      return { _tag: 'Invalid', reason: 'allowedOrigins must contain only HTTPS origin values without credentials' };
    }

    origins.push(origin);
  }

  const uniqueOrigins = new Set(origins);
  if (uniqueOrigins.size !== origins.length) {
    return { _tag: 'Invalid', reason: 'allowedOrigins must be unique after normalization' };
  }

  return {
    _tag: 'Valid',
    policy: {
      allowedOrigins: uniqueOrigins,
      attemptTimeout: Duration.millis(input.attemptTimeoutMilliseconds),
      concurrency: input.concurrency,
      retries: input.retries,
      retryDelay: Duration.millis(input.retryDelayMilliseconds),
      totalDeadline: Duration.millis(input.totalDeadlineMilliseconds),
    },
  };
}

export const decodeCheckPolicy = Effect.fn('project-name/endpoint-checker.decode-policy')((input: unknown) =>
  Schema.decodeUnknown(CheckPolicyInput)(input).pipe(
    Effect.mapError(
      () => new InvalidCheckPolicy({ reason: 'policy input does not match the bounded configuration schema' }),
    ),
    Effect.flatMap((decoded) => {
      const normalized = normalizePolicy(decoded);

      return normalized._tag === 'Valid'
        ? Effect.succeed(normalized.policy)
        : Effect.fail(new InvalidCheckPolicy({ reason: normalized.reason }));
    }),
  ),
);
