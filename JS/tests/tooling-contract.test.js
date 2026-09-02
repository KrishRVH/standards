import { expect, test } from "bun:test";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const knip = fileURLToPath(
	new URL("../node_modules/.bin/knip", import.meta.url),
);

/**
 * Run the dependency boundary against one temporary source file.
 *
 * @param {string} source - JavaScript source to analyze.
 */
async function dependencyProbe(source) {
	const probe = path.join(
		projectRoot,
		"src",
		`.dependency-probe-${crypto.randomUUID()}.js`,
	);
	await writeFile(probe, source, "utf8");

	try {
		const child = Bun.spawn([knip], {
			cwd: projectRoot,
			stderr: "pipe",
			stdout: "pipe",
		});
		const [code, stderr, stdout] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
			new Response(child.stdout).text(),
		]);
		return { code, output: `${stdout}\n${stderr}` };
	} finally {
		await unlink(probe);
	}
}

test("the dependency gate rejects installed but undeclared packages", async () => {
	const result = await dependencyProbe(
		'import debug from "debug";\nvoid debug;\n',
	);

	expect(result.code).not.toBe(0);
	expect(result.output).toContain("debug");
});

test("the dependency gate accepts declared packages", async () => {
	const result = await dependencyProbe(
		'import ts from "typescript";\nvoid ts;\n',
	);

	expect(result.code, result.output).toBe(0);
});
