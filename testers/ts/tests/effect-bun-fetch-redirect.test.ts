import { expect, test } from 'bun:test';

test('aborting a pending manual-redirect fetch rejects and never reaches the target', async () => {
  const redirectStarted = Promise.withResolvers<undefined>();
  const releaseRedirect = Promise.withResolvers<undefined>();
  let targetHits = 0;
  const server = Bun.serve({
    fetch: async (request) => {
      const pathname = new URL(request.url).pathname;

      if (pathname === '/redirect') {
        redirectStarted.resolve(undefined);
        await releaseRedirect.promise;

        return new Response(null, {
          headers: { location: '/target?credential=must-not-be-followed' },
          status: 302,
        });
      }

      if (pathname === '/target') {
        targetHits += 1;
      }

      return new Response('ok');
    },
    hostname: '127.0.0.1',
    port: 0,
  });
  const controller = new AbortController();
  const response = fetch(new URL('/redirect', server.url), {
    redirect: 'manual',
    signal: controller.signal,
  });

  try {
    await redirectStarted.promise;
    controller.abort();
    releaseRedirect.resolve(undefined);

    let rejection: unknown;
    try {
      await response;
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(DOMException);
    expect(rejection).toMatchObject({ name: 'AbortError' });
    expect(targetHits).toBe(0);
  } finally {
    controller.abort();
    releaseRedirect.resolve(undefined);
    await server.stop(true);
  }
});
