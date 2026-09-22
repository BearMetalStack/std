/** Where the dev server's own routes live, regardless of where it is mounted. */
export const BASE = "/@bearmetal/dev-server";

/**
 * The URL a file under the dev server's `root` is served at, independent of
 * the mount point.
 *
 * @param relativePath path relative to `root`, with `/` separators.
 */
export function devServerSourceUrl(relativePath: string): string {
	return `${BASE}/src/${relativePath.replace(/^\/+/, "")}`;
}

/**
 * The browser half of the dev server, served as a classic script so it runs
 * before any module does.
 *
 * It sets `globalThis.__bmHmr` first, which is what makes `@bearmetal/app`
 * register components through replaceable stand-ins. Then it follows the
 * server's event stream:
 *
 * - `css-update` swaps each matching `<link rel="stylesheet">` for a fresh copy
 *   and removes the old one once the new one has loaded, so nothing flashes.
 * - `js-update` re-imports each changed component module. `@bearmetal/app`
 *   reports every tag it replaced as a `bearmetal:hmr` event; a module that
 *   replaced nothing, or a swap that was declined, reloads the page.
 * - `reload`, or the stream reconnecting to a restarted server, reloads.
 */
export const clientScript = `(() => {
	globalThis.__bmHmr = true;

	const reload = (reason) => {
		if (reason) console.info("[bmdev] reloading:", reason);
		location.reload();
	};

	let opened = false;
	const events = new EventSource(${JSON.stringify(`${BASE}/events`)});
	events.addEventListener("open", () => {
		if (opened) reload("the dev server restarted");
		opened = true;
	});
	events.addEventListener("reload", (e) => reload(JSON.parse(e.data).reason));

	events.addEventListener("css-update", (e) => {
		const paths = JSON.parse(e.data).paths;
		for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
			const url = new URL(link.href);
			if (!paths.includes(url.pathname)) continue;
			url.searchParams.set("t", Date.now());
			const next = link.cloneNode();
			next.href = url.href;
			next.addEventListener("load", () => link.remove(), { once: true });
			next.addEventListener("error", () => link.remove(), { once: true });
			link.after(next);
		}
	});

	events.addEventListener("js-update", async (e) => {
		const paths = JSON.parse(e.data).paths;
		const outcomes = [];
		const record = (ev) => outcomes.push(ev.detail);
		addEventListener("bearmetal:hmr", record);
		try {
			for (const path of paths) {
				const before = outcomes.length;
				await import(path + "?t=" + Date.now());
				if (outcomes.length === before) return reload(path + " replaced no component");
			}
		} catch (err) {
			console.error(err);
			return reload("a module failed to re-import");
		} finally {
			removeEventListener("bearmetal:hmr", record);
		}
		const declined = outcomes.find((o) => !o.ok);
		if (declined) return reload("<" + declined.tag + "> " + declined.reason);
		console.info("[bmdev] replaced", outcomes.map((o) => "<" + o.tag + ">").join(", "));
	});
})();
`;
