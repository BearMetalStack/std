/**
 * A dev server for BearMetal apps: serves a directory or an SPA, swaps changed
 * stylesheets in place, and hot-replaces changed components.
 *
 * Mount {@linkcode devServerModule} into an app's router, or run the `bmdev`
 * binary for a standalone server.
 *
 * @module
 */

import { Router } from "@bearmetal/router";
import { devServerModule } from "./module.ts";

export { devServerModule } from "./module.ts";
export { devServerSourceUrl } from "./client.ts";
export type * from "./types.ts";

/**
 * Runs {@linkcode devServerModule} as its own server — the `bmdev` binary.
 *
 * `bmdev [root] [--entry=main.tsx] [--shell=index.html] [--port=8345]`
 */
export async function DevServer(args: string[] = Deno.args): Promise<void> {
	const flags = new Map<string, string>();
	const positional: string[] = [];
	for (const arg of args) {
		const m = arg.match(/^--([a-z]+)=(.*)$/);
		if (m) flags.set(m[1], m[2]);
		else positional.push(arg);
	}
	const router = new Router();
	router.use(devServerModule({
		root: positional[0] ?? ".",
		entry: flags.get("entry"),
		shell: flags.get("shell"),
	}));
	await Deno.serve({ port: Number(flags.get("port") ?? 8345) }, router.handle).finished;
}

export async function bundle(serveDir: string, entryPoint: string): Promise<string> {
	const tmp = await Deno.makeTempDir();
	const cmd = new Deno.Command("deno", {
		args: [
			"bundle",
			"--outdir",
			tmp,
			"--platform=browser",
			"--sourcemap=inline",
			"-o",
			entryPoint.replace(/\.tsx?$/, ".js"),
			entryPoint,
		],
		cwd: serveDir,
		stdout: "piped",
		stderr: "piped",
	});
	const r = await cmd.output();
	if (!r.success) throw new Error("Unable to bundle " + entryPoint);
	return tmp;
}

if (import.meta.main) {
	DevServer();
}
