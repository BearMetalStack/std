/**
 * @module
 * BearMetal Router response utilities.
 *
 * All body-bearing helpers return a `TypedResponse<T, Status>` that:
 * - JSON-serializes plain objects automatically (sets Content-Type: application/json)
 * - Accepts a schema as the first argument to validate the body and attach it as metadata
 *   for future OpenAPI documentation generation
 * - Carries the TypeScript type of the body and the HTTP status code as generics
 */

import type { Infer, Schema } from "../schema.ts";
import { Schema as SchemaClass } from "../schema.ts";

// ─── TypedResponse ────────────────────────────────────────────────────────────

/**
 * A `Response` subclass that carries the TypeScript type of its body (`T`) and
 * the HTTP status code as a literal type (`S`). An optional `schema` property
 * holds the Schema used to validate the body - used by documentation generators.
 */
export class TypedResponse<T = unknown, S extends number = number> extends Response {
	readonly schema?: Schema<T>;

	/** Narrows the inherited `status: number` to the literal status code type. */
	declare readonly status: S;

	constructor(
		data: T,
		status: S,
		options?: { schema?: Schema<T>; headers?: HeadersInit },
	) {
		const { body, contentType } = serializeBody(data);
		const headers = new Headers(options?.headers);
		if (contentType && !headers.has("Content-Type")) {
			headers.set("Content-Type", contentType);
		}
		super(body, { status, headers });
		this.schema = options?.schema;
	}
}

function serializeBody(data: unknown): { body: BodyInit | null; contentType?: string } {
	if (data === null || data === undefined) return { body: null };
	if (typeof data === "string") return { body: data, contentType: "text/plain;charset=UTF-8" };
	if (typeof data === "object") {
		return { body: JSON.stringify(data), contentType: "application/json" };
	}
	return {
		body: String(data as string | number | boolean),
		contentType: "text/plain;charset=UTF-8",
	};
}

// ─── Helper type interfaces ───────────────────────────────────────────────────

/**
 * The call signature shared by every body-bearing response helper.
 *
 * Four ways to call it:
 * - No args → plain text default body (e.g. "OK", "Not Found")
 * - `(string)` → plain text body
 * - `(object)` → JSON body (Content-Type: application/json inferred)
 * - `(schema, data)` → validated JSON body; schema attached to TypedResponse for docs
 */
export interface ResponseHelper<N extends number> {
	(): TypedResponse<string, N>;
	(body: string): TypedResponse<string, N>;
	<S extends Schema<unknown>>(schema: S, data: Infer<S>): TypedResponse<Infer<S>, N>;
	<T extends object>(data: T): TypedResponse<T, N>;
}

function makeHelper<N extends number>(status: N, defaultBody: string): ResponseHelper<N> {
	// deno-lint-ignore no-explicit-any
	return function (...args: any[]): any {
		if (args.length === 0) return new TypedResponse(defaultBody, status);
		if (args.length >= 2) {
			if (args[0] instanceof SchemaClass) {
				const schema = args[0] as Schema<unknown>;
				const data = schema.parse(args[1]);
				return new TypedResponse(data, status, { schema });
			}
			if (isHeaders(args[1])) {
				return new TypedResponse(args[0] ?? defaultBody, status, { headers: args[1] });
			}
		}
		if (args.length === 1 && isHeaders(args[0])) {
			return new TypedResponse(defaultBody, status, { headers: args[0] });
		}
		return new TypedResponse(args[0] ?? defaultBody, status);
	};
}

function isHeaders(obj: unknown): obj is Headers {
	return obj instanceof Headers;
}

// ─── File ─────────────────────────────────────────────────────────────────────

/** Sends a pre-rendered HTML string with `Content-Type: text/html`. Defaults to 200. */
export function Html(html: string): TypedResponse<string, 200>;
export function Html<S extends number>(html: string, status: S): TypedResponse<string, S>;
export function Html(html: string, status = 200): TypedResponse<string, number> {
	return new TypedResponse(html, status, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

/** Sends a pre-rendered JavaScript string with `Content-Type: text/javascript`. Defaults to 200. */
export function Script(script: string): TypedResponse<string, 200> {
	return new TypedResponse(script, 200, {
		headers: {
			"Content-Type": "text/javascript; charset=utf-8",
			// "Cache-control": "max-age=604800; public",
		},
	});
}

/** Sends a pre-rendered CSS string with `Content-Type: text/css`. Defaults to 200. */
export function Style(style: string): TypedResponse<string, 200> {
	return new TypedResponse(style, 200, {
		headers: {
			"Content-Type": "text/css; charset=utf-8",
			// "Cache-control": "max-age=604800; public",
		},
	});
}

// ─── 2xx Success ──────────────────────────────────────────────────────────────

/** 200 OK */
export const Ok: ResponseHelper<200> = makeHelper(200, "OK");

/** 201 Created */
export const Created: ResponseHelper<201> = makeHelper(201, "Created");

/** 202 Accepted */
export const Accepted: ResponseHelper<202> = makeHelper(202, "Accepted");

/** 204 No Content */
export const NoContent = (): TypedResponse<null, 204> => new TypedResponse(null, 204);

/** 206 Partial Content */
export const PartialContent: ResponseHelper<206> = makeHelper(206, "Partial Content");

// ─── 3xx Redirection ──────────────────────────────────────────────────────────

/** 301 Moved Permanently */
export const MovedPermanently = (location: string): TypedResponse<null, 301> =>
	new TypedResponse(null, 301, { headers: { Location: location } });

/** 302 Found */
export const Found = (location: string): TypedResponse<null, 302> =>
	new TypedResponse(null, 302, { headers: { Location: location } });

/** 304 Not Modified */
export const NotModified = (): TypedResponse<null, 304> => new TypedResponse(null, 304);

/** 307 Temporary Redirect */
export const TemporaryRedirect = (location: string): TypedResponse<null, 307> =>
	new TypedResponse(null, 307, { headers: { Location: location } });

/** 308 Permanent Redirect */
export const PermanentRedirect = (location: string): TypedResponse<null, 308> =>
	new TypedResponse(null, 308, { headers: { Location: location } });

// ─── 4xx Client Error ────────────────────────────────────────────────────────

/** 400 Bad Request */
export const BadRequest: ResponseHelper<400> = makeHelper(400, "Bad Request");

/** 401 Unauthorized */
export const Unauthorized: ResponseHelper<401> = makeHelper(401, "Unauthorized");

/** 402 Payment Required */
export const PaymentRequired: ResponseHelper<402> = makeHelper(402, "Payment Required");

/** 403 Forbidden */
export const Forbidden: ResponseHelper<403> = makeHelper(403, "Forbidden");

/** 404 Not Found */
export const NotFound: ResponseHelper<404> = makeHelper(404, "Not Found");

/** 405 Method Not Allowed */
export const MethodNotAllowed: ResponseHelper<405> = makeHelper(405, "Method Not Allowed");

/** 408 Request Timeout */
export const RequestTimeout: ResponseHelper<408> = makeHelper(408, "Request Timeout");

/** 409 Conflict */
export const Conflict: ResponseHelper<409> = makeHelper(409, "Conflict");

/** 410 Gone */
export const Gone: ResponseHelper<410> = makeHelper(410, "Gone");

/** 413 Content Too Large */
export const ContentTooLarge: ResponseHelper<413> = makeHelper(413, "Content Too Large");

/** 415 Unsupported Media Type */
export const UnsupportedMediaType: ResponseHelper<415> = makeHelper(
	415,
	"Unsupported Media Type",
);

/** 422 Unprocessable Entity */
export const UnprocessableEntity: ResponseHelper<422> = makeHelper(
	422,
	"Unprocessable Entity",
);

/** 426 Upgrade Required */
export const UpgradeRequired: ResponseHelper<426> = makeHelper(426, "Upgrade Required");

/** 429 Too Many Requests */
export const TooManyRequests: ResponseHelper<429> = makeHelper(429, "Too Many Requests");

// ─── 5xx Server Error ─────────────────────────────────────────────────────────

/** 500 Internal Server Error */
export const InternalError: ResponseHelper<500> = makeHelper(500, "Internal Server Error");

/** 501 Not Implemented */
export const NotImplemented: ResponseHelper<501> = makeHelper(501, "Not Implemented");

/** 502 Bad Gateway */
export const BadGateway: ResponseHelper<502> = makeHelper(502, "Bad Gateway");

/** 503 Service Unavailable */
export const ServiceUnavailable: ResponseHelper<503> = makeHelper(503, "Service Unavailable");

/** 504 Gateway Timeout */
export const GatewayTimeout: ResponseHelper<504> = makeHelper(504, "Gateway Timeout");
