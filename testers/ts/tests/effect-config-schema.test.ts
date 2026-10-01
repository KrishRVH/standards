import { expect, test } from 'bun:test';
import { Cause, Config, ConfigProvider, Context, Duration, Effect, Exit, Layer, Option, Schema } from 'effect';

const RawSettings = Config.all({
  baseUrl: Config.URL('BASE_URL'),
  port: Config.Int('PORT').pipe(Config.withDefault(8080)),
  region: Config.option(Config.String('REGION')),
  requestTimeout: Config.Duration('REQUEST_TIMEOUT').pipe(Config.withDefault(Duration.seconds(2))),
  serviceName: Config.String('SERVICE_NAME'),
  token: Config.Redacted('TOKEN'),
}).pipe(Config.nested('APP'));

interface SettingsService {
  readonly value: Config.Success<typeof RawSettings>;
}

class Settings extends Context.Service<Settings, SettingsService>()('@standards/tests/Settings') {}

test('loads nested typed configuration once and keeps secrets redacted', async () => {
  let layerBuilds = 0;
  const provider = ConfigProvider.fromUnknown({
    APP: {
      BASE_URL: 'https://api.example.test/',
      PORT: '9090',
      SERVICE_NAME: 'endpoint-checker',
      TOKEN: 'provider-secret',
    },
  });
  const settingsLive = Layer.effect(
    Settings,
    RawSettings.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          layerBuilds += 1;
        }),
      ),
      Effect.map((value) => ({ value })),
    ),
  );
  const [first, second] = await Effect.runPromise(
    Effect.all([Settings, Settings]).pipe(
      Effect.provide(settingsLive),
      Effect.provideService(ConfigProvider.ConfigProvider, provider),
    ),
  );

  expect(layerBuilds).toBe(1);
  expect(first).toBe(second);
  expect(first.value.baseUrl.href).toBe('https://api.example.test/');
  expect(first.value.port).toBe(9090);
  expect(first.value.serviceName).toBe('endpoint-checker');
  expect(Duration.toMillis(first.value.requestTimeout)).toBe(2_000);
  expect(Option.isNone(first.value.region)).toBe(true);
  expect(JSON.stringify(first.value.token)).toBe('"<redacted>"');
});

test('fromJsonString composes JSON parsing with domain decoding and encoding', async () => {
  const Payload = Schema.Struct({ count: Schema.NumberFromString });
  const PayloadJson = Schema.fromJsonString(Payload);
  const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(PayloadJson)('{"count":"2","ignored":true}'));
  const encoded = await Effect.runPromise(Schema.encodeEffect(PayloadJson)(decoded));

  expect(decoded).toEqual({ count: 2 });
  expect(encoded).toBe('{"count":"2"}');
});

test('external boundaries can reject excess properties deliberately', async () => {
  const Payload = Schema.Struct({ count: Schema.NumberFromString });
  const exit = await Effect.runPromiseExit(
    Schema.decodeUnknownEffect(Payload, { onExcessProperty: 'error' })({
      count: '2',
      ignored: true,
    }),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('SchemaError');
    expect(Cause.hasDies(exit.cause)).toBe(false);
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(false);
  }

  expect(Schema.decodeUnknownSync(Payload)({ count: '3' })).toEqual({
    count: 3,
  });
});
