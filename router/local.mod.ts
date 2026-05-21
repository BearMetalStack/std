// util/join.ts
function joinPath(...paths) {
  const leading = paths[0]?.startsWith("/") ?? false;
  const segments = paths.flatMap((p) => p.split("/")).reduce((a, b) => {
    if (b === ".." || a.at(-1) === "*") a.pop();
    else if (b !== "." && b !== "") a.push(b);
    return a;
  }, []);
  return (leading ? "/" : "") + segments.join("/");
}

// util/response.ts
var NotFound = (msg) => new Response(msg ?? "Not Found", {
  status: 404
});
var MethodNotAllowed = (msg) => new Response(msg ?? "Method Not Allowed", {
  status: 405
});
var InternalError = (msg) => new Response(msg ?? "Internal Server Error", {
  status: 500
});

// util/contentType.ts
function getContentTypeByExtension(extension) {
  switch (extension) {
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "text/javascript";
    case "json":
      return "application/json";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "txt":
    case "md":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

// util/static.ts
async function fileResponse(path) {
  const file = await Deno.readFile(path);
  const ext = path.split(".").at(-1);
  return new Response(file, {
    headers: {
      "Content-Type": getContentTypeByExtension(ext)
    }
  });
}
async function resolveStaticFile(dir, root, pathname, spa, showIndex) {
  let normalizedPath = spa ? joinPath(dir, pathname.split("/").pop()) : (dir + "/" + pathname.replace(new RegExp("^" + root), "")).trim().replace("//", "/").replace(/\/\s?$/, "");
  let fileInfo;
  try {
    fileInfo = await Deno.stat(normalizedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return spa ? fileResponse(dir + "/index.html") : NotFound();
    }
    throw error;
  }
  if (fileInfo.isDirectory) {
    if (!showIndex && !spa) return NotFound();
    normalizedPath += "/index.html";
  }
  try {
    return await fileResponse(normalizedPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return spa ? fileResponse(dir + "/index.html") : NotFound();
    }
    throw e;
  }
}

// logstyles.ts
function stylizer(s, style) {
  return `\x1B${style}${s}\x1B[0m`;
}
var colors = {
  reset: `0`,
  bold: `1`,
  dim: `2`,
  italic: `3`,
  underline: `4`,
  inverse: `7`,
  hidden: `8`,
  black: `30`,
  red: `31`,
  green: `32`,
  yellow: `33`,
  blue: `34`,
  magenta: `35`,
  cyan: `36`,
  white: `37`,
  bgBlack: `40`,
  bgRed: `41`,
  bgGreen: `42`,
  bgYellow: `43`,
  bgBlue: `44`,
  bgMagenta: `45`,
  bgCyan: `46`,
  bgWhite: `47`
};
var styles = {
  status: {
    "200": `[${colors.green};${colors.bold}m`,
    "400": `[${colors.yellow};${colors.bold}m`,
    "500": `[${colors.red};${colors.bold}m`,
    default: `[${colors.white};${colors.bold}m`
  },
  method: {
    GET: `[${colors.black};${colors.bgGreen}m`,
    POST: `[${colors.black};${colors.bgBlue}m`,
    PUT: `[${colors.black};${colors.bgCyan}m`,
    PATCH: `[${colors.black};${colors.bgMagenta}m`,
    DELETE: `[${colors.black};${colors.bgRed}m`,
    OPTIONS: `[${colors.black};${colors.bgYellow}m`,
    _use: `[${colors.black};${colors.bgWhite}m`,
    default: `[${colors.black};${colors.bgWhite}m`
  },
  path: {
    GET: `[${colors.blue};${colors.italic}m`,
    POST: `[${colors.blue};${colors.italic}m`,
    PUT: `[${colors.blue};${colors.italic}m`,
    PATCH: `[${colors.blue};${colors.italic}m`,
    DELETE: `[${colors.blue};${colors.italic}m`,
    OPTIONS: `[${colors.blue};${colors.italic}m`,
    _use: `[${colors.blue};${colors.italic}m`,
    default: `[${colors.blue};${colors.italic}m`
  },
  param: {
    GET: `[${colors.cyan}m`,
    POST: `[${colors.cyan}m`,
    PUT: `[${colors.cyan}m`,
    PATCH: `[${colors.cyan}m`,
    DELETE: `[${colors.cyan}m`,
    OPTIONS: `[${colors.cyan}m`,
    _use: `[${colors.cyan}m`,
    default: `[${colors.cyan}m`
  }
};
function styleAlias(section, style) {
  if (section === "status") {
    style = (Math.floor(Number(style) / 100) * 100).toString();
  }
  return styles[section][style] ?? styles[section]["default"];
}

// router.ts
var GET = "GET";
var POST = "POST";
var PUT = "PUT";
var PATCH = "PATCH";
var DELETE = "DELETE";
var OPTIONS = "OPTIONS";
var _use = "_use";
var allMethods = [
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  OPTIONS,
  _use
];
var Router = class _Router {
  routes = /* @__PURE__ */ new Map();
  trailingSlash = false;
  services = /* @__PURE__ */ new Map();
  registerService(name, service) {
    this.services.set(name, service);
  }
  /**
   * Define a route and configure handlers per HTTP method.
   *
   * @example
   * ```ts
   * router.route('/users')
   *   .get((ctx) => new Response('GET /users'))
   *   .post((ctx) => new Response('POST /users'));
   * ```
   */
  route(path) {
    path = fixPath(path);
    const routeConfig = this.getOrCreateConfig(path);
    const configurator = {
      get: (...handlers) => {
        this.getOrCreateConfigHandlers(GET, routeConfig).push(...handlers);
        return configurator;
      },
      post: (...handlers) => {
        this.getOrCreateConfigHandlers(POST, routeConfig).push(...handlers);
        return configurator;
      },
      put: (...handlers) => {
        this.getOrCreateConfigHandlers(PUT, routeConfig).push(...handlers);
        return configurator;
      },
      patch: (...handlers) => {
        this.getOrCreateConfigHandlers(PATCH, routeConfig).push(...handlers);
        return configurator;
      },
      delete: (...handlers) => {
        this.getOrCreateConfigHandlers(DELETE, routeConfig).push(...handlers);
        return configurator;
      },
      options: (...handlers) => {
        this.getOrCreateConfigHandlers(OPTIONS, routeConfig).push(...handlers);
        return configurator;
      },
      use: (...handlers) => {
        for (const handler of handlers) {
          if (handler instanceof _Router) {
            this.resolveRouterHandlerStack(path, handler);
            return configurator;
          }
          this.getOrCreateConfigHandlers(_use, routeConfig).push(handler);
        }
        return configurator;
      }
    };
    return configurator;
  }
  // --- Shorthand method registrations ---
  addRoute(method, pathOrHandler, handler) {
    const path = typeof pathOrHandler === "string" ? fixPath(pathOrHandler) : "/.*";
    if (typeof pathOrHandler !== "string") handler = pathOrHandler;
    this.getOrCreateConfigHandlers(method, this.getOrCreateConfig(path)).push(handler);
  }
  get(p, h) {
    this.addRoute(GET, p, h);
  }
  post(p, h) {
    this.addRoute(POST, p, h);
  }
  put(p, h) {
    this.addRoute(PUT, p, h);
  }
  patch(p, h) {
    this.addRoute(PATCH, p, h);
  }
  delete(p, h) {
    this.addRoute(DELETE, p, h);
  }
  options(p, h) {
    this.addRoute(OPTIONS, p, h);
  }
  use(pathOrHandler, handler) {
    if (typeof pathOrHandler !== "string") {
      handler = pathOrHandler;
      pathOrHandler = "/.*";
    } else {
      pathOrHandler = fixPath(pathOrHandler);
    }
    if (handler instanceof _Router) {
      return this.resolveRouterHandlerStack(pathOrHandler, handler);
    }
    this.getOrCreateConfigHandlers(_use, this.getOrCreateConfig(pathOrHandler)).push(handler);
  }
  // --- Logging ---
  /**
   * @unstable relies on the Temporal API, which is not stable yet
   */
  logALot(logging = true) {
    if (!logging) return;
    this.use(async (ctx, next) => {
      const res = await next();
      const { method } = ctx.request;
      console.log(`${stylizer(`[${method}]`, styles.method[method])} ${stylizer(ctx.url.pathname, styles.path.default)} :: ${stylizer(Temporal.Now.plainDateTimeISO().toString(), styles.param.default)} :: ${stylizer(res.status, styleAlias("status", res.status))}`);
      return res;
    });
  }
  logALittle(logging = true) {
    if (!logging) return;
    this.use(async (ctx, next) => {
      const { method } = ctx.request;
      console.log(`[${method}] ${ctx.url.pathname}`);
      return await next();
    });
  }
  // --- Request handling ---
  /** Returns a bound handler function suitable for use with `Deno.serve`. */
  get handle() {
    return this.handler.bind(this);
  }
  async handler(req) {
    const url = new URL(req.url.replace(/\/$/, this.trailingSlash ? "/" : ""));
    const method = req.method;
    const matchingRoutes = this.findMatchingRoutes(url);
    const matchingMethods = matchingRoutes.some((r) => Object.hasOwn(r.config.handlers, method));
    const middlewareStack = matchingRoutes.flatMap((r) => (r.config.handlers[_use] ?? []).concat(r.config.handlers[method] ?? [])).concat([
      () => matchingMethods ? NotFound() : MethodNotAllowed()
    ]);
    const ctx = {
      url,
      params: matchingRoutes.reduce((a, b) => ({
        ...a,
        ...b.params
      }), {}),
      state: {},
      request: req,
      getService: (name) => {
        const svc = this.services.get(name);
        if (!svc) throw new Error(`Service "${name}" not registered`);
        return svc;
      }
    };
    let index = 0;
    const executeMiddleware = async () => {
      if (index < middlewareStack.length) {
        const res = await middlewareStack[index++]?.(ctx, executeMiddleware);
        if (res instanceof Response) return res;
      }
      return new Response("End of stack", {
        status: 501
      });
    };
    try {
      return await executeMiddleware();
    } catch {
      return InternalError();
    }
  }
  findMatchingRoutes(url) {
    return this.routes.values().map((route) => {
      const result = route.pattern.exec(url);
      if (result) {
        return {
          config: route,
          params: result.pathname.groups
        };
      }
    }).filter((r) => !!r).toArray();
  }
  // --- Static file serving ---
  /**
   * Serve a directory as static files.
   *
   * @param dir  Filesystem path to the directory
   * @param root URL path prefix to mount the directory under
   *
   * @example
   * ```ts
   * router.serveDirectory('./public', '/public');
   * ```
   */
  serveDirectory(dir, root, { flatten = false, showIndex = false, spa = false, queryable = false } = {}) {
    let effectiveDir = dir;
    if (flatten) {
      effectiveDir = flatten instanceof RegExp ? dir.replace(flatten, "") : dir.split("/").at(-1) ?? dir;
    }
    if (queryable) {
      this.get(root + "/_dir", async () => {
        const files = [];
        for await (const entry of Deno.readDir(effectiveDir)) {
          files.push(joinPath(entry.name));
        }
        return new Response(JSON.stringify(files), {
          headers: {
            "Content-Type": "application/json"
          }
        });
      });
    }
    this.route(root + "*").get((ctx) => resolveStaticFile(effectiveDir, root, ctx.url.pathname, spa, showIndex));
  }
  // --- Internal helpers ---
  get rawRoutes() {
    return this.routes.entries();
  }
  getOrCreateConfig(path) {
    let config = this.routes.get(path);
    if (!config) {
      config = {
        handlers: {},
        pattern: new URLPattern({
          pathname: path
        })
      };
      this.routes.set(path, config);
    }
    return config;
  }
  getOrCreateConfigHandlers(method, config) {
    config.handlers[method] ??= [];
    return config.handlers[method];
  }
  resolveRouterHandlerStack(path, router) {
    for (const route of router.rawRoutes) {
      const p = joinPath(path, route[0]).replace(/\/$/, this.trailingSlash ? "/" : "");
      const thisConfig = this.getOrCreateConfig(p);
      const thatConfig = route[1];
      for (const method of allMethods) {
        if (!thatConfig.handlers[method]) continue;
        thisConfig.handlers[method] = (thisConfig.handlers[method] ?? []).concat(thatConfig.handlers[method]);
      }
    }
  }
};
function fixPath(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

// service.ts
function createServiceToken(name) {
  return name;
}
function createService(actions) {
  return {
    invoke(action, ...args) {
      const fn = actions[action];
      if (!fn) throw new Error(`Action "${String(action)}" not found on service`);
      return fn(...args);
    }
  };
}

// mod.ts
var mod_default = Router;
export {
  Router,
  createService,
  createServiceToken,
  mod_default as default
};
