function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(str: string): Uint8Array {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - str.length % 4) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export class Token {
	static parse<T>(token: string): { alias: string; id: string } & T {
		const parts = token.split(".");
		if (parts.length !== 3) throw new Error("Invalid token");
		return JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
	}

	static verify(token: string): Promise<boolean> {
		const parts = token.split(".");
		if (parts.length !== 3) return Promise.resolve(false);
		const [header, payload, sig] = parts;
		return crypto.subtle.verify(
			"HMAC",
			key,
			fromBase64Url(sig) as unknown as ArrayBuffer,
			new TextEncoder().encode(`${header}.${payload}`),
		);
	}

	static create(value: unknown): Promise<string> {
		const header = toBase64Url(
			new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
		);
		const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
		return encodeToken(header, payload);
	}
}

const secret = Deno.env.get("BM_TOKEN_SECRET");
const key = await crypto.subtle.importKey(
	"raw",
	new TextEncoder().encode(secret),
	{ name: "HMAC", hash: "SHA-256" },
	false,
	["sign", "verify"],
);

async function encodeToken(header: string, payload: string): Promise<string> {
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${toBase64Url(signature)}`;
}
