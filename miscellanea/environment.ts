export const envKey = "BEARMETAL_ENV";

export function environment(): string {
	if (isEnvGranted()) {
		return Deno.env.get(envKey) || "dev";
	}
	return "client"; // not ideal, need client side env check
}

export function isEnvGranted(): boolean {
	return (
		"Deno" in globalThis &&
		Deno.permissions.querySync({ name: "env", variable: envKey }).state === "granted"
	);
}

export function isDev(): boolean {
	return environment() === "dev";
}

export function isProd(): boolean {
	return environment() === "prod";
}

export function isStaging(): boolean {
	return environment() === "staging";
}

export function isClient(): boolean { // honestly this shouldn't exist
	return environment() === "client";
}
