import { assertEquals, assertThrows } from "@std/assert";
import {
	buildPostgresDeleteSQL,
	buildPostgresSQL,
	buildPostgresUpsertSQL,
	emptyState,
} from "@lib/SqlBuilder.ts";
import { PostgresConnector } from "./Postgres.ts";

// ─── SELECT ──────────────────────────────────────────────────────────────────

Deno.test("SELECT *  when no fields specified", () => {
	const { sql, params } = buildPostgresSQL({ ...emptyState(), table: "users" });
	assertEquals(sql, "SELECT * FROM users");
	assertEquals(params, []);
});

Deno.test("SELECT specific fields", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		fields: ["id", "name", "email"],
	});
	assertEquals(sql, "SELECT id, name, email FROM users");
	assertEquals(params, []);
});

Deno.test("SELECT with single WHERE condition", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		conditions: [["id", 42]],
	});
	assertEquals(sql, "SELECT * FROM users WHERE id = $1");
	assertEquals(params, [42]);
});

Deno.test("SELECT with multiple WHERE conditions ANDed together", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		conditions: [["active", true], ["role", "admin"]],
	});
	assertEquals(sql, "SELECT * FROM users WHERE active = $1 AND role = $2");
	assertEquals(params, [true, "admin"]);
});

Deno.test("SELECT with INNER JOIN", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "orders",
		joins: [{
			table: "users",
			on: { local: "user_id", foreign: "id" },
			type: "inner",
		}],
	});
	assertEquals(
		sql,
		"SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id",
	);
	assertEquals(params, []);
});

Deno.test("SELECT with LEFT JOIN", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "orders",
		joins: [{
			table: "users",
			on: { local: "user_id", foreign: "id" },
			type: "left",
		}],
	});
	assertEquals(
		sql,
		"SELECT * FROM orders LEFT JOIN users ON orders.user_id = users.id",
	);
	assertEquals(params, []);
});

Deno.test("SELECT with multiple JOINs", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "orders",
		joins: [
			{
				table: "users",
				on: { local: "user_id", foreign: "id" },
				type: "inner",
			},
			{
				table: "products",
				on: { local: "product_id", foreign: "id" },
				type: "left",
			},
		],
	});
	assertEquals(
		sql,
		"SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id LEFT JOIN products ON orders.product_id = products.id",
	);
	assertEquals(params, []);
});

Deno.test("SELECT with ORDER BY ASC", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		orderBys: [{ field: "name", direction: "asc" }],
	});
	assertEquals(sql, "SELECT * FROM users ORDER BY name ASC");
	assertEquals(params, []);
});

Deno.test("SELECT with ORDER BY DESC", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "posts",
		orderBys: [{ field: "created_at", direction: "desc" }],
	});
	assertEquals(sql, "SELECT * FROM posts ORDER BY created_at DESC");
	assertEquals(params, []);
});

Deno.test("SELECT with multiple ORDER BY columns", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "posts",
		orderBys: [
			{ field: "author", direction: "asc" },
			{ field: "created_at", direction: "desc" },
		],
	});
	assertEquals(sql, "SELECT * FROM posts ORDER BY author ASC, created_at DESC");
	assertEquals(params, []);
});

Deno.test("SELECT with GROUP BY", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "orders",
		fields: ["status", "COUNT(*)"],
		groupBys: ["status"],
	});
	assertEquals(sql, "SELECT status, COUNT(*) FROM orders GROUP BY status");
	assertEquals(params, []);
});

Deno.test("SELECT with LIMIT", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		limitCount: 25,
	});
	assertEquals(sql, "SELECT * FROM users LIMIT $1");
	assertEquals(params, [25]);
});

Deno.test("SELECT with LIMIT and OFFSET uses sequential params", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "users",
		limitCount: 10,
		offsetCount: 30,
	});
	assertEquals(sql, "SELECT * FROM users LIMIT $1 OFFSET $2");
	assertEquals(params, [10, 30]);
});

Deno.test("SELECT params are numbered sequentially across WHERE and LIMIT/OFFSET", () => {
	const { sql, params } = buildPostgresSQL({
		...emptyState(),
		table: "orders",
		conditions: [["status", "pending"]],
		limitCount: 5,
		offsetCount: 10,
	});
	assertEquals(
		sql,
		"SELECT * FROM orders WHERE status = $1 LIMIT $2 OFFSET $3",
	);
	assertEquals(params, ["pending", 5, 10]);
});

Deno.test("SELECT with all clauses in correct order", () => {
	const { sql, params } = buildPostgresSQL({
		table: "orders",
		fields: ["orders.id", "users.name", "status"],
		conditions: [["status", "shipped"]],
		joins: [{
			table: "users",
			on: { local: "user_id", foreign: "id" },
			type: "inner",
		}],
		groupBys: ["status"],
		orderBys: [{ field: "orders.id", direction: "desc" }],
		limitCount: 5,
		offsetCount: 10,
	});
	assertEquals(
		sql,
		"SELECT orders.id, users.name, status FROM orders" +
			" INNER JOIN users ON orders.user_id = users.id" +
			" WHERE status = $1" +
			" GROUP BY status" +
			" ORDER BY orders.id DESC" +
			" LIMIT $2 OFFSET $3",
	);
	assertEquals(params, ["shipped", 5, 10]);
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

Deno.test("DELETE with no conditions", () => {
	const { sql, params } = buildPostgresDeleteSQL({
		...emptyState(),
		table: "users",
	});
	assertEquals(sql, "DELETE FROM users");
	assertEquals(params, []);
});

Deno.test("DELETE with single WHERE condition", () => {
	const { sql, params } = buildPostgresDeleteSQL({
		...emptyState(),
		table: "users",
		conditions: [["id", 99]],
	});
	assertEquals(sql, "DELETE FROM users WHERE id = $1");
	assertEquals(params, [99]);
});

Deno.test("DELETE with multiple WHERE conditions", () => {
	const { sql, params } = buildPostgresDeleteSQL({
		...emptyState(),
		table: "sessions",
		conditions: [["user_id", 7], ["expired", true]],
	});
	assertEquals(sql, "DELETE FROM sessions WHERE user_id = $1 AND expired = $2");
	assertEquals(params, [7, true]);
});

// ─── UPSERT ──────────────────────────────────────────────────────────────────

Deno.test("UPSERT with no conflictOn falls back to DO NOTHING", () => {
	const { sql, params } = buildPostgresUpsertSQL(
		{ ...emptyState(), table: "users" },
		{ id: 1, name: "Emma" },
	);
	assertEquals(
		sql,
		"INSERT INTO users (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
	);
	assertEquals(params, [1, "Emma"]);
});

Deno.test("UPSERT with conflictOn updates non-conflict columns", () => {
	const { sql, params } = buildPostgresUpsertSQL(
		{ ...emptyState(), table: "users" },
		{ id: 1, name: "Emma", email: "emma@cyborggrizzly.com" },
		["id"],
	);
	assertEquals(
		sql,
		"INSERT INTO users (id, name, email) VALUES ($1, $2, $3)" +
			" ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email",
	);
	assertEquals(params, [1, "Emma", "emma@cyborggrizzly.com"]);
});

Deno.test("UPSERT with composite conflict key", () => {
	const { sql, params } = buildPostgresUpsertSQL(
		{ ...emptyState(), table: "memberships" },
		{ user_id: 1, org_id: 2, role: "admin" },
		["user_id", "org_id"],
	);
	assertEquals(
		sql,
		"INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)" +
			" ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role",
	);
	assertEquals(params, [1, 2, "admin"]);
});

Deno.test("UPSERT where all columns are the conflict key falls back to DO NOTHING", () => {
	const { sql, params } = buildPostgresUpsertSQL(
		{ ...emptyState(), table: "tags" },
		{ name: "deno" },
		["name"],
	);
	assertEquals(
		sql,
		"INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
	);
	assertEquals(params, ["deno"]);
});

// ─── Fluent chain ────────────────────────────────────────────────────────────

Deno.test("offset rejects negative values", () => {
	const conn = new PostgresConnector({
		_type: "string",
		connectionString: "postgres://testuser:testpass@localhost:5432/testdb",
		poolSize: 1,
	});
	assertThrows(
		() => conn.table("users").offset(-1),
		Error,
		"non-negative",
	);
});

// ─── Integration (requires POSTGRES_TEST_URL) ────────────────────────────────

let TEST_URL: string | undefined;
try {
	TEST_URL = Deno.env.get("POSTGRES_TEST_URL");
} catch {
	// env permission not granted; integration tests will be skipped
}

Deno.test({
	name: "integration: read returns rows from table",
	ignore: !TEST_URL,
	async fn() {
		const conn = new PostgresConnector({
			_type: "string",
			connectionString: TEST_URL!,
			poolSize: 1,
		});
		const rows = await conn.table("users").limit(1).query;
		assertEquals(Array.isArray(rows), true);
	},
});

Deno.test({
	name: "integration: upsert then read round-trips data",
	ignore: !TEST_URL,
	async fn() {
		const conn = new PostgresConnector({
			_type: "string",
			connectionString: TEST_URL!,
			poolSize: 1,
		});
		await conn.table("users").upsert(
			{ id: 99999, name: "test-user", email: "test@example.com" },
			["id"],
		);
		const rows = await conn.table("users").where({ id: 99999 }).query as Array<
			Record<string, unknown>
		>;
		assertEquals(rows.length, 1);
		assertEquals(rows[0].name, "test-user");
	},
});

Deno.test({
	name: "integration: delete removes row",
	ignore: !TEST_URL,
	async fn() {
		const conn = new PostgresConnector({
			_type: "string",
			connectionString: TEST_URL!,
			poolSize: 1,
		});
		await conn.table("users").upsert({ id: 99998, name: "to-delete" }, ["id"]);
		await conn.table("users").where({ id: 99998 }).delete;
		const rows = await conn.table("users").where({ id: 99998 }).query as Array<
			Record<string, unknown>
		>;
		assertEquals(rows.length, 0);
	},
});

Deno.test({
	name: "integration: upsert updates existing row on conflict",
	ignore: !TEST_URL,
	async fn() {
		const conn = new PostgresConnector({
			_type: "string",
			connectionString: TEST_URL!,
			poolSize: 1,
		});
		await conn.table("users").upsert({ id: 99997, name: "original" }, ["id"]);
		await conn.table("users").upsert({ id: 99997, name: "updated" }, ["id"]);
		const rows = await conn.table("users").where({ id: 99997 }).query as Array<
			Record<string, unknown>
		>;
		assertEquals(rows[0].name, "updated");
		await conn.table("users").where({ id: 99997 }).delete;
	},
});
