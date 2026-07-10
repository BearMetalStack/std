/**
 * Subprocess helpers.
 *
 * The previous `run()` in `version_bump.ts` returned only stdout and threw
 * away the exit code, so a failed `git commit` or a `git describe` with no
 * matching tag was indistinguishable from a command that printed nothing.
 * Callers here must decide explicitly which of those they mean.
 */

export interface CommandResult {
	success: boolean;
	code: number;
	stdout: string;
	stderr: string;
}

const decoder = new TextDecoder();

/** Runs a command to completion, capturing its output. Never throws on non-zero exit. */
export async function run(
	cmd: readonly string[],
	options: { cwd?: string } = {},
): Promise<CommandResult> {
	const { code, stdout, stderr } = await new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		cwd: options.cwd,
		stdout: "piped",
		stderr: "piped",
	}).output();

	return {
		success: code === 0,
		code,
		stdout: decoder.decode(stdout).trim(),
		stderr: decoder.decode(stderr).trim(),
	};
}

/** Runs a command, returning trimmed stdout; throws with stderr attached on failure. */
export async function runOrThrow(
	cmd: readonly string[],
	options: { cwd?: string } = {},
): Promise<string> {
	const result = await run(cmd, options);
	if (!result.success) {
		throw new Error(
			`command failed (exit ${result.code}): ${cmd.join(" ")}\n${result.stderr}`,
		);
	}
	return result.stdout;
}

/** Runs a command, returning trimmed stdout, or null when it exits non-zero. */
export async function runOrNull(
	cmd: readonly string[],
	options: { cwd?: string } = {},
): Promise<string | null> {
	const result = await run(cmd, options);
	return result.success ? result.stdout : null;
}

/**
 * Runs `tasks` with at most `limit` in flight, preserving input order in the
 * returned array. Keeps `deno check` from spawning one subprocess per package
 * at once, which is enough to exhaust memory on a workspace this size.
 */
export async function pooled<T>(
	tasks: readonly (() => Promise<T>)[],
	limit: number,
): Promise<T[]> {
	const results = new Array<T>(tasks.length);
	let next = 0;

	const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
		while (true) {
			const index = next++;
			if (index >= tasks.length) return;
			results[index] = await tasks[index]();
		}
	});

	await Promise.all(workers);
	return results;
}
