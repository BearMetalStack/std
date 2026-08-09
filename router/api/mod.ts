/**
 * @module
 * BearMetal API contracts - one declaration, a typed client and a typed server.
 *
 * This entry point is isomorphic. It never touches `Deno`, so it bundles for the
 * browser. The server half lives behind `@bearmetal/router/api/server`.
 *
 * @example
 * ```ts
 * // api.ts - imported by both halves
 * import { defineApi } from "@bearmetal/router/api";
 * import { s } from "@bearmetal/router";
 *
 * const User = s.object({ id: s.string(), name: s.string() });
 * const ApiError = s.object({ code: s.string() });
 *
 * export const api = defineApi()
 *   .route("/users", "users")
 *     .get(s.query({ page: s.number().coerce().optional() }), s.array(User))
 *     .post(s.object({ name: s.string() }), { 201: User, 409: ApiError })
 *   .route("/users/:id", "user")
 *     .get(undefined, { 200: User, 404: ApiError })
 *   .build();
 * ```
 *
 * @example
 * ```ts
 * // server.ts
 * import { createApiModule } from "@bearmetal/router/api/server";
 * import { Created, Ok, NotFound } from "@bearmetal/router/response";
 * import { api } from "./api.ts";
 *
 * export default createApiModule(api, {
 *   users: {
 *     get: (ctx) => Ok(listUsers(ctx.input.page)),
 *     post: (ctx) => Created(createUser(ctx.input)),
 *   },
 *   user: {
 *     get: (ctx) => {
 *       const user = findUser(ctx.params.id);
 *       return user ? Ok(user) : NotFound({ code: "no_such_user" });
 *     },
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * // anywhere on the client
 * import { api } from "./api.ts";
 *
 * const result = await api.user({ id }).get();
 * if (result.status === 200) console.log(result.data.name);
 * else console.warn(result.data.code);
 * ```
 */

export { type ApiBuilder, defineApi } from "./spec.ts";
export { ApiContractError, createClient, defaultValidateResponses } from "./client.ts";
export { buildPath, readResponseBody, toFormData, toSearchParams } from "./encode.ts";
export type * from "./types.ts";
