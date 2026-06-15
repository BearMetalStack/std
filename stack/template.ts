import { joinPath } from "@bearmetal/miscellanea";

import type { DenoConfig } from "./denoConfig.ts";
import type { flags } from "./flags.ts";

type MainTemplateOpts = flags;

interface MainTemplate {
	imports: [specifier: string, names: string[]][];
	middleware: string[];
}

const optional: Partial<
	{
		[key in keyof flags]: (
			i: MainTemplate["imports"],
			m: MainTemplate["middleware"],
			opts: MainTemplateOpts,
			files: FileBuilder[],
		) => void;
	}
> = {
	db(i, m, opts) {
		i.push(["@bearmetal/db", ["dbModule"]]);
		m.push(`.use(dbModule("${opts.db}"))`);
	},
	devProxy(i, m, opts) {
		i.push(["@bearmetal/devproxy", ["devProxyModule"]]);
		m.push(`.use(devProxyModule("${opts.devProxy}"))`);
	},
	auth(i, m) {
		i.push(["@bearmetal/auth", ["authModule"]]);
		i.push(["@bearmetal/forge", ["s"]]);
		m.push(`.use(authModule(s.object({ username: s.string() })))`);
	},
};

type FileBuilder = [string, () => string | Promise<string>];
export function buildMainTs(opts: MainTemplateOpts): FileBuilder[] {
	const t: MainTemplate = {
		imports: [],
		middleware: [],
	};

	const files: FileBuilder[] = [];

	for (const [key, fn] of Object.entries(optional)) {
		if (opts[key as keyof flags]) {
			fn(t.imports, t.middleware, opts, files);
		}
	}

	const importLines = t.imports
		.map(([spec, names]) => `import { ${names.join(", ")} } from "${spec}";`)
		.join("\n");

	const routerSetup = t.middleware.length > 0 ? `\n${t.middleware.join("\n\t")}` : "";

	return [
		["main.ts", async () => {
			let t = await loadTemplateFile("main.ts");
			t = t.replace(/\n\/\/ @bearmetal imports/, importLines).replace(
				/\n\t\/\/ @bearmetal middleware/,
				routerSetup,
			);
			return t;
		}],

		// [
		// 	importLines,
		// 	"",
		// 	"const router = new Router();",
		// 	"",
		// 	routerSetup,
		// 	`router.route("/").get(() => Ok("Hello, World!"));`,
		// 	"",
		// 	"Deno.serve(router.handle.bind(router));",
		// 	"",
		// ].filter((line, i, arr) => {
		// 	return !(line === "" && arr[i - 1] === "");
		// }).join("\n")],
		[
			"app/main.tsx",
			() => loadTemplateFile("app/main.tsx"),
		],
		[
			"app/joke.tsx",
			() => loadTemplateFile("app/joke.tsx"),
		],
		[
			"components/counter.tsx",
			() => loadTemplateFile("components/counter.tsx"),
		],
		[
			"views/layouts/page.tsx",
			() => loadTemplateFile("views/layouts/page.tsx"),
		],
		[
			"views/home.tsx",
			() => loadTemplateFile("views/home.tsx"),
		],
		...files,
	];
}

export function denoJson(projectName: string, packages: Set<string>) {
	const imports: DenoConfig["imports"] = {
		"@app/": "app/",
		"@views/": "views/",
	};
	packages.forEach((pkg) => {
		imports[`${pkg}`] = `jsr:${pkg}`;
	});

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
		imports,
		compilerOptions: {
			jsx: "react-jsx",
			jsxImportSource: "@bearmetal/jsx",
			lib: ["deno.ns", "deno.window", "node", "dom"],
		},
	};

	return JSON.stringify(config, null, "\t");
}

async function loadTemplateFile(
	fileName: string,
	templateRoot = "examples/project",
): Promise<string> {
	const url = new URL(joinPath(templateRoot, fileName), import.meta.url);
	const response = await fetch(url);
	return await response.text();
}

if (import.meta.main) {
	const tpls = buildMainTs({ auth: false, db: false, devProxy: false, miscellanea: false });
	for (const [p, tpl] of tpls) {
		console.log(p, await tpl());
	}
}
