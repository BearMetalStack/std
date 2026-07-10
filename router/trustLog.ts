/**
 * Console output for the reserved `/@bearmetal/*` namespace.
 *
 * `TrustedModule` is public API, so anything can subclass it and claim a name.
 * That is deliberate - a module you `.use()` already runs arbitrary code in
 * your process and could patch the router directly, so trust here cannot be
 * *prevented*. It can only be made impossible to miss. Hence: every trusted
 * registration is announced, and a name claimed by two different classes is
 * screamed about.
 */

import { bgColorize, bold, colorize, italic, underline } from "@bearmetal/cli/style";

/** Announces, in yellow, that a trusted module has taken a reserved route. */
export function logTrustedRoute(
	name: string,
	ctor: string,
	method: string,
	path: string,
): void {
	console.warn(
		`${bold(colorize("⚠ trusted", "yellow"))} ` +
			`${colorize(ctor, "yellow")}${colorize(` ("${name}")`, "gray")} ` +
			`registered ${bold(colorize(method.toUpperCase(), "yellow"))} ` +
			`${underline(colorize(path, "yellow"))}`,
	);
}

/**
 * Screams, in red, that two different classes claim the same trusted name.
 *
 * This is the impostor signature: a module naming itself `@bearmetal/components`
 * to append a handler onto a route the real one owns.
 */
export function alarmTrustedNameCollision(
	name: string,
	incumbentCtor: string,
	impostorCtor: string,
	method: string,
	path: string,
): void {
	const banner = bold(
		bgColorize(colorize(" ⛔ POSSIBLE SEVERE SECURITY ISSUE ⛔ ", "white"), "red"),
	);
	const rule = colorize("━".repeat(72), "red");

	console.error(
		`\n${rule}\n${banner}\n\n` +
			bold(colorize(
				`Two different classes claim the trusted name "${name}".`,
				"red",
			)) +
			`\n\n` +
			`  ${colorize("already claimed by:", "gray")} ${bold(colorize(incumbentCtor, "green"))}\n` +
			`  ${colorize("now claimed by:    ", "gray")} ${bold(colorize(impostorCtor, "red"))}\n` +
			`  ${colorize("attempting:        ", "gray")} ${
				bold(colorize(`${method.toUpperCase()} ${path}`, "red"))
			}\n\n` +
			bold(colorize("This might be a severe security issue.", "red")) + " " +
			italic(colorize("Please check your sources.", "red")) +
			`\n\n${
				colorize(
					`A dependency may be impersonating ${incumbentCtor} to intercept traffic on a\n` +
						`reserved BearMetal route. The registration was refused; the router will\n` +
						`refuse to serve until this is resolved.`,
					"gray",
				)
			}\n${rule}\n`,
	);
}

export function raiseTrustedNameSimilarity(
	name: string,
	incumbentCtor: string,
	impostorCtor: string,
	method: string,
	path: string,
) {
	const banner = bold(
		bgColorize(colorize(" ⚠️ POSSIBLE SECURITY ISSUE ⚠️ ", "white"), "yellow"),
	);
	const rule = colorize("━".repeat(72), "red");

	console.error(
		`\n${rule}\n${banner}\n\n` +
			bold(colorize(
				`Two different classes claim similar trusted names "${name}".`,
				"yellow",
			)) +
			`\n\n` +
			`  ${colorize("already claimed by:", "gray")} ${bold(colorize(incumbentCtor, "green"))}\n` +
			`  ${colorize("now claimed by:    ", "gray")} ${bold(colorize(impostorCtor, "red"))}\n` +
			`  ${colorize("attempting:        ", "gray")} ${
				bold(colorize(`${method.toUpperCase()} ${path}`, "red"))
			}\n\n` +
			bold(colorize("This might be a security issue.", "yellow")) + " " +
			italic(colorize("Please check your sources.", "yellow")) +
			`\n\n${
				colorize(
					`A dependency may be attempting to spoof ${incumbentCtor} to intercept traffic on a\n` +
						`reserved BearMetal route. The registration was allowed, however you should examine\n` +
						`your sources. You can quiet this message by adding ${incumbentCtor} to` +
						`the BEARMETAL_TRUST environment variable.`,
					"gray",
				)
			}\n${rule}\n`,
	);
}
