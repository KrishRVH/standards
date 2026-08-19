/**
 * EFF-030 negative contract: a tagged-union arm left unhandled must fail the
 * `satisfies never` exhaustion terminal instead of falling through silently.
 */
type EndpointOutcome =
  | { readonly _tag: 'EndpointHealthy'; readonly status: number }
  | { readonly _tag: 'EndpointUnhealthy'; readonly failureKind: string };

const assertOutcomeHandled = (outcome: EndpointOutcome): void => {
  switch (outcome._tag) {
    case 'EndpointHealthy':
      return;
    default:
      outcome satisfies never;
  }
};

export { assertOutcomeHandled };
