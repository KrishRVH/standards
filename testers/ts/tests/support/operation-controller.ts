import { Cause, Effect, Exit, Fiber } from 'effect';

interface ActiveOperation {
  publicationAllowed: boolean;
  readonly interruptAndWait: () => Promise<void>;
}

export interface OperationController {
  readonly interrupt: () => void;
  readonly interruptAndWait: () => Promise<void>;
  readonly replaceWith: <A, E>(operation: Effect.Effect<A, E>, publish: (value: A) => void) => Promise<void>;
  readonly start: <A, E>(operation: Effect.Effect<A, E>, publish: (value: A) => void) => void;
}

export type OperationFailureObserver = (cause: Cause.Cause<unknown>) => void;

export const makeOperationController = (observeFailure: OperationFailureObserver): OperationController => {
  let current: ActiveOperation | undefined;
  let replacementToken: object | undefined;

  const start: OperationController['start'] = (operation, publish) => {
    if (current !== undefined) {
      throw new Error('An operation is already active. Use replaceWith for replacement.');
    }
    replacementToken = undefined;

    const fiber = Effect.runFork(operation);
    let interruption: Promise<void> | undefined;
    const active: ActiveOperation = {
      publicationAllowed: true,
      interruptAndWait: () => {
        active.publicationAllowed = false;
        interruption ??= Effect.runPromise(Fiber.interrupt(fiber)).then(() => undefined);
        return interruption;
      },
    };

    current = active;

    Effect.runPromise(Fiber.await(fiber)).then(
      (exit) => {
        if (active.publicationAllowed && Exit.isSuccess(exit)) {
          publish(exit.value);
        }
        if (Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)) {
          observeFailure(exit.cause);
        }
        if (current === active) {
          current = undefined;
        }
      },
      () => {
        observeFailure(Cause.die('operation-controller-observer-defect'));
        if (current === active) {
          current = undefined;
        }
      },
    );
  };

  const interrupt = (): void => {
    replacementToken = undefined;
    const active = current;
    if (active === undefined) {
      return;
    }

    active.publicationAllowed = false;
    void active.interruptAndWait().catch(() => {
      observeFailure(Cause.die('operation-controller-interrupt-defect'));
    });
  };

  const stopActive = async (): Promise<void> => {
    const active = current;
    if (active === undefined) {
      return;
    }

    await active.interruptAndWait();
    if (current === active) {
      current = undefined;
    }
  };

  const interruptAndWait = (): Promise<void> => {
    replacementToken = undefined;
    return stopActive();
  };

  const replaceWith: OperationController['replaceWith'] = async (operation, publish) => {
    const token = {};
    replacementToken = token;
    await stopActive();
    if (replacementToken === token) {
      start(operation, publish);
    }
  };

  return { interrupt, interruptAndWait, replaceWith, start };
};
