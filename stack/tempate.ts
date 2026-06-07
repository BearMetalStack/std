import type { DenoConfig } from "./denoConfig.ts";
import type { flags } from "./flags.ts";

type MainTemplateOpts = flags;

interface MainTemplate {
	imports: [specifier: string, names: string[]][];
	middleware: string[];
}

export function buildMainTs(opts: MainTemplateOpts): string {
	const t: MainTemplate = {
		imports: [["@bearmetal/router", ["Ok", "Router"]]],
		middleware: [],
	};

	if (opts.db) {
		t.imports.push(["@bearmetal/db", ["dbModule"]]);
		t.middleware.push(`.use(dbModule("${opts.db}"))`);
	}

	// if (opts.auth) {
	// 	t.imports.push(["@bearmetal/auth", ["authModule"]]);
	// 	t.imports.push(["@bearmetal/forge", ["s"]]);
	// 	t.middleware.push(`.use(authModule(s.object({ username: s.string() })))`);
	// }

	const importLines = t.imports
		.map(([spec, names]) => `import { ${names.join(", ")} } from "${spec}";`)
		.join("\n");

	const routerSetup = t.middleware.length > 0 ? `router\n\t${t.middleware.join("\n\t")};\n` : "";

	return [
		importLines,
		"",
		"const router = new Router();",
		"",
		routerSetup,
		`router.route("/").get(() => Ok("Hello, World!"));`,
		"",
		"Deno.serve(router.handle.bind(router));",
		"",
	].filter((line, i, arr) => {
		// collapse consecutive empty lines
		return !(line === "" && arr[i - 1] === "");
	}).join("\n");
}

export function denoJson(projectName: string) {
	const config: DenoConfig = {
		name: projectName,
		tasks: {
			"bm:bootstrap": {
				description: "Bootstrap the BearMetal stack.",
				dependencies: ["bm:drip"],
			},
			"bm:drip": {
				description: "Generates theme completions and CSS",
				command: "deno run jsr:@bearmetal/drip",
			},
			"bm:dev": {
				description: "Starts the dev server",
				command: "deno run -P=dev main.ts",
			},
		},
		permissions: {
			dev: {
				read: true,
				net: true,
			},
		},
		compilerOptions: {
			jsx: "react-jsx",
			jsxImportSource: "@bearmetal/jsx",
			lib: ["deno.ns", "deno.window", "node", "dom"],
		},
	};

	return JSON.stringify(config, null, "\t");
}
