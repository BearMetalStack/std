import { type Infer, Module, type Schema, type Service } from "@bearmetal/router";
import type { ObjectSchema, SchemaShape } from "@bearmetal/db";
import { type DBServiceActions, dbToken, m, s } from "@bearmetal/db";
import { Layout } from "@bearmetal/app/ssr";
import { mainLayout } from "./layouts/main.tsx";
import { Token } from "./token.ts";
import {
	type AuthConfig,
	cookieName,
	migrationsFor,
	type ResolvedAuthConfig,
	routesFor,
} from "./methods.ts";

export { type AuthConfig, cookieName, isSecure, type SignupInfo } from "./methods.ts";
export { Token } from "./token.ts";
export * from "./users.ts";

export type AuthState<T extends Infer<Schema<unknown>>> = {
	user: {
		alias: string;
		id: string;
	} & T;
	session: string;
};

const DEFAULT_METHODS: AuthConfig["methods"] = [{ type: "password" }];

/**
 * The user and session data a token belongs to, if it is genuine and its
 * session still exists.
 */
export async function sessionFor(
	db: Service<DBServiceActions>,
	token: string | undefined,
): Promise<
	{ user: { id: string; alias: string } & Record<string, unknown>; session: string } | undefined
> {
	if (!token || !await Token.verify(token)) return undefined;
	const rows = await db.invoke("table", "bma_sessions").where({ token }).select(["data"]).query;
	if (rows.length === 0) return undefined;
	return { user: Token.parse(token), session: rows[0].data as string ?? "" };
}

/**
 * {@linkcode sessionFor} for a raw `Request` — for code outside the router's
 * middleware chain, such as a WebSocket upgrade check.
 */
export async function userFromRequest(
	db: Service<DBServiceActions>,
	request: Request,
): Promise<({ id: string; alias: string } & Record<string, unknown>) | undefined> {
	const cookie = request.headers.get("cookie") ?? "";
	const token = cookie.split(/;\s*/).find((c) => c.startsWith(`${cookieName}=`))?.slice(
		cookieName.length + 1,
	);
	return (await sessionFor(db, token))?.user;
}

let db: Service<DBServiceActions>;
export function authModule<T extends ObjectSchema<SchemaShape> = ObjectSchema<SchemaShape>>(
	config?: AuthConfig<T>,
): Module<AuthState<Infer<T>>> {
	const methods = config?.methods ?? DEFAULT_METHODS!;
	const resolved: ResolvedAuthConfig = {
		includeInToken: (config?.includeInToken ?? []) as string[],
		secureCookies: config?.secureCookies ?? "auto",
		allowSignup: config?.allowSignup ?? true,
		onSignup: config?.user?.onSignup,
		pages: config?.pages ?? true,
		paths: {
			login: config?.paths?.login ?? "/__auth/login",
			signup: config?.paths?.signup ?? "/__auth/signup",
			afterLogout: config?.paths?.afterLogout ?? config?.paths?.login ?? "/__auth/login",
		},
	};
	if (config?.secret) Token.useSecret(config.secret);
	const module = new Module<AuthState<Infer<T>>>();

	module
		.onAdopted((parent) => {
			try {
				db = parent.getService(dbToken);
				console.log(
					"%c[BearMetal Auth]%c db service found!",
					"color: green",
					"color: white",
				);
			} catch {
				console.warn(
					"%c[BearMetal Auth]%c db service not found",
					"color: green",
					"color: red",
				);
				return false;
			}
			return true;
		})
		.onStart(async () => {
			if (config?.user?.schema) {
				const schema = config.user.schema;
				// An explicit id, so the extension sorts after the migrations that create
				// the table — the default `schema_<hash>` id would run before them.
				const id = `users__x_${fnv1a(JSON.stringify(schema.toJSONSchema()))}`;
				db.invoke("extend", {
					table: "bma_users",
					schema,
					migration: m.change(id, [{ kind: "extendTable", table: "bma_users", schema }]),
				});
			}
			db.invoke("registerMigrations", [
				m.create("users__0001", {
					table: "bma_users",
					schema: s.object({
						alias: s.string(),
						id: s.string().uuid(),
					}),
					primaryKey: "id",
				}),
				m.create("sessions__0001", {
					table: "bma_sessions",
					schema: s.object({
						token: s.string(),
						data: s.optional(s.string()),
					}),
					primaryKey: "token",
				}),
				m.change("sessions__0002", [
					m.addColumn("bma_sessions", "user_id", s.optional(s.string())),
					m.addIndex("bma_sessions", ["user_id"]),
				]),
				m.change("users__0002", [
					m.addIndex("bma_users", ["alias"], { unique: true }),
				]),
				...migrationsFor(methods),
			]);
			try {
				await db.invoke("migrate");
			} catch (e) {
				console.log(e);
			}
		});

	if (resolved.pages) module.use(Layout(mainLayout));

	module.use(async (ctx, next) => {
		const found = await sessionFor(ctx.getService(dbToken), ctx.cookies.get(cookieName));
		if (found) {
			ctx.state.user = found.user as AuthState<Infer<T>>["user"];
			ctx.state.session = found.session;
		}
		return await next();
	});

	const authRoute = module.route("/__auth");
	for (const subModule of routesFor(methods, resolved)) {
		authRoute.use(subModule);
	}

	return module;
}

function fnv1a(str: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
