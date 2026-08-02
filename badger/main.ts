import { FontData, loadFontData } from "./fonts/loadFontData.ts";
import { type BadgeSection, BM, renderBadge } from "./svg/gen.ts";

Deno.serve({ port: 8080 }, async (req) => {
	const url = new URL(req.url);

	if (url.pathname === "/sample") {
		return new Response(await Deno.readTextFile("sample.html"), {
			headers: { "Content-Type": "text/html" },
		});
	}

	if (url.pathname === "/styles.css") {
		let styles = "";
		const fontFilter = url.searchParams.get("fonts");
		for await (const entry of Deno.readDir(".bearmetal/fonts")) {
			if (!entry.isDirectory) continue;
			if (fontFilter && !fontFilter.toLowerCase().includes(entry.name)) {
				continue;
			}
			try {
				const s = await Deno.readTextFile(
					".bearmetal/fonts/" + entry.name + "/style.css",
				);
				if (s) styles += s;
			} catch {
				//
			}
		}
		return new Response(styles, {
			headers: { "Content-Type": "text/css" },
		});
	}

	if (url.pathname === "/__colors") {
		const colors = Object.keys(BM).map(
			(
				c,
			) => [
				c.toLowerCase().replace("_", "-"),
				c.toLowerCase().replace("_", " "),
			],
		);
		return new Response(JSON.stringify(colors), {
			headers: { "Content-Type": "application/json" },
		});
	}

	const label = url.searchParams.get("label") ?? "BearMetal";
	const labelColor = BM[
		url.searchParams.get("labelColor")?.toUpperCase().replace(
			"-",
			"_",
		) as keyof typeof BM ??
			"LABEL"
	] ??
		BM.LABEL;
	const value = url.searchParams.get("value") ?? "Badger";
	const valueColor = BM[
		url.searchParams.get("valueColor")?.toUpperCase().replace(
			"-",
			"_",
		) as keyof typeof BM ??
			"BRAND"
	] ??
		BM.BRAND;
	const extra = url.searchParams.get("extra");
	const extraColor = BM[
		url.searchParams.get("extraColor")?.toUpperCase().replace(
			"-",
			"_",
		) as keyof typeof BM ??
			"BRAND_DARK"
	] ??
		BM.BRAND_DARK;
	const variant = url.searchParams.get("variant") as
		| "filled"
		| "pill"
		| "outlined"
		| undefined;
	const fontMode = url.searchParams.get("fontMode") ?? "embed";
	const font = url.searchParams.get("fontFamily") ?? fontMode === "embed" ? "monofur" : "system-ui";
	const fontStyle = url.searchParams.get("fontStyle") ?? "regular";
	const fontEm = Number(url.searchParams.get("fontEm") ?? ".6");
	let fontData: FontData | undefined;
	try {
		fontData = await loadFontData(font);
	} catch {
		// It's ok if we get no font data, if a little less than ideal
	}

	const fontSize = Number(url.searchParams.get("fontSize") ?? "14");

	const badge = renderBadge({
		fontBase64: fontMode === "embed" ? fontData?.b64s[fontStyle] : undefined,
		variant,
		fontFamily: font,
		fontSize,
		sections: [
			labelColor(label),
			valueColor(value),
			extra ? extraColor(extra) : undefined,
		].slice(0, extra ? 3 : 2) as [BadgeSection, BadgeSection],
		measureWidth(codepoint) {
			if (!fontData) return fontSize * fontEm;
			const char = String.fromCharCode(codepoint);
			return (fontData.widths[fontStyle][char] ||
				fontData.widths[fontStyle]["M"]) * fontSize;
		},
	});

	return new Response(badge, {
		headers: {
			"Content-Type": "image/svg+xml",
			"Cache-Control": url.host.includes("localhost") ? "no-cache" : "public, max-age=3600",
		},
	});
});
