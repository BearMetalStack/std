import { dbToken, m, type Migration, type ObjectSchema, s, type SchemaShape } from "@bearmetal/db";
import {
	Forbidden,
	type Infer,
	Module,
	NoContent,
	Ok,
	type RouterContext,
	Unauthorized,
} from "@bearmetal/router";
import { Page } from "@bearmetal/app/ssr";
import { Cookie } from "./cookies.ts";
import { Password } from "./password.ts";
import { AliasTakenError, createUser, findUserRow, hasUsers, startSession } from "./users.ts";
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

export type AuthConfig<T extends ObjectSchema<SchemaShape> = ObjectSchema<SchemaShape>> = {
	methods?: AuthMethodConfig[];
	/** Extra `bma_users` fields to carry in the session token, readable from `ctx.state.user`. */
	includeInToken?: (keyof Infer<T> & string)[];
	/**
	 * The token signing secret. Falls back to `BM_TOKEN_SECRET`, then to a random
	 * per-process secret, which signs everyone out on restart.
	 */
	secret?: string;
	/**
	 * Whether cookies are `Secure`. `"auto"` (the default) sets it when the
	 * request arrived over https, directly or per `X-Forwarded-Proto` — a
	 * `Secure` cookie set over plain http is dropped by the browser, which makes
	 * signing in impossible on a LAN address.
	 */
	secureCookies?: boolean | "auto";
	/**
	 * Whether the public signup route accepts new accounts. A function is asked
	 * per request — e.g. `({ hasUsers }) => !hasUsers` to allow only the first.
	 * Defaults to `true`.
	 */
	allowSignup?: boolean | ((info: SignupInfo) => boolean | Promise<boolean>);
	/** App-defined user fields, and how a new user gets them. */
	user?: {
		/** Extra `bma_users` columns, added with `db.extend`. Keep them optional. */
		schema?: T;
		/** Values for those columns when someone signs up. */
		onSignup?: (
			info: SignupInfo & { alias: string },
		) => Record<string, unknown> | Promise<Record<string, unknown>>;
	};
	/**
	 * Serve the built-in sign-in and sign-up pages (`GET /__auth/login`,
	 * `/__auth/signup`). Turn off to render your own forms that post to the same
	 * routes; set `paths` so redirects land on them.
	 */
	pages?: boolean;
	/** Where to send the browser: the sign-in and sign-up pages, and after sign-out. */
	paths?: { login?: string; signup?: string; afterLogout?: string };
};

/** What `allowSignup` and `onSignup` are told about the request. */
export type SignupInfo = { ctx: AnyContext; hasUsers: boolean };

// deno-lint-ignore no-explicit-any
type AnyContext = RouterContext<any, any>;

/** {@linkcode AuthConfig} with every default filled in. */
export type ResolvedAuthConfig = {
	includeInToken: string[];
	secureCookies: boolean | "auto";
	allowSignup: NonNullable<AuthConfig["allowSignup"]>;
	onSignup?: NonNullable<AuthConfig["user"]>["onSignup"];
	pages: boolean;
	paths: { login: string; signup: string; afterLogout: string };
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

/** Whether a cookie set in answer to this request should be `Secure`. */
export function isSecure(ctx: AnyContext, setting: boolean | "auto"): boolean {
	if (setting !== "auto") return setting;
	const forwarded = ctx.request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
	return (forwarded ?? new URL(ctx.request.url).protocol.replace(":", "")) === "https";
}

export function sessionCookie(
	ctx: AnyContext,
	config: ResolvedAuthConfig,
	token: string,
	clear = false,
): string {
	return Cookie({
		name: cookieName,
		value: clear ? "" : token,
		httpOnly: true,
		secure: isSecure(ctx, config.secureCookies),
		sameSite: "Lax",
		path: "/",
		...(clear ? { maxAge: Temporal.Duration.from({ seconds: 0 }) } : {}),
	});
}

/** Only same-site paths, so a crafted `redirectUrl` cannot bounce a fresh session elsewhere. */
function safeRedirect(url: string | undefined): string {
	return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

/** `303 See Other`, which a browser follows with a GET after a form post. */
function seeOther(location: string, headers?: HeadersInit): Response {
	const h = new Headers(headers);
	h.set("Location", location);
	return new Response(null, { status: 303, headers: h });
}

function withError(path: string, error: string, redirectUrl?: string): string {
	const params = new URLSearchParams({ error });
	if (redirectUrl) params.set("redirectUrl", redirectUrl);
	return `${path}?${params}`;
}

export function routesFor(
	methods: AuthMethodConfig[],
	config: ResolvedAuthConfig,
): Module[] {
	const modules: Module[] = [meRoutesModule(config)];

	for (const method of methods) {
		switch (method.type) {
			case "password":
				modules.push(passwordRoutesModule(config));
				break;
			case "passkey":
			case "oauth":
				// routes TBD
				break;
		}
	}

	return modules;
}

function meRoutesModule(config: ResolvedAuthConfig): Module<AuthedState> {
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
			await db.invoke("table", "bma_sessions").upsert(
				{ token, data: "", user_id: (ctx.state.user as { id: string }).id },
				["token"],
			);
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
			await db.invoke("table", "bma_sessions").upsert(
				{ token, data: newData, user_id: (ctx.state.user as { id: string }).id },
				["token"],
			);
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
			return seeOther(config.paths.afterLogout, {
				"Set-Cookie": sessionCookie(ctx as AnyContext, config, "", true),
			});
		});

	return mod;
}

function passwordRoutesModule(config: ResolvedAuthConfig): Module {
	const mod = new Module();
	const { paths } = config;

	const signupAllowed = async (ctx: AnyContext) => {
		const allow = config.allowSignup;
		if (typeof allow === "boolean") return allow;
		const db = ctx.getService(dbToken);
		return await allow({ ctx, hasUsers: await hasUsers(db) });
	};

	if (config.pages) {
		mod.route("/login").get(
			Page(
				SignInPage({
					buttonText: "Sign In",
					switchPage: [paths.signup, "Don't have an account yet? Sign Up"],
					submitUrl: "/__auth/login",
				}),
			),
		);
		mod.route("/signup").get(
			Page(
				SignInPage({
					buttonText: "Sign Up",
					switchPage: [paths.login, "Already have an account? Sign In"],
					submitUrl: "/__auth/signup",
				}),
			),
		);
	}

	mod.route("/login")
		.post(userSignInSchema, async (ctx) => {
			const db = ctx.getService(dbToken);
			const { alias, password, redirectUrl } = ctx.body;
			const user = await findUserRow(db, alias.trim());
			if (!user?.password || !await Password.verify(password, user.password as string)) {
				return seeOther(withError(paths.login, "invalid", redirectUrl));
			}
			const token = await startSession(db, user, config.includeInToken);
			return seeOther(safeRedirect(redirectUrl), {
				"Set-Cookie": sessionCookie(ctx as AnyContext, config, token),
			});
		});

	mod.route("/signup")
		.post(userSignInSchema, async (ctx) => {
			if (!await signupAllowed(ctx as AnyContext)) {
				return Forbidden(new Error("Sign-up is closed"));
			}
			const db = ctx.getService(dbToken);
			const { alias, password, redirectUrl } = ctx.body;
			const extra = config.onSignup
				? await config.onSignup({ ctx: ctx as AnyContext, hasUsers: await hasUsers(db), alias })
				: {};
			let user;
			try {
				user = await createUser(db, { ...extra, alias, password });
			} catch (e) {
				const error = e instanceof AliasTakenError ? "taken" : "invalid";
				return seeOther(withError(paths.signup, error, redirectUrl));
			}
			const token = await startSession(db, user, config.includeInToken);
			return seeOther(safeRedirect(redirectUrl), {
				"Set-Cookie": sessionCookie(ctx as AnyContext, config, token),
			});
		});

	return mod;
}
