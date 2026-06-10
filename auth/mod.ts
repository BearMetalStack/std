import {
	type Infer,
	Module,
	NoContent,
	Ok,
	type Schema,
	type Service,
	Unauthorized,
} from "@bearmetal/router";
import { type DBServiceActions, dbToken, m, s } from "@bearmetal/db";
import { SignInPage } from "./views/SignInPage.tsx";
import { Layout, Page } from "@bearmetal/app/ssr";
import { mainLayout } from "./layouts/main.tsx";
import { Password } from "./password.ts";
import { Token } from "./token.ts";
import { Cookie } from "./cookies.ts";

export type AuthState<T extends Infer<Schema<unknown>>> = {
	user: {
		alias: string;
		id: string;
	} & T;
	session: string;
};

const userSignInSchema = s.formData({
	redirectUrl: s.optional(s.string()),
	alias: s.string(),
	password: s.string(),
});

const cookieName = "BM_AUTH_TOKEN";

let db: Service<DBServiceActions>;
export function authModule<T extends Schema<unknown>>(
	includeInToken: (keyof Infer<T>)[] = [],
	_userSchema?: T,
): Module<
	AuthState<Infer<T>>
> {
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
				m.change("users__02", [
					m.addColumn("bma_users", "password", s.optional(s.string())),
				]),
				m.create("sessions__0001", {
					table: "bma_sessions",
					schema: s.object({
						token: s.string(),
						data: s.optional(s.string()),
					}),
					primaryKey: "token",
				}),
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
			const rows = await db.invoke("table", "bma_sessions").select(["data"]).where({ token })
				.query as { data: string }[];
			if (rows.length > 0) {
				ctx.state.user = Token.parse(token);
				ctx.state.session = rows[0].data;
			}
		}
		return await next();
	});
	module
		.route("/__auth/login")
		.get(
			Page(
				SignInPage({
					buttonText: "Sign In",
					switchPage: ["/__auth/signup", "Don't have an account yet? Sign Up"],
					submitUrl: "/__auth/login",
				}),
			),
		)
		.post(
			userSignInSchema,
			async (ctx) => {
				const db = ctx.getService(dbToken);
				const { alias, password } = ctx.body;
				const user = await db.invoke("table", "bma_users").select(
					["alias", "password", ...includeInToken] as string[],
				).where(
					{
						alias,
					},
				).query as Partial<Infer<typeof userSignInSchema>>;
				if (!user || !await Password.verify(password, user.password!)) {
					return Unauthorized(new Error("Invalid credentials"));
				}
				delete user.password;
				const token = await Token.create(user);
				await db.invoke("table", "bma_sessions").upsert({ token, data: "" }, ["token"]);
				return Ok(
					new Headers({
						"Set-Cookie": Cookie({
							name: cookieName,
							value: token,
							httpOnly: true,
							secure: true,
						}),
						"Location": ctx.body.redirectUrl || "/",
					}),
				);
			},
		);
	module.route("/__auth/signup")
		.get(
			Page(
				SignInPage({
					buttonText: "Sign Up",
					switchPage: ["/__auth/login", "Already have an account? Sign In"],
					submitUrl: "/__auth/signup",
				}),
			),
		)
		.post(
			userSignInSchema,
			async (ctx) => {
				const db = ctx.getService(dbToken);
				const { alias, password, redirectUrl } = ctx.body;
				const id = crypto.randomUUID();
				const hashedPassword = await Password.hash(password);
				await db.invoke("table", "bma_users").upsert({ id, alias, password: hashedPassword });
				const token = await Token.create({ alias, id });
				await db.invoke("table", "bma_sessions").upsert({ token, data: "" }, ["token"]);
				return Ok(
					new Headers({
						"Set-Cookie": Cookie({
							name: cookieName,
							value: token,
							httpOnly: true,
							secure: true,
						}),
						"Location": redirectUrl || "/",
					}),
				);
			},
		);
	module.route("/__auth/me")
		.use(async (ctx, next) => {
			if (!ctx.state.user) return Unauthorized();
			return await next();
		})
		.get((ctx) => Ok(ctx.state.user!));
	module.route("/__auth/me/session")
		.use(async (ctx, next) => {
			if (!ctx.state.user) return Unauthorized();
			return await next();
		})
		.get((ctx) => Ok(ctx.state.session!))
		.put(async (ctx) => {
			const db = ctx.getService(dbToken);
			const token = ctx.cookies.get(cookieName)!;
			await db.invoke("table", "bma_sessions").upsert({ token, data: "" }, ["token"]);
			ctx.state.session = "";
			return NoContent();
		})
		.patch(async (ctx) => {
			const db = ctx.getService(dbToken);
			const token = ctx.cookies.get(cookieName)!;
			const incoming = ctx.body as string;
			let newData: string;
			try {
				const current = JSON.parse(ctx.state.session as string || "{}");
				const patch = JSON.parse(incoming);
				newData = JSON.stringify({ ...current, ...patch });
			} catch {
				newData = incoming;
			}
			await db.invoke("table", "bma_sessions").upsert({ token, data: newData }, ["token"]);
			ctx.state.session = newData;
			return Ok(ctx.state.session!);
		});

	return module;
}
