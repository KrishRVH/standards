import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const readRelative = (path: string): Promise<string> => readFile(new URL(path, import.meta.url), 'utf8');

const routedGuides = [
  '../docs/effect/adoption-and-functions.md',
  '../docs/effect/concurrency-and-resources.md',
  '../docs/effect/errors-cause-and-projection.md',
  '../docs/effect/schema-config-and-security.md',
  '../docs/effect/services-layers-and-runtime.md',
  '../docs/effect/testing-and-diagnostics.md',
  '../docs/effect/time-retry-and-cancellation.md',
  '../docs/effect/type-discipline.md',
  '../docs/effect/overlays/bun-server.md',
  '../docs/effect/overlays/framework-ui.md',
  '../docs/effect/overlays/production-observability.md',
  '../docs/effect/overlays/published-library.md',
] as const;

test('the always-loaded guide remains compact and exposes all boundary routes', async () => {
  const guide = await readRelative('../AGENTS.md');
  const words = guide.match(/\S+/gu) ?? [];
  expect(words.length).toBeLessThanOrEqual(1_200);

  for (const path of routedGuides) {
    const linkedPath = path.slice(3);
    expect(guide).toContain(`](${linkedPath})`);
    expect((await readRelative(path)).length).toBeGreaterThan(0);
  }
});

test('the enforcement map owns one complete record for every stable rule ID', async () => {
  const enforcement = await readRelative('../docs/effect/enforcement.md');
  const entries = [...enforcement.matchAll(/^## (EFF-\d{3}) — .+$/gmu)];
  const expectedIds = Array.from({ length: 30 }, (_, index) => `EFF-${String(index + 1).padStart(3, '0')}`);

  expect(entries.map(([, id]) => id)).toEqual(expectedIds);
  for (const [index, entry] of entries.entries()) {
    const start = entry.index;
    const end = entries[index + 1]?.index ?? enforcement.length;
    const rule = enforcement.slice(start, end);

    for (const field of [
      '**Rule — MUST:**',
      '**Rationale:**',
      '**Minimum / prohibited:**',
      '**Exception:**',
      '**Enforcement:**',
      '**Version:**',
    ]) {
      expect(rule).toContain(field);
    }
  }

  const routedText = await Promise.all(routedGuides.map((path) => readRelative(path)));
  for (const guide of routedText) {
    expect(guide).not.toContain('**Rule — MUST:**');
    expect(guide).not.toMatch(/^## EFF-\d{3}/mu);
  }
});
