const SEP = ":";

export class Password {
	static async hash(raw: string) {
		const [pw, salt] = await hashPassword(raw);
		return `${salt}${SEP}${pw}`;
	}
	static verify(raw: string, hashed: string) {
		return comparePassword(raw, hashed);
	}
}

async function hashPassword(
	pw: string,
	salt = crypto.getRandomValues(new Uint8Array(16)),
): Promise<[string, string]> {
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
		await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, [
			"deriveBits",
		]),
		256,
	);
	return [toBase64(bits), salt.toBase64()];
}

async function comparePassword(pw: string, hashedPw: string) {
	const [saltB64, password] = hashedPw.split(SEP);
	const [hpw] = await hashPassword(pw, Uint8Array.fromBase64(saltB64));
	return hpw === password;
}

function toBase64(val: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(val)));
}
