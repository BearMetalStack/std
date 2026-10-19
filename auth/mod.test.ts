import { assertEquals, assertMatch } from "@std/assert";
import { Router } from "@bearmetal/router";
import { dbModule, dbToken, s } from "@bearmetal/db";
import { authModule, createUser, deleteUser, listUsers, setPassword, updateUser } from "./mod.ts";

async function setup() {
	const dir = await Deno.makeTempDir();
	const router = new Router();
	router
		.use(dbModule("sqlite", { path: `${dir}/auth.sqlite` }))
		.use(authModule({
			secret: "test-secret",
			pages: false,
			paths: { login: "/login", signup: "/signup", afterLogout: "/login" },
			includeInToken: ["role"],
			allowSignup: ({ hasUsers }) => !hasUsers,
			user: {
				schema: s.object({ role: s.optional(s.string()) }),
				onSignup: ({ hasUsers }) => ({ role: hasUsers ? "user" : "admin" }),
			},
		}));
	router.route("/whoami").get((ctx) => {
		const user = (ctx.state as { user?: unknown }).user;
		return user ? Response.json(user) : new Response("anon", { status: 401 });
	});
	router.route("/users").get(async (ctx) =>
		Response.json(await listUsers(ctx.getService(dbToken)))
	);
	router.route("/admin/invite").post(async (ctx) => {
		const user = await createUser(ctx.getService(dbToken), {
			alias: "fox",
			password: "pw2",
			role: "user",
		});
		return Response.json(user);
	});
	router.route("/admin/demote").post(async (ctx) => {
		const db = ctx.getService(dbToken);
		const [admin] = (await listUsers(db)).filter((u) => u.alias === "bear");
		await updateUser(db, admin.id, { role: "user" });
		return new Response("ok");
	});
	await router.ready();
	const call = (path: string, init?: RequestInit) =>
		router.handle(new Request(`http://kk.local${path}`, init), {
			remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
		} as Deno.ServeHandlerInfo<Deno.NetAddr>);
	const form = (fields: Record<string, string>) => ({
		method: "POST",
		body: new URLSearchParams(fields),
		headers: { "content-type": "application/x-www-form-urlencoded" },
	});
	const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
	return { router, call, form, cookieOf, dir };
}

Deno.test("first signup becomes admin, then signup closes", async () => {
	const { call, form, cookieOf, dir } = await setup();

	const signup = await call(
		"/__auth/signup",
		form({ alias: "bear", password: "pw", redirectUrl: "/dash" }),
	);
	assertEquals(signup.status, 303);
	assertEquals(signup.headers.get("location"), "/dash");
	const cookie = cookieOf(signup);
	assertMatch(signup.headers.get("set-cookie")!, /HttpOnly/);
	assertEquals(
		/Secure/.test(signup.headers.get("set-cookie")!),
		false,
		"plain http must not get Secure",
	);

	const me = await call("/whoami", { headers: { cookie } });
	const user = await me.json();
	assertEquals([user.alias, user.role], ["bear", "admin"]);

	const second = await call("/__auth/signup", form({ alias: "fox", password: "pw" }));
	assertEquals(second.status, 403);
	await second.body?.cancel();

	await Deno.remove(dir, { recursive: true });
});

Deno.test("login, bad password, forged token and logout", async () => {
	const { call, form, cookieOf, dir } = await setup();
	await (await call("/__auth/signup", form({ alias: "bear", password: "pw" }))).body?.cancel();

	const bad = await call(
		"/__auth/login",
		form({ alias: "bear", password: "nope", redirectUrl: "/x" }),
	);
	assertEquals(bad.status, 303);
	assertEquals(bad.headers.get("location"), "/login?error=invalid&redirectUrl=%2Fx");

	const unknown = await call("/__auth/login", form({ alias: "nobody", password: "pw" }));
	assertEquals(unknown.headers.get("location"), "/login?error=invalid");

	const offsite = await call(
		"/__auth/login",
		form({ alias: "bear", password: "pw", redirectUrl: "//evil.example" }),
	);
	assertEquals(offsite.headers.get("location"), "/");
	const cookie = cookieOf(offsite);
	assertEquals((await call("/whoami", { headers: { cookie } })).status, 200);

	const [h, p] = cookie.split("=")[1].split(".");
	const forged = `BM_AUTH_TOKEN=${h}.${p}.AAAA`;
	const forgedRes = await call("/whoami", { headers: { cookie: forged } });
	assertEquals(forgedRes.status, 401);
	await forgedRes.body?.cancel();

	const out = await call("/__auth/logout", { method: "POST", headers: { cookie } });
	assertEquals(out.status, 303);
	assertEquals(out.headers.get("location"), "/login");
	const after = await call("/whoami", { headers: { cookie } });
	assertEquals(after.status, 401);
	await after.body?.cancel();

	await Deno.remove(dir, { recursive: true });
});

Deno.test("helpers: invite, duplicate alias, update revokes sessions, password reset, delete", async () => {
	const { call, form, cookieOf, router, dir } = await setup();
	const signup = await call("/__auth/signup", form({ alias: "bear", password: "pw" }));
	const cookie = cookieOf(signup);

	const invited = await (await call("/admin/invite", { method: "POST" })).json();
	assertEquals([invited.alias, invited.role], ["fox", "user"]);
	const dup = await call("/__auth/signup", form({ alias: "fox", password: "x" }));
	assertEquals(dup.status, 403, "signup is closed once there are users");
	await dup.body?.cancel();

	const users = await (await call("/users")).json();
	assertEquals(users.map((u: { alias: string }) => u.alias), ["bear", "fox"]);
	assertEquals(users.some((u: Record<string, unknown>) => "password" in u), false);

	await (await call("/admin/demote", { method: "POST" })).body?.cancel();
	const revoked = await call("/whoami", { headers: { cookie } });
	assertEquals(revoked.status, 401, "changing a user's fields ends their sessions");
	await revoked.body?.cancel();

	const relog = await call("/__auth/login", form({ alias: "bear", password: "pw" }));
	assertEquals(
		(await (await call("/whoami", { headers: { cookie: cookieOf(relog) } })).json()).role,
		"user",
	);

	const db = (router as unknown as { getService: Router["getService"] }).getService(dbToken);
	await setPassword(db, invited.id, "new");
	const old = await call("/__auth/login", form({ alias: "fox", password: "pw2" }));
	assertEquals(old.headers.get("location"), "/login?error=invalid");
	const fresh = await call("/__auth/login", form({ alias: "fox", password: "new" }));
	assertEquals(fresh.headers.get("location"), "/");

	await deleteUser(db, invited.id);
	const gone = await call("/whoami", { headers: { cookie: cookieOf(fresh) } });
	assertEquals(gone.status, 401);
	await gone.body?.cancel();

	await Deno.remove(dir, { recursive: true });
});

Deno.test("Secure cookies over https and behind a proxy", async () => {
	const { router, form, dir } = await setup();
	const res = await router.handle(
		new Request("http://kk.local/__auth/signup", {
			...form({ alias: "bear", password: "pw" }),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-forwarded-proto": "https",
			},
		}),
		{ remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 } } as Deno.ServeHandlerInfo<
			Deno.NetAddr
		>,
	);
	assertMatch(res.headers.get("set-cookie")!, /Secure/);
	await Deno.remove(dir, { recursive: true });
});
