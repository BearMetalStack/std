import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { s } from "@bearmetal/forge";
import { buildDeleteSQL, buildSelectSQL, buildUpsertSQL, emptyState } from "@lib/SqlBuilder.ts";
import { m, opToStatements } from "@migrations";
import { SqliteConnector } from "./Sqlite.ts";

// ─── SQL ─────────────────────────────────────────────────────────────────────

Deno.test("sqlite SELECT numbers params with ?N across WHERE, LIMIT and OFFSET", () => {
	const { sql, params } = buildSelectSQL({
		...emptyState(),
		table: "users",
		conditions: [["role", "admin"]],
		limitCount: 10,
		offsetCount: 20,
	}, "sqlite");
	assertEquals(sql, "SELECT * FROM users WHERE role = ?1 LIMIT ?2 OFFSET ?3");
	assertEquals(params, ["admin", 10, 20]);
});

Deno.test("sqlite DELETE and UPSERT use ?N placeholders", () => {
	assertEquals(
		buildDeleteSQL({ ...emptyState(), table: "t", conditions: [["id", 1]] }, "sqlite").sql,
		"DELETE FROM t WHERE id = ?1",
	);
	assertEquals(
		buildUpsertSQL({ ...emptyState(), table: "t" }, { id: 1, name: "a" }, ["id"], "sqlite").sql,
		"INSERT INTO t (id, name) VALUES (?1, ?2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
	);
});

Deno.test("sqlite DDL maps types onto SQLite affinities", () => {
	const [create] = opToStatements(
		m.create("x", {
			table: "things",
			schema: s.object({
				id: s.string().uuid(),
				count: s.number().int(),
				ratio: s.number(),
				on: s.boolean(),
				data: s.optional(s.object({ a: s.string() })),
			}),
			primaryKey: "id",
		}).ops[0],
		"sqlite",
	);
	assertEquals(
		create.sql,
		"CREATE TABLE IF NOT EXISTS things (\n  id TEXT NOT NULL PRIMARY KEY,\n  count INTEGER NOT NULL,\n  ratio REAL NOT NULL,\n  on INTEGER NOT NULL,\n  data TEXT\n)",
	);
});

Deno.test("sqlite DDL refuses what SQLite cannot do in place", () => {
	assertThrows(
		() => opToStatements(m.addColumn("t", "c", s.string()), "sqlite"),
		Error,
		"NOT NULL",
	);
	assertThrows(
		() => opToStatements(m.retypeColumn("t", "c", s.string()), "sqlite"),
		Error,
		"Rebuild",
	);
});

// ─── Connector ───────────────────────────────────────────────────────────────

function users() {
	return m.create("users__0001", {
		table: "users",
		schema: s.object({ id: s.string(), alias: s.string(), admin: s.optional(s.boolean()) }),
		primaryKey: "id",
		indexes: [{ columns: ["alias"], unique: true }],
	});
}

Deno.test("migrate applies once, then skips", async () => {
	const db = new SqliteConnector({ path: ":memory:" });
	const first = await db.migrate([users()]);
	assertEquals(first, { applied: ["users__0001"], skipped: [] });
	const second = await db.migrate([users()]);
	assertEquals(second, { applied: [], skipped: ["users__0001"] });
	db.close();
});

Deno.test("upsert, query, where, order, limit and delete round-trip", async () => {
	const db = new SqliteConnector({ path: ":memory:" });
	await db.migrate([users()]);

	await db.table("users").upsert({ id: "1", alias: "bear", admin: true }, ["id"]);
	await db.table("users").upsert({ id: "2", alias: "fox", admin: false }, ["id"]);
	await db.table("users").upsert({ id: "1", alias: "grizzly" }, ["id"]);

	assertEquals(await db.table("users").select(["id", "alias", "admin"]).orderBy("id").query, [
		{ id: "1", alias: "grizzly", admin: 1 },
		{ id: "2", alias: "fox", admin: 0 },
	]);
	assertEquals(await db.table("users").where({ alias: "fox" }).select(["id"]).query, [{ id: "2" }]);
	assertEquals(
		(await db.table("users").orderBy("alias", "desc").limit(1).query).map((r) => r.alias),
		["grizzly"],
	);

	await db.table("users").where({ id: "2" }).delete;
	assertEquals((await db.table("users").query).length, 1);
	db.close();
});

Deno.test("upsert without a conflict target leaves an existing row alone", async () => {
	const db = new SqliteConnector({ path: ":memory:" });
	await db.migrate([users()]);
	await db.table("users").upsert({ id: "1", alias: "bear" });
	await db.table("users").upsert({ id: "1", alias: "other" });
	assertEquals(await db.table("users").select(["alias"]).query, [{ alias: "bear" }]);
	db.close();
});

Deno.test("a failing migration rolls back and is not recorded", async () => {
	const db = new SqliteConnector({ path: ":memory:" });
	await assertRejects(() =>
		db.migrate([
			m.change("bad__0001", [
				m.raw("CREATE TABLE half (id TEXT)"),
				m.raw("THIS IS NOT SQL"),
			]),
		])
	);
	assertEquals(await db.table("_migrations").query, []);
	await assertRejects(() => db.table("half").query);
	db.close();
});

Deno.test("extendTable adds columns, and dropping needs allowDrop", async () => {
	const db = new SqliteConnector({ path: ":memory:" });
	await db.migrate([users()]);
	await db.migrate([
		m.change("ext__1", [{
			kind: "extendTable",
			table: "users",
			schema: s.object({ role: s.optional(s.string()), theme: s.optional(s.string()) }),
		}]),
	]);
	await db.table("users").upsert({ id: "1", alias: "bear", role: "admin", theme: "dark" });
	assertEquals(await db.table("users").select(["role", "theme"]).query, [{
		role: "admin",
		theme: "dark",
	}]);

	await assertRejects(
		() =>
			db.migrate([m.change("ext__2", [{
				kind: "extendTable",
				table: "users",
				schema: s.object({ role: s.optional(s.string()) }),
			}])]),
		Error,
		"allowDrop",
	);
	await db.migrate([m.change("ext__3", [{
		kind: "extendTable",
		table: "users",
		schema: s.object({ role: s.optional(s.string()) }),
		allowDrop: true,
	}])]);
	assertEquals(Object.keys((await db.table("users").query)[0]).includes("theme"), false);
	db.close();
});

Deno.test("persists to a file", async () => {
	const dir = await Deno.makeTempDir();
	const path = `${dir}/db.sqlite`;
	const a = new SqliteConnector({ path });
	await a.migrate([users()]);
	await a.table("users").upsert({ id: "1", alias: "bear" });
	a.close();
	const b = new SqliteConnector({ path });
	assertEquals(await b.table("users").select(["alias"]).query, [{ alias: "bear" }]);
	b.close();
	await Deno.remove(dir, { recursive: true });
});
