import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import {
	Html as HTMLRes,
	type RouterContext,
	type RouterHandler,
	type StateType,
} from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import { getComponentUrl } from "../define.ts";

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
const bodyRx = /<body>/;
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
			page.matchAll(tagRx).forEach((m) => usedTags.add(m.groups?.tag ?? ""));
			if (bodyRx.test(page)) {
				const [scripttag, styletag] = await buildTagBundle(usedTags);
				return HTMLRes(
					"<!DOCTYPE html>" + page.replace(
						endHeadRx,
						`${styletag}${scripttag}</head>`,
					),
				);
			}
			return HTMLRes(page);
		}
		if (bodyRx.test(html.toString())) {
			const r = html.toString();
			r.matchAll(tagRx).forEach((m) => usedTags.add(m.groups?.tag ?? ""));
			const [scripttag, styletag] = await buildTagBundle(usedTags);
			return HTMLRes(
				r.replace(
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
	const [scripttag, styletag] = await buildBundle(componentUrls);
	return [
		scripttag.entries().filter(([k]) => !k.match(/-.*\.js/)).map(([_, s]) =>
			`<script type="module">${s}</script>`
		).toArray().join(""),
		`<style>${styletag}</style>`,
	];
}
export async function buildBundle(
	componentUrls: string[],
	bare = false,
): Promise<[Map<string, string>, string]> {
	const scripttag: Map<string, string> = new Map();

	if (componentUrls.length === 0) return [scripttag, ""];
	const entry = await Deno.makeTempFile({ suffix: ".tsx" });
	await Deno.writeTextFile(
		entry,
		`
         /** @jsxRuntime automatic */
         /** @jsxImportSource jsr:@bearmetal/jsx/client */
         ${bare ? "" : 'import "@bearmetal/webbies/style"'};
         ${componentUrls.map((url) => `import "${url}"`).join("\n")}
        `,
	);
	const bundle = await Deno.bundle({
		entrypoints: [entry, "jsr:@bearmetal/app", "jsr:@bearmetal/app/signals"],
		write: false,
		codeSplitting: true,
		minify: !isDev(),
		platform: "browser",
		outputDir: "scripts",
	});

	let styletag = "";
	for (const b of bundle.outputFiles ?? []) {
		if (b.path.endsWith(".css")) {
			styletag = b.text();
		} else {
			const t = b.text();
			t.matchAll(/@bearmetal\/[a-zA-Z\/\-]+/g).forEach(([m]) => m && addImport(m));

			scripttag.set(b.path.split("/").pop()!, t);
		}
	}

	Deno.remove(entry);

	return [scripttag, styletag];
}

const imports = new Set<string>();
export function getImports() {
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
