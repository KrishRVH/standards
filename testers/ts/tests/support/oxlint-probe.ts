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

export async function lintProbe(source: string, requestedPath = 'src/lint-probe.ts'): Promise<LintMessage[]> {
  const extension = path.extname(requestedPath);
  const stem = requestedPath.slice(0, -extension.length);
  const probePath = `${stem}.${crypto.randomUUID()}${extension}`;
  const absoluteProbePath = path.join(projectRoot, probePath);
  await writeFile(absoluteProbePath, source, 'utf8');

  try {
    const child = Bun.spawn([oxlint, '--format', 'json', probePath], {
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

    return report.diagnostics.map((diagnostic) => ({
      message: diagnostic.message,
      ruleId: normalizedRuleId(diagnostic.code),
      severity: diagnostic.severity === 'error' ? 2 : 1,
    }));
  } finally {
    await unlink(absoluteProbePath);
  }
}
