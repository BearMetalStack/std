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

let keyPromise: Promise<CryptoKey> | undefined;
let warned = false;

/**
 * The signing key. Taken from {@linkcode Token.useSecret}, then
 * `BM_TOKEN_SECRET`. With neither, a random key is made for this process and a
 * warning printed: sessions then end whenever the server restarts.
 */
function key(): Promise<CryptoKey> {
	if (!keyPromise) {
		let secret: string | undefined;
		try {
			secret = Deno.env.get("BM_TOKEN_SECRET");
		} catch {
			// no env access - fall through to a random key
		}
		if (!secret) {
			if (!warned) {
				console.warn(
					"%c[BearMetal Auth]%c no token secret configured (authModule({ secret }) or BM_TOKEN_SECRET); " +
						"using a random one, so sessions will not survive a restart.",
					"color: green",
					"color: yellow",
				);
				warned = true;
			}
			secret = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
		}
		keyPromise = importKey(secret);
	}
	return keyPromise;
}

function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export class Token {
	/** Signs and verifies tokens with `secret` from now on. */
	static useSecret(secret: string): void {
		if (!secret) throw new Error("Token secret must not be empty");
		keyPromise = importKey(secret);
	}

	static parse<T>(token: string): { alias: string; id: string } & T {
		const parts = token.split(".");
		if (parts.length !== 3) throw new Error("Invalid token");
		return JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
	}

	static async verify(token: string): Promise<boolean> {
		const parts = token.split(".");
		if (parts.length !== 3) return false;
		const [header, payload, sig] = parts;
		try {
			return await crypto.subtle.verify(
				"HMAC",
				await key(),
				fromBase64Url(sig) as unknown as ArrayBuffer,
				new TextEncoder().encode(`${header}.${payload}`),
			);
		} catch {
			return false;
		}
	}

	static create(value: unknown): Promise<string> {
		const header = toBase64Url(
			new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
		);
		const payload = toBase64Url(
			new TextEncoder().encode(JSON.stringify({ ...value as object, iat: Date.now() })),
		);
		return encodeToken(header, payload);
	}
}

async function encodeToken(header: string, payload: string): Promise<string> {
	const signature = await crypto.subtle.sign(
		"HMAC",
		await key(),
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${toBase64Url(signature)}`;
}
