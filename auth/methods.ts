import { dbToken, m, type Migration, s, type TableRegistry } from "@bearmetal/db";
import {
	type Infer,
	Module,
	NoContent,
	Ok,
	type RouterContext,
	type Schema,
	Unauthorized,
} from "@bearmetal/router";
import { Page } from "@bearmetal/app/ssr";
import { Cookie } from "./cookies.ts";
import { Password } from "./password.ts";
import { Token } from "./token.ts";
import { SignInPage } from "./views/SignInPage.tsx";

// declare module "@bearmetal/db" {
// 	interface TableRegistry {
// 		bma_users: {
// 			id: string;
// 			alias: string;
// 			password?: string;
// 			google_id?: string;
// 			discord_id?: string;
// 			github_id?: string;
// 		};
// 		bma_sessions: { token: string; data?: string };
// 		bma_passkeys: {
// 			credential_id: string;
// 			user_id: string;
// 			public_key: string;
// 			counter: number;
// 		};
// 	}
// }

export const cookieName = "BM_AUTH_TOKEN";

// ─── Config types ─────────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "discord" | "github";

export type PasswordMethodConfig = { type: "password" };

export type PasskeyMethodConfig = {
	type: "passkey";
	rpId: string;
	rpName: string;
};

export type OAuthMethodConfig = {
	type: "oauth";
	providers: { provider: OAuthProvider; clientId: string; clientSecret: string }[];
};

export type AuthMethodConfig = PasswordMethodConfig | PasskeyMethodConfig | OAuthMethodConfig;

export type AuthConfig<T extends Schema<unknown> = Schema<unknown>> = {
	methods?: AuthMethodConfig[];
	includeInToken?: (keyof Infer<T>)[];
};

// ─── Migrations ───────────────────────────────────────────────────────────────

export function migrationsFor(methods: AuthMethodConfig[]): Migration[] {
	const migrations: Migration[] = [];

	for (const method of methods) {
		switch (method.type) {
			case "password":
				migrations.push(
					m.change("users__password", [
						m.addColumn("bma_users", "password", s.optional(s.string())),
					]),
				);
				break;

			case "passkey":
				migrations.push(
					m.create("passkeys__0001", {
						table: "bma_passkeys",
						schema: s.object({
							credential_id: s.string(),
							user_id: s.string().uuid(),
							public_key: s.string(),
							counter: s.number().int(),
						}),
						primaryKey: "credential_id",
						indexes: [{ columns: ["user_id"] }],
					}),
				);
				break;

			case "oauth":
				for (const { provider } of method.providers) {
					migrations.push(
						m.change(`users__oauth_${provider}`, [
							m.addColumn("bma_users", `${provider}_id`, s.optional(s.string())),
						]),
					);
				}
				break;
		}
	}

	return migrations;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// State shape expected to be present when route handlers run (set by the
// session middleware in the outer authModule).
type AuthedState = { user: Record<string, unknown>; session: string };

const userSignInSchema = s.formData({
	redirectUrl: s.optional(s.string()),
	alias: s.string(),
	password: s.string(),
});

export function routesFor(
	methods: AuthMethodConfig[],
	opts: { includeInToken: string[] },
): Module[] {
	const modules: Module[] = [meRoutesModule()];

	for (const method of methods) {
		switch (method.type) {
			case "password":
				modules.push(passwordRoutesModule(opts.includeInToken));
				break;
			case "passkey":
			case "oauth":
				// routes TBD
				break;
		}
	}

	return modules;
}

function meRoutesModule(): Module<AuthedState> {
	const guard = async (ctx: RouterContext<AuthedState>, next: () => Promise<Response>) => {
		if (!ctx.state.user) return Unauthorized();
		return await next();
	};

	const mod = new Module<AuthedState>();
	mod.route("/me")
		.use(guard)
		.get((ctx) => Ok(ctx.state.user!));
	mod.route("/me/session")
		.use(guard)
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
	mod.route("/logout")
		.post(async (ctx) => {
			const token = ctx.cookies.get(cookieName);
			if (token) {
				const db = ctx.getService(dbToken);
				await db.invoke("table", "bma_sessions").where({ token }).delete;
			}
			return Ok(
				new Headers({
					"Set-Cookie": Cookie({
						name: cookieName,
						value: "",
						maxAge: Temporal.Duration.from({ seconds: 0 }),
						httpOnly: true,
						secure: true,
					}),
					"Location": "/__auth/login",
				}),
			);
		});

	return mod;
}

function passwordRoutesModule(includeInToken: string[]): Module {
	const mod = new Module();

	mod.route("/login")
		.get(
			Page(
				SignInPage({
					buttonText: "Sign In",
					switchPage: ["/__auth/signup", "Don't have an account yet? Sign Up"],
					submitUrl: "/__auth/login",
				}),
			),
		)
		.post(userSignInSchema, async (ctx) => {
			const db = ctx.getService(dbToken);
			const { alias, password } = ctx.body;
			const user = await db.invoke("table", "bma_users").select(
				[
					"alias",
					"password",
					...includeInToken,
				] as (keyof TableRegistry["bma_users"])[] as string[],
			).where({ alias }).query as unknown as Partial<TableRegistry["bma_users"]>;
			if (!user || !await Password.verify(password, user.password!)) {
				return Unauthorized(new Error("Invalid credentials"));
			}
			delete user.password;
			const token = await Token.create(user);
			await db.invoke("table", "bma_sessions").upsert({ token, data: "" }, ["token"]);
			return Ok(
				new Headers({
					"Set-Cookie": Cookie({ name: cookieName, value: token, httpOnly: true, secure: true }),
					"Location": ctx.body.redirectUrl || "/",
				}),
			);
		});

	mod.route("/signup")
		.get(
			Page(
				SignInPage({
					buttonText: "Sign Up",
					switchPage: ["/__auth/login", "Already have an account? Sign In"],
					submitUrl: "/__auth/signup",
				}),
			),
		)
		.post(userSignInSchema, async (ctx) => {
			const db = ctx.getService(dbToken);
			const { alias, password, redirectUrl } = ctx.body;
			const id = crypto.randomUUID();
			const hashedPassword = await Password.hash(password);
			await db.invoke("table", "bma_users").upsert({ id, alias, password: hashedPassword });
			const token = await Token.create({ alias, id });
			await db.invoke("table", "bma_sessions").upsert({ token, data: "" }, ["token"]);
			return Ok(
				new Headers({
					"Set-Cookie": Cookie({ name: cookieName, value: token, httpOnly: true, secure: true }),
					"Location": redirectUrl || "/",
				}),
			);
		});

	return mod;
}
