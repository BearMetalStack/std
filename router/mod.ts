/**
 * @module
 * BearMetal Router, for routing HTTP requests with Deno.serve
 */

import { Router } from "./router.ts";

export * from "./router.ts";
export * from "./module.ts";
export * from "./schema.ts";
export * from "./util/response.ts";
export { createService, createServiceToken } from "./service.ts";
export default Router;
// export { FileRouter } from "./file_router.ts";
