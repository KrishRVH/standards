import { Cause, Effect, FiberSet, type Scope } from 'effect';

export type ApplicationTaskFailureObserver = (cause: Cause.Cause<unknown>) => Effect.Effect<void>;

export interface ApplicationTaskService {
  readonly start: <A, E, R>(task: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R>;
}

export const makeApplicationTaskService = (
  observeFailure: ApplicationTaskFailureObserver,
): Effect.Effect<ApplicationTaskService, never, Scope.Scope> =>
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make<undefined, never>();

    return {
      start: (task) =>
        FiberSet.run(
          fibers,
          task.pipe(
            Effect.as(undefined),
            Effect.catchAllCause((cause) =>
              Cause.isInterruptedOnly(cause)
                ? Effect.succeed(undefined)
                : observeFailure(cause).pipe(Effect.as(undefined)),
            ),
          ),
        ).pipe(Effect.asVoid),
    };
  });
