/**
 * The building blocks of `appModule()` and `buildApp()`, for packages that build
 * or serve an app's client some other way — a native host that bundles the
 * client in-process from its embedded filesystem, say, or a bundler other
 * than `Deno.bundle`.
 *
 * A producer discovers the client ({@linkcode discoverClient}), bundles it
 * however it likes (stripping server code with {@linkcode stripServerCode}),
 * and hands the result to {@linkcode clientModule}, which serves it exactly
 * as `appModule()` does.
 *
 * **Not covered by semver.** This is the package's own wiring, exposed so it
 * doesn't have to be copied. Anything here can change shape in any release.
 *
 * @module
 */

export { type ClientBuild, clientModule } from "./serve/client.tsx";
export { fingerprint, type ImportFn } from "./serve/endpoint.tsx";
export {
	appJsxImportSource,
	clientEntrySource,
	type ClientFile,
	type ClientSources,
	defaultBundleName,
	discoverClient,
	findAppDir,
	findComponentsDir,
	findPagesDir,
} from "./serve/discovery.ts";
export { serverOnlyNames } from "./ssr/bundle.ts";
export { stripServerCode } from "./ssr/mod.ts";
export { getAllStylesheets } from "./define.ts";
