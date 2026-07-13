import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import {
	Html as HTMLRes,
	type RouterContext,
	type RouterHandler,
	type StateType,
} from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import { getComponentUrl, getTagStylesheet } from "../define.ts";
import { stripServerCode } from "./stripServer.ts";

export type LayoutState = {
	layout?: LayoutEl;
};
export type LayoutEl = (props: {
	children: JSX.Element;
	title: string;
	theme?: string;
	description?: string;
}) => JSX.Element;

export function Layout<T extends StateType>(
	jsx: LayoutEl,
): RouterHandler<T & LayoutState> {
	return async (ctx, next) => {
		(ctx.state as T & LayoutState).layout = jsx;
		return await next();
	};
}
const tagRx = /<(?<tag>[a-z\-]+?)[>\s]/ig;
const endHeadRx = /<\/head>/;

export function Page<T extends StateType>(
	render: (ctx: RouterContext<T>) => JSX.Element,
	title = "BearMetal SSR",
): RouterHandler<T> {
	return async (ctx) => {
		const usedTags = new Set<string>();
		const layout = ctx.state.layout as LayoutState["layout"];
		const html = await render(ctx);
		if (typeof layout === "function") {
			const page = (await layout({ children: html, title })).toString();
			page.matchAll(tagRx).forEach((m: any) => usedTags.add(m.groups?.tag ?? ""));

			if (endHeadRx.test(page)) {
				const [scripttag, styletag] = await buildTagBundle(usedTags);

				return HTMLRes(
					"<!DOCTYPE html>" + page
						.replace(
							endHeadRx,
							styletag + scripttag + "</head>",
						),
				);
			}
			return HTMLRes(page);
		}
		if (endHeadRx.test(html.toString())) {
			const r = html.toString();
			r.matchAll(tagRx).forEach((m: any) => usedTags.add(m.groups?.tag ?? ""));
			const [scripttag, styletag] = await buildTagBundle(usedTags);
			return HTMLRes(
				r
					.replace(
						endHeadRx,
						`${styletag}${scripttag}</head>`,
					),
			);
		}
		return HTMLRes(html.toString());
	};
}
async function buildTagBundle(usedTags: Set<string>) {
	const componentUrls = usedTags.values().map(getComponentUrl).filter(Boolean)
		.toArray() as string[];
	const componentStyles = usedTags.values()
		.map(getTagStylesheet)
		.filter((s): s is string => s != null).toArray()
		.join("\n");
	const [scripttag, styletag] = await buildBundle(componentUrls);
	return [
		scripttag.entries().filter(([k]) => !k.match(/-.*\.js/)).map(([_, s]) =>
			`<script type="module">${s}</script>`
		).toArray().join(""),
		`<style>${componentStyles}${styletag}</style>`,
	];
}
export async function buildBundle(
	componentUrls: string[],
): Promise<[Map<string, string>, string]> {
	const scripttag: Map<string, string> = new Map();

	if (componentUrls.length === 0) return [scripttag, ""];
	const entry = await Deno.makeTempFile({ suffix: ".tsx" });
	await Deno.writeTextFile(
		entry,
		`
         /** @jsxRuntime automatic */
         /** @jsxImportSource jsr:@bearmetal/jsx/client */
         ${componentUrls.map((url) => `import "${url}"`).join("\n")}
        `,
	);
	const bundle = await Deno.bundle({
		entrypoints: [entry, "jsr:@bearmetal/app", "jsr:@bearmetal/app/signals"],
		write: false,
		codeSplitting: true,
		platform: "browser",
		outputDir: "scripts",
		minify: !isDev(),
		sourcemap: isDev() ? "inline" : undefined,
	});

	let styletag = "";
	for (const b of bundle.outputFiles ?? []) {
		if (b.path.endsWith(".css")) {
			styletag = b.text();
		} else {
			let t = b.text();
			t = stripServerCode(t, { names: ["serverRender", "serverLoad", "stylesheet"] });

			const p = b.path.split("/").pop()!;
			scripttag.set(p, t);
			// await Deno.mkdir("dist", { recursive: true });
			// Deno.writeTextFile(`dist/${p}`, t);
		}
	}

	Deno.remove(entry);

	return [scripttag, styletag];
}
/** Emitted files from a bundle: script text keyed by output filename, plus concatenated CSS. */
export type BundleOutput = {
	scripts: Map<string, string>;
	styles: string;
};

/**
 * Bundles a set of entrypoints in a single pass, with code splitting on.
 *
 * Anything shared by two or more entrypoints — including the `@bearmetal/app`
 * runtime and its signals, which every component pulls in — is hoisted into a
 * `chunk-*.js` output that each entry imports by relative path. Serve every
 * output from the same URL directory and those relative imports resolve.
 *
 * Entry outputs are named after their entrypoint's basename, so callers can map
 * an output back to the entrypoint that produced it.
 */
export async function bundleEntrypoints(entrypoints: string[]): Promise<BundleOutput> {
	const scripts = new Map<string, string>();
	if (entrypoints.length === 0) return { scripts, styles: "" };

	const bundle = await Deno.bundle({
		entrypoints,
		write: false,
		codeSplitting: true,
		platform: "browser",
		outputDir: "scripts",
		minify: !isDev(),
		sourcemap: isDev() ? "inline" : undefined,
	});

	let styles = "";
	for (const file of bundle.outputFiles ?? []) {
		const name = file.path.split("/").pop()!;
		if (name.endsWith(".css")) {
			styles += file.text();
			continue;
		}
		scripts.set(name, stripServerCode(file.text(), { names: serverOnlyNames }));
	}

	return { scripts, styles };
}

const serverOnlyNames = ["serverRender", "serverLoad", "stylesheet"];

const imports = new Set<string>();
export function getImports(): string[] {
	return imports.values().toArray();
}
export function addImport(url: string) {
	imports.add(url);
}

// if (import.meta.main) {
// 	const router = new Router();
// 	router.use(Layout(({ children }) => (
// 		<html>
// 			<head>
// 				<title></title>
// 			</head>
// 			<body>{children}</body>
// 		</html>
// 	))).route("/").get<{ name: string | undefined }>(
// 		Page((ctx) => <h1>Hello, {ctx.state.name ?? "World"}!</h1>),
// 	);
// 	Deno.serve(router.handle.bind(router));
// }
