import { runMain } from '@effect/platform-bun/BunRuntime';
import { Console, Effect } from 'effect';

import { EndpointProbeLive, checkEndpoints } from './endpoint-checker.js';
import { encodeEndpointResults, projectCheckFailure, projectEncodingFailure } from './endpoint-contracts.js';

function parseTargetArgument(argument: string): { readonly id: string; readonly url: string } {
  const separator = argument.indexOf('=');

  return separator < 1
    ? { id: '', url: argument }
    : { id: argument.slice(0, separator), url: argument.slice(separator + 1) };
}

const main = checkEndpoints({ endpoints: globalThis.Bun.argv.slice(2).map(parseTargetArgument) }).pipe(
  Effect.provide(EndpointProbeLive),
  Effect.mapError(projectCheckFailure),
  Effect.flatMap((results) => encodeEndpointResults(results).pipe(Effect.mapError(projectEncodingFailure))),
  Effect.tap((encoded) => Console.log(JSON.stringify(encoded))),
);

// BunRuntime is the sole failure observer and installs SIGINT/SIGTERM handling.
runMain(main);
