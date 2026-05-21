import Router from "./router.old.ts";
import type { Handler, RouteConfigurator } from "./types.ts";
import { isRelativePath } from "./util/isRelativePath.ts";

function crawl(dir: string, callback: (path: string) => void) {
  for (const entry of Deno.readDirSync(dir)) {
    const path = Deno.build.os === "windows"
      ? `${dir}\\${entry.name}`
      : `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      crawl(path, callback);
    } else {
      callback(path);
    }
  }
}

/**
 * @example
 * ```ts
 * import {FileRouter} from "@bearmetal/router"
 *
 * const router = new FileRouter("dirName");
 * Deno.listen(router.handle);
 * ```
 */
export class FileRouter extends Router {
  constructor(root: string, _import?: (path: string) => Promise<unknown>) {
    super();
    crawl(root, async (path) => {
      let relativePath = path.replace(root, "").replace(/index\/?/, "");
      if (path.endsWith(".ts") || path.endsWith(".js")) {
        if (isRelativePath(path)) {
          path = Deno.build.os === "windows"
            ? `${Deno.cwd()}\\${path.replace(/^.?.?\\/, "")}`
            : `${Deno.cwd()}/${path.replace(/^.?.?\//, "")}`;
        }
        relativePath = relativePath.replace(/\.[tj]s/, "");
        const handlers = _import
          ? await _import(path)
          : await import("file://" + path);

        if (handlers.default) {
          handlers.default instanceof Router
            ? this.use(relativePath, handlers.default)
            : this.route(relativePath).get(handlers.default);
        }

        if (handlers.handlers) {
          for (const [method, handler] of Object.entries(handlers.handlers)) {
            this.route(relativePath)[method as keyof RouteConfigurator](
              handler as Handler,
            );
          }
        }
      }

      if (path.endsWith(".htm") || path.endsWith(".html")) {
        const headers = new Headers();
        headers.set("Content-Type", "text/html");
        this.route(relativePath).get((_ctx) => {
          return new Response(Deno.readTextFileSync(path), { headers });
        });
      }
    });

    if (Deno.env.get("BEARMETAL_ROUTER_DEBUG") === "true") {
      this.route("/debug/dump").get((_ctx) => {
        console.log("Dumping routes:");
        return new Response(
          this.routes.map((r) => r.pattern.pathname).join("\n"),
        );
      });
    }
  }
}

if (import.meta.main) {
  const router = new FileRouter("fileRouterTest");
  router.serveDirectory("docs", "/", { showIndex: true });
  Deno.serve({
    port: 8000,
    handler: router.handle,
  });
}
