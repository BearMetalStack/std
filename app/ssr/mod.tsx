// @jsxImportSource @bearmetal/jsx/server
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import {
	Html as HTMLRes,
	Router,
	type RouterContext,
	type RouterHandler,
	type StateType,
} from "@bearmetal/router";

export type LayoutState = {
	layout?: Layout;
};
type Layout = (props: {
	children: JSX.Element;
}) => JSX.Element;

export function Layout<T extends StateType>(
	jsx: (props: { children: JSX.Element }) => JSX.Element,
): RouterHandler<T & LayoutState> {
	return async (ctx, next) => {
		(ctx.state as T & LayoutState).layout = jsx;
		return await next();
	};
}

export function Page<T extends StateType>(
	render: (ctx: RouterContext<T>) => JSX.Element,
): RouterHandler<T> {
	return async (ctx) => {
		const layout = ctx.state.layout as LayoutState["layout"];
		const html = await render(ctx);
		if (typeof layout === "function") {
			return HTMLRes((await layout({ children: html })).toString());
		}
		return HTMLRes(html.toString());
	};
}

if (import.meta.main) {
	const router = new Router();
	router.use(Layout(({ children }) => (
		<html>
			<head>
				<title></title>
			</head>
			<body>{children}</body>
		</html>
	))).route("/").get<{ name: string | undefined }>(
		Page((ctx) => <h1>Hello, {ctx.state.name ?? "World"}!</h1>),
	);
	Deno.serve(router.handle.bind(router));
}
