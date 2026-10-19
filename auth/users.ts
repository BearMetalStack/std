/**
 * Managing users directly, for apps that create accounts themselves — an
 * admin inviting someone, a first-run setup page, a CLI — rather than through
 * the public signup route.
 *
 * Every helper takes the `db` service (`ctx.getService(dbToken)`).
 *
 * @module
 */

import type { DBServiceActions } from "@bearmetal/db";
import type { Service } from "@bearmetal/router";
import { Password } from "./password.ts";
import { Token } from "./token.ts";

type Db = Service<DBServiceActions>;
type Row = Record<string, unknown>;

/** A user as stored, minus the password hash. */
export type AuthUser = { id: string; alias: string } & Record<string, unknown>;

/** Thrown by {@linkcode createUser} and {@linkcode updateUser} when the alias is in use. */
export class AliasTakenError extends Error {
	constructor(alias: string) {
		super(`The alias "${alias}" is already taken`);
		this.name = "AliasTakenError";
	}
}

function users(db: Db) {
	return db.invoke("table", "bma_users" as string);
}

function sessions(db: Db) {
	return db.invoke("table", "bma_sessions" as string);
}

function strip(row: Row): AuthUser {
	const { password: _password, ...rest } = row;
	return rest as AuthUser;
}

/** Whether any user exists yet — the usual test for "first run". */
export async function hasUsers(db: Db): Promise<boolean> {
	return (await users(db).select(["id"]).limit(1).query).length > 0;
}

/** Every user, without password hashes, ordered by alias. */
export async function listUsers(db: Db): Promise<AuthUser[]> {
	return (await users(db).orderBy("alias").query).map(strip);
}

/** A user by id, without the password hash. */
export async function getUser(db: Db, id: string): Promise<AuthUser | undefined> {
	const [row] = await users(db).where({ id }).query;
	return row ? strip(row) : undefined;
}

/** The full row for an alias, password hash included. Internal to sign-in. */
export async function findUserRow(db: Db, alias: string): Promise<Row | undefined> {
	const [row] = await users(db).where({ alias }).query;
	return row;
}

/**
 * Creates a user. `extra` is stored alongside — columns an app added to
 * `bma_users` through `authModule({ user: { schema } })`, such as a role.
 */
export async function createUser(
	db: Db,
	{ alias, password, ...extra }: { alias: string; password: string } & Row,
): Promise<AuthUser> {
	alias = alias.trim();
	if (!alias) throw new Error("An alias is required");
	if (!password) throw new Error("A password is required");
	if (await findUserRow(db, alias)) throw new AliasTakenError(alias);
	const id = crypto.randomUUID();
	await users(db).upsert({ ...extra, id, alias, password: await Password.hash(password) });
	return { ...extra, id, alias };
}

/**
 * Changes stored fields on a user (not the password — see
 * {@linkcode setPassword}). Their sessions are revoked unless `keepSessions`,
 * since a token carries whatever fields `includeInToken` named when it was made.
 */
export async function updateUser(
	db: Db,
	id: string,
	fields: Row,
	opts: { keepSessions?: boolean } = {},
): Promise<AuthUser> {
	const [current] = await users(db).where({ id }).query;
	if (!current) throw new Error(`No user with id ${id}`);
	const { id: _id, password: _password, ...changes } = fields;
	if (typeof changes.alias === "string" && changes.alias !== current.alias) {
		changes.alias = changes.alias.trim();
		if (await findUserRow(db, changes.alias as string)) {
			throw new AliasTakenError(changes.alias as string);
		}
	}
	const next = { ...current, ...changes };
	await users(db).upsert(next, ["id"]);
	if (!opts.keepSessions) await revokeSessions(db, id);
	return strip(next);
}

/** Replaces a user's password and signs them out everywhere. */
export async function setPassword(db: Db, id: string, password: string): Promise<void> {
	if (!password) throw new Error("A password is required");
	const [current] = await users(db).where({ id }).query;
	if (!current) throw new Error(`No user with id ${id}`);
	await users(db).upsert({ ...current, password: await Password.hash(password) }, ["id"]);
	await revokeSessions(db, id);
}

/** Checks a password against the stored hash. */
export async function verifyPassword(db: Db, id: string, password: string): Promise<boolean> {
	const [row] = await users(db).where({ id }).select(["password"]).query;
	return !!row?.password && await Password.verify(password, row.password as string);
}

/** Deletes a user and every session they hold. */
export async function deleteUser(db: Db, id: string): Promise<void> {
	await revokeSessions(db, id);
	await users(db).where({ id }).delete;
}

/** Ends every session a user holds. */
export async function revokeSessions(db: Db, userId: string): Promise<void> {
	await sessions(db).where({ user_id: userId }).delete;
}

/**
 * Starts a session for a user and returns its token. `includeInToken` names
 * the extra user fields the token carries, which handlers read from
 * `ctx.state.user`.
 */
export async function startSession(
	db: Db,
	user: Row,
	includeInToken: string[] = [],
): Promise<string> {
	const claims: Row = { id: user.id, alias: user.alias };
	for (const field of includeInToken) claims[field] = user[field];
	const token = await Token.create(claims);
	await sessions(db).upsert({ token, data: "", user_id: user.id as string }, ["token"]);
	return token;
}
