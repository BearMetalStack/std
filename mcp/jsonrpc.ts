/**
 * @module
 * JSON-RPC 2.0 envelope helpers: error codes, the {@linkcode RpcError} thrown by
 * handlers, and guards for narrowing an inbound message.
 */

import type {
	JsonRpcErrorBody,
	JsonRpcFailure,
	JsonRpcId,
	JsonRpcMessage,
	JsonRpcNotification,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcSuccess,
} from "./types.ts";

export const JSONRPC_VERSION = "2.0" as const;

/**
 * JSON-RPC reserved codes plus the codes MCP layers on top of them.
 */
export const ErrorCode = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
	/** The peer asked for something before `initialize` completed. */
	NotInitialized: -32002,
	/** No resource is registered for the requested uri. */
	ResourceNotFound: -32003,
	/** A request this server sent to the client timed out. */
	RequestTimeout: -32001,
	/** A request was aborted via `notifications/cancelled`. */
	RequestCancelled: -32800,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * An error that maps onto a JSON-RPC error response. Anything else thrown from
 * a handler becomes an {@linkcode ErrorCode.InternalError} without leaking the
 * stack to the peer.
 */
export class RpcError extends Error {
	override readonly name = "RpcError";

	constructor(
		readonly code: number,
		message: string,
		readonly data?: unknown,
	) {
		super(message);
	}

	toBody(): JsonRpcErrorBody {
		return this.data === undefined
			? { code: this.code, message: this.message }
			: { code: this.code, message: this.message, data: this.data };
	}

	static parseError(message = "Parse error", data?: unknown): RpcError {
		return new RpcError(ErrorCode.ParseError, message, data);
	}

	static invalidRequest(message: string, data?: unknown): RpcError {
		return new RpcError(ErrorCode.InvalidRequest, message, data);
	}

	static methodNotFound(method: string): RpcError {
		return new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
	}

	static invalidParams(message: string, data?: unknown): RpcError {
		return new RpcError(ErrorCode.InvalidParams, message, data);
	}

	static internal(message: string, data?: unknown): RpcError {
		return new RpcError(ErrorCode.InternalError, message, data);
	}

	static resourceNotFound(uri: string): RpcError {
		return new RpcError(ErrorCode.ResourceNotFound, `Resource not found: ${uri}`, { uri });
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow an already-parsed value to a JSON-RPC message, or return `null`. */
export function asMessage(value: unknown): JsonRpcMessage | null {
	if (!isObject(value) || value.jsonrpc !== JSONRPC_VERSION) return null;

	const hasId = value.id !== undefined && value.id !== null;
	const validId = typeof value.id === "string" || typeof value.id === "number";

	if (typeof value.method === "string") {
		if (value.params !== undefined && !isObject(value.params)) return null;
		if (!hasId) return value as unknown as JsonRpcNotification;
		return validId ? value as unknown as JsonRpcRequest : null;
	}

	if (!validId) return null;
	if (isObject(value.error)) return value as unknown as JsonRpcFailure;
	if (value.result !== undefined) return value as unknown as JsonRpcSuccess;
	return null;
}

export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
	return "method" in message && "id" in message;
}

export function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
	return "method" in message && !("id" in message);
}

export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
	return !("method" in message);
}

export function isFailure(message: JsonRpcResponse): message is JsonRpcFailure {
	return "error" in message;
}

export function success(id: JsonRpcId, result: Record<string, unknown>): JsonRpcSuccess {
	return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function failure(id: JsonRpcId | null, error: JsonRpcErrorBody): JsonRpcFailure {
	return { jsonrpc: JSONRPC_VERSION, id, error };
}

/** Coerce anything thrown by a handler into a JSON-RPC error body. */
export function toErrorBody(error: unknown): JsonRpcErrorBody {
	if (error instanceof RpcError) return error.toBody();
	if (error instanceof Error) {
		return { code: ErrorCode.InternalError, message: error.message };
	}
	return { code: ErrorCode.InternalError, message: String(error) };
}
