import { runMain } from '@effect/platform-bun/BunRuntime';
import { Console, Effect } from 'effect';

import {
  EndpointProbeLive,
  checkEndpoints,
  encodeEndpointResults,
  projectCheckFailure,
  projectEncodingFailure,
} from './endpoint-checker.js';

const main = checkEndpoints({ endpoints: globalThis.Bun.argv.slice(2) }).pipe(
  Effect.provide(EndpointProbeLive),
  Effect.mapError(projectCheckFailure),
  Effect.flatMap((results) => encodeEndpointResults(results).pipe(Effect.mapError(projectEncodingFailure))),
  Effect.tap((encoded) => Console.log(JSON.stringify(encoded))),
);

// BunRuntime is the sole failure observer and installs SIGINT/SIGTERM handling.
runMain(main);
