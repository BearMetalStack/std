/**
 * The building blocks of `appModule()` and `buildApp()`, for packages that build
 * or serve an app's client some other way — a native host that embeds the
 * bundle in its binary, say, or a bundler other than `Deno.bundle`.
 *
 * **Not covered by semver.** This is the package's own wiring, exposed so it
 * doesn't have to be copied. Anything here can change shape in any release.
 *
 * @module
 */

export {
	AppModule,
	cache,
	componentHeadTags,
	componentsEndpoint,
	fingerprint,
	type ImportFn,
	pageDispatchHead,
	type RouteKeys,
	stylesheetName,
} from "./serve/endpoint.tsx";
export {
	appJsxImportSource,
	defaultBundleName,
	type Entrypoint,
	findAppDir,
	findComponentsDir,
	findPagesDir,
	localImportAliases,
	type Resolved,
	resolveEntrypoints,
	serveMap,
} from "./serve/discovery.ts";
export { manifestName, type PrebuiltManifest } from "./serve/build.ts";
export { serverOnlyNames } from "./ssr/bundle.ts";
export {
	contributeHead,
	contributeRouteHead,
	mirrorStripped,
	type StrippedTree,
	stripServerCode,
} from "./ssr/mod.ts";
export { getAllStylesheets } from "./define.ts";
