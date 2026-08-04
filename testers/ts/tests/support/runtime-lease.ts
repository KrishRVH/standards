export interface RuntimeLease<A> {
  readonly value: A;
  readonly release: () => void;
}

export interface RuntimeLeaseOwner<A> {
  readonly retain: () => RuntimeLease<A>;
  readonly shutdown: () => Promise<void>;
}

export const makeRuntimeLeaseOwner = <A>(
  create: () => A,
  dispose: (value: A) => Promise<void>,
  observeDisposalFailure: () => void,
): RuntimeLeaseOwner<A> => {
  let active: { readonly value: A } | undefined;
  let disposal = Promise.resolve();
  let generation = 0;
  let retainCount = 0;

  const beginDisposal = (retained: { readonly value: A }): void => {
    disposal = disposal
      .then(() => dispose(retained.value))
      .catch(() => {
        observeDisposalFailure();
      });
  };

  return {
    retain: () => {
      active ??= { value: create() };
      const retained = active;
      const { value } = retained;
      retainCount += 1;
      generation += 1;
      let released = false;

      return {
        value,
        release: () => {
          if (released) {
            return;
          }
          released = true;
          retainCount -= 1;
          generation += 1;
          const releaseGeneration = generation;

          queueMicrotask(() => {
            if (retainCount === 0 && generation === releaseGeneration && active === retained) {
              active = undefined;
              beginDisposal(retained);
            }
          });
        },
      };
    },
    shutdown: async () => {
      generation += 1;
      retainCount = 0;
      const retained = active;
      active = undefined;

      if (retained !== undefined) {
        beginDisposal(retained);
      }
      await disposal;
    },
  };
};
