import { Cause, Effect, FiberSet, type Scope } from 'effect';

export type ApplicationTaskFailureObserver = (cause: Cause.Cause<unknown>) => Effect.Effect<void>;

export interface ApplicationTaskService {
  readonly start: <A, E, R>(task: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R>;
}

export const makeApplicationTaskService = (
  observeFailure: ApplicationTaskFailureObserver,
): Effect.Effect<ApplicationTaskService, never, Scope.Scope> =>
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make();

    return {
      start: (task) =>
        FiberSet.run(
          fibers,
          task.pipe(
            Effect.asVoid,
            Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : observeFailure(cause))),
          ),
        ).pipe(Effect.asVoid),
    };
  });
