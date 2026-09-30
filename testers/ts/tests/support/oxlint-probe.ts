import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const oxlint = fileURLToPath(new URL('../../node_modules/.bin/oxlint', import.meta.url));

export interface LintMessage {
  readonly message: string;
  readonly ruleId: string;
  readonly severity: number;
}

interface OxlintDiagnostic {
  readonly code: string;
  readonly filename: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

interface OxlintReport {
  readonly diagnostics: readonly OxlintDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDiagnostic(value: unknown): value is OxlintDiagnostic {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['filename'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['severity'] === 'error' || value['severity'] === 'warning')
  );
}

function parseReport(output: string): OxlintReport {
  const value: unknown = JSON.parse(output);
  if (!isRecord(value)) {
    throw new Error('Oxlint returned an invalid JSON report.');
  }

  const diagnostics = value['diagnostics'];
  if (!Array.isArray(diagnostics) || !diagnostics.every(isDiagnostic)) {
    throw new Error('Oxlint returned an invalid JSON report.');
  }

  return { diagnostics };
}

function normalizedRuleId(code: string): string {
  const match = /^(?<plugin>[^()]+)\((?<rule>[^)]+)\)$/u.exec(code);
  const plugin = match?.groups?.['plugin'];
  const rule = match?.groups?.['rule'];
  if (plugin === undefined || rule === undefined) {
    return code;
  }

  return plugin === 'eslint' ? rule : `${plugin}/${rule}`;
}

function lintMessage(diagnostic: OxlintDiagnostic): LintMessage {
  return {
    message: diagnostic.message,
    ruleId: normalizedRuleId(diagnostic.code),
    severity: diagnostic.severity === 'error' ? 2 : 1,
  };
}

interface Probe {
  readonly path: string;
  readonly source: string;
}

async function lintFiles(probes: readonly Probe[]): Promise<readonly OxlintDiagnostic[]> {
  await Promise.all(probes.map((probe) => writeFile(path.join(projectRoot, probe.path), probe.source, 'utf8')));

  try {
    const child = Bun.spawn([oxlint, '--format', 'json', ...probes.map((probe) => probe.path)], {
      cwd: projectRoot,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [code, stderr, stdout] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
    ]);

    if (stderr.trim().length > 0) {
      throw new Error(stderr);
    }

    const report = parseReport(stdout);
    if (code !== 0 && report.diagnostics.length === 0) {
      throw new Error(`Oxlint exited ${String(code)} without a diagnostic.`);
    }

    return report.diagnostics;
  } finally {
    await Promise.all(probes.map((probe) => unlink(path.join(projectRoot, probe.path))));
  }
}

export type LintResult = () => Promise<LintMessage[]>;

/**
 * Probes registered on one batch lint together in a single type-aware Oxlint
 * run, which builds the TypeScript program once instead of once per probe.
 * Register every probe while defining tests; the first result read runs the
 * batch, and each result holds only its own file's diagnostics.
 */
export function lintBatch(): (source: string, requestedPath?: string) => LintResult {
  const probes: Probe[] = [];
  let diagnostics: Promise<readonly OxlintDiagnostic[]> | undefined;

  return (source, requestedPath = 'src/lint-probe.ts') => {
    if (diagnostics !== undefined) {
      throw new Error('Register every lint probe before reading a batch result.');
    }

    const extension = path.extname(requestedPath);
    const probePath = `${requestedPath.slice(0, -extension.length)}.${crypto.randomUUID()}${extension}`;
    probes.push({ path: probePath, source });

    return async () => {
      diagnostics ??= lintFiles(probes);
      return (await diagnostics).filter(({ filename }) => filename === probePath).map(lintMessage);
    };
  };
}

export function lintProbe(source: string, requestedPath?: string): Promise<LintMessage[]> {
  return lintBatch()(source, requestedPath)();
}
