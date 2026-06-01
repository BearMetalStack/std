export const envKey = "BEARMETAL_ENV";

export function environment() {
	if (isEnvGranted()) {
		return Deno.env.get(envKey) || "dev";
	}
	return "client"; // not ideal, need client side env check
}

export function isEnvGranted() {
	return (
		"Deno" in globalThis &&
		Deno.permissions.querySync({ name: "env", variable: envKey }).state === "granted"
	);
}

export function isDev() {
	return environment() === "dev";
}

export function isProd() {
	return environment() === "prod";
}

export function isStaging() {
	return environment() === "staging";
}

export function isClient() { // honestly this shouldn't exist
	return environment() === "client";
}
