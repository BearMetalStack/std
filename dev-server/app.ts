import type { DevServerFactory } from "@bearmetal/app/serve";
import { devServerSourceUrl } from "./client.ts";
import { devServerModule } from "./module.ts";

/**
 * The dev server, shaped for `appModule()` from `@bearmetal/app/serve`.
 *
 * ```ts
 * router.use(appModule({ devServer: appDevServer }));
 * ```
 *
 * `appModule()` stages the app's client code in one directory and references
 * the entry itself, so the server neither injects the entry nor mounts a
 * catch-all — it answers only under `/@bearmetal/dev-server/*`.
 */
export const appDevServer: DevServerFactory = ({ root, entry, transform }) => ({
	module: devServerModule({ root, entry, transform, injectEntry: false, mount: false }),
	sourceUrl: devServerSourceUrl,
});
