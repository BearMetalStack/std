import { type Infer, Module, type Schema, type Service } from "@bearmetal/router";
import { type DBServiceActions, dbToken, m, s } from "@bearmetal/db";
import { Layout } from "@bearmetal/app/ssr";
import { mainLayout } from "./layouts/main.tsx";
import { Token } from "./token.ts";
import { type AuthConfig, cookieName, migrationsFor, routesFor } from "./methods.ts";

export type AuthState<T extends Infer<Schema<unknown>>> = {
	user: {
		alias: string;
		id: string;
	} & T;
	session: string;
};

const DEFAULT_METHODS: AuthConfig["methods"] = [{ type: "password" }];

let db: Service<DBServiceActions>;
export function authModule<T extends Schema<unknown>>(
	config?: AuthConfig<T>,
): Module<AuthState<Infer<T>>> {
	const methods = config?.methods ?? DEFAULT_METHODS!;
	const includeInToken = (config?.includeInToken ?? []) as string[];
	const module = new Module<AuthState<T>>();

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
				...migrationsFor(methods),
			]);
			try {
				await db.invoke("migrate");
			} catch (e) {
				console.log(e);
			}
		})
		.use(Layout(mainLayout));

	module.use(async (ctx, next) => {
		const token = ctx.cookies.get(cookieName);
		if (token) {
			const db = ctx.getService(dbToken);
			const rows = await db.invoke("table", "bma_sessions").where({ token }).select(["data"]).query;
			if (rows.length > 0) {
				ctx.state.user = Token.parse(token);
				ctx.state.session = rows[0].data ?? "";
			}
		}
		return await next();
	});

	const authRoute = module.route("/__auth");
	for (const subModule of routesFor(methods, { includeInToken })) {
		authRoute.use(subModule);
	}

	return module;
}
