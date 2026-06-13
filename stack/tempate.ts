import { ts } from "@bearmetal/miscellanea";

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

type FileBuilder = [string, () => string];
export function buildMainTs(opts: MainTemplateOpts): FileBuilder[] {
	const t: MainTemplate = {
		imports: [["@bearmetal/router", ["Ok", "Router"]]],
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

	const routerSetup = t.middleware.length > 0 ? `router\n\t${t.middleware.join("\n\t")};\n` : "";

	return [
		["main.ts", () =>
			[
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
				return !(line === "" && arr[i - 1] === "");
			}).join("\n")],
		[
			"app/main.tsx",
			() =>
				ts`
					import { BMElement, define } from "@bearmetal/app";

					@define("app-main", import.meta)
					export class App extends BMElement {
						#count = this.signal(0);

						change(amount: number) {
							return () => this.#count.set(this.#count.get() + amount);
						}

						override get template() {
							return (
								<>
									<h1>BearMetal App Counter</h1>
									<div>
										<button
											type="button"
											class="down"
											onClick={this.change(-1)}
										>
											-
										</button>
										<span>{this.#count}</span>
										<button
											type="button"
											onClick={this.change(1)}
										>
											+
										</button>
									</div>
								</>
							);
						}
					}
					`,
		],
		["views/layouts/Document.tsx", () => ""],
		[
			"views/home.tsx",
			() =>
				ts`
					import { Page } from "@bearmetal/app/ssr";

					import { App } from "@app/main.tsx"

					export const home = Page(() => <App />)
				`,
		],
		[
			"components/counter.tsx",
			() => ts``,
		],
		...files,
	];
}

export function denoJson(projectName: string, packages: Set<string>) {
	const imports: DenoConfig["imports"] = {
		"@app": "app/",
		"@views": "views/",
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
