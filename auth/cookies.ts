export interface Cookie {
	name: string;
	value: string;
	expires?: Temporal.Instant;
	maxAge?: Temporal.Duration;
	domain?: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "Strict" | "Lax" | "None";
	unparsed?: string[];
}

export function Cookie(c: Cookie): string {
	if (!c.name) return "";
	const out: string[] = [];
	out.push(`${c.name}=${c.value}`);

	if (c.secure) out.push("Secure");
	if (c.httpOnly) out.push("HttpOnly");
	if (c.sameSite) out.push(`SameSite=${c.sameSite}`);
	if (c.expires) out.push(`Expires=${c.expires.toString()}`);
	if (c.maxAge) out.push(`Max-Age=${c.maxAge.seconds}`);
	if (c.domain) out.push(`Domain=${c.domain}`);
	if (c.path) out.push(`Path=${c.path}`);
	return out.join("; ");
}
