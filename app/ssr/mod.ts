import type { JSX } from "@bearmetal/jsx/server/jsx-runtime";
import {
	Html as HTMLRes,
	type RouterContext,
	type RouterHandler,
	type StateType,
} from "@bearmetal/router";
import { getComponentUrl } from "../define.ts";

export type LayoutState = {
	layout?: LayoutEl;
};
export type LayoutEl = (props: {
	children: JSX.Element;
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
const bodyRx = /<\/body>/;

export function Page<T extends StateType>(
	render: (ctx: RouterContext<T>) => JSX.Element,
): RouterHandler<T> {
	return async (ctx) => {
		const usedTags = new Set<string>();
		const layout = ctx.state.layout as LayoutState["layout"];
		const html = await render(ctx);
		console.log(html.raw);
		if (typeof layout === "function") {
			const page = (await layout({ children: html })).toString();
			page.matchAll(tagRx).forEach((m) => usedTags.add(m.groups?.tag ?? ""));
			if (bodyRx.test(page)) {
				return HTMLRes(page.replace(bodyRx, `${await buildBundle(usedTags)}</body>`));
			}
			return HTMLRes(page);
		}
		if (bodyRx.test(html.toString())) {
			console.log(html.toString().matchAll(tagRx));
			return HTMLRes(html.toString().replace(bodyRx, await buildBundle(usedTags)));
		}
		return HTMLRes(html.toString());
	};
}

async function buildBundle(usedTags: Set<string>): Promise<string> {
	let scripttag = "";
	const componentUrls = usedTags.values().map(getComponentUrl).filter(Boolean).toArray();

	if (componentUrls.length === 0) return scripttag;
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
		entrypoints: [entry],
		write: false,
		codeSplitting: false,
		minify: false,
		platform: "browser",
	});

	for (const b of bundle.outputFiles ?? []) {
		scripttag = `<script type="module">${b.text()}</script>`;
	}

	return scripttag;
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
