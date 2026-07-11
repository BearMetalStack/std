import { BaseStyle, ThemeStyle } from "@bearmetal/drip/ssr";
import { ThemeUtils } from "./ThemeUtils.ts";
import { Html, Router } from "@bearmetal/router";
import { Chain, css, js } from "@bearmetal/miscellanea";

const router = new Router();

router.use(async (_, next) => {
	try {
		return await next();
	} catch (e) {
		console.error(e);
		return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
	}
});

const HUE_METHODS = ["shorter", "longer", "increasing", "decreasing"] as const;
type HueMethod = typeof HUE_METHODS[number];

const DIRECTIONS = [
	"unset",
	"top",
	"top right",
	"right",
	"bottom right",
	"bottom",
	"bottom left",
	"left",
	"top left",
] as const;
type Direction = typeof DIRECTIONS[number];

const GRADIENT_KINDS = ["linear", "radial", "conic"] as const;
type GradientKind = typeof GRADIENT_KINDS[number];

type ColorSpace = "srgb" | "oklch";

function titleCase(s: string): string {
	return s.replace(/[-\s](\w)/g, (_, c) => " " + c.toUpperCase()).replace(
		/^\w/,
		(c) => c.toUpperCase(),
	);
}

function interpolationMethod(space: ColorSpace, hue: HueMethod): string {
	return space === "oklch" ? ` in oklch ${hue} hue` : ` in srgb`;
}

function buildGradient(
	kind: GradientKind,
	stops: string[],
	space: ColorSpace,
	hue: HueMethod,
	dir: Direction,
): string {
	const method = interpolationMethod(space, hue);
	const stopList = stops.join(", ");
	if (dir === "unset") dir = "" as Direction;
	switch (kind) {
		case "linear":
			return `linear-gradient(${dir ? "to " : ""}${dir}${method}, ${stopList})`;
		case "radial":
			return `radial-gradient(${dir ? "at " : ""}${dir}${method}, ${stopList})`;
		case "conic":
			return `conic-gradient(${dir ? "at " : ""}${dir}${method}, ${stopList})`;
	}
}

router.get("/", async (ctx) => {
	const u = new ThemeUtils("bearmetal", new URL(`./themes/bearmetal.theme.json`, import.meta.url));
	const colors = (await Chain.fromAsync(u.eachColor({ skipReferences: true }))).groupBy(([k]) =>
		k.split("-").slice(1, -1).join("-")
	);

	const stopsParam = ctx.url.searchParams.get("stops");
	const stops = stopsParam ? stopsParam.split(",").filter(Boolean) : [];
	const space: ColorSpace = ctx.url.searchParams.get("space") === "oklch" ? "oklch" : "srgb";
	const hueParam = ctx.url.searchParams.get("hue");
	const hue: HueMethod = (HUE_METHODS as readonly string[]).includes(hueParam ?? "")
		? hueParam as HueMethod
		: "shorter";
	const dirParam = ctx.url.searchParams.get("dir");
	const dir: Direction = (DIRECTIONS as readonly string[]).includes(dirParam ?? "")
		? dirParam as Direction
		: "right";

	const page = (
		<html>
			<head>
				<title>BearMetal Drip - Palette</title>
				<ThemeStyle />
				<BaseStyle />
				<style raw>
					{css`
						@view-transition {
							navigation: auto;
						}

						* {
							box-sizing: border-box;

							scrollbar-width: thin;
							scrollbar-color: var(--color-bearmetal-600) transparent;
						}

						body {
							display: flex;
							align-items: flex-start;
						}

						input,
						button,
						select,
						option {
							background: oklch(from var(--color-bg) calc(l * .8) c h);
							border-radius: .4rem;
							padding: .3rem .5rem;
							border: 1px solid white;
							&:not(.gradient-swatch):not(.swatch) {
								width: min-content;
								min-width: 100%;
							}
						}

						.main {
							flex: 1;
							min-width: 0;
							view-transition-name: main;
							overflow-y: scroll;
							height: 100vh;
						}

						.group {
							padding: 1rem 2rem;
							width: 100%;
						}

						.flex {
							display: flex;
							gap: 2rem;
							button {
								aspect-ratio: 1/1;
								display: flex;
								align-items: end;
								justify-content: left;
								color: contrast-color(var(--backgroundColor));
								background: var(--backgroundColor);
								padding: .5rem;
								flex: 1;

								border-radius: 1rem;
								border: 2px solid color-mix(in srgb, var(--backgroundColor) 50%, black);
							}
						}

						.gradient-panel {
							width: 320px;
							height: 100vh;
							flex-shrink: 0;
							padding: 1rem 2rem;
							position: sticky;
							top: 0;
							overflow-y: auto;
							border-left: 2px solid color-mix(in srgb, currentColor 15%, transparent);
						}

						.gradient-panel .controls {
							display: flex;
							flex-direction: column;
							gap: .75rem;
							margin-bottom: 1rem;
						}

						.gradient-panel .controls label {
							display: flex;
							flex-direction: column;
							gap: .25rem;
							font-size: .85rem;
						}

						.gradient-panel .controls select {
							padding: .35rem .5rem;
						}

						.stops-row {
							display: flex;
							gap: .35rem;
							flex-wrap: wrap;
							align-items: center;
							margin-bottom: 1rem;
						}

						.stops-row .stop {
							width: 1.5rem;
							height: 1.5rem;
							border-radius: 50%;
							border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
						}

						.stops-row button {
							min-width: unset !important;
							background: transparent;
							aspect-ratio: 1 / 1;
							border: none;
							padding: 0;
							margin-left: .5rem;
							color: var(--color-bearmetal-danger-300);
						}

						.gradient-grid {
							display: flex;
							flex-direction: column;
							gap: 1.5rem;
						}

						.gradient-swatch {
							border: none;
							padding: 0;
							background: none;
							cursor: pointer;
							display: flex;
							flex-direction: column;
							gap: .35rem;
							color: inherit;
							font: inherit;
						}

						.gradient-swatch .preview {
							aspect-ratio: 16/9;
							border-radius: 1rem;
							border: 2px solid var(--backgroundColor);
						}

						#toast {
							position: fixed;
							bottom: 3rem;
							left: 50%;
							translate: -50%;
							padding: 1rem;
							background-color: var(--color-success-bg);
							border-radius: var(--toast-border-radius);
							border: var(--color-success-vibrant) solid var(--border-2);
							color: var(--color-success-text);
							animation: fadeOut 300ms 3s forwards;
						}

						@keyframes fadeOut {
							from {
								opacity: 1;
							}
							to {
								opacity: 0;
							}
						}

						@media (max-width: 1240px) {
							.gradient-panel {
								width: min-content;
							}
						}
					`}
				</style>
			</head>
			<body>
				<div class="main">
					{colors.groups.map((g) => (
						<div class="group">
							<h3>{titleCase(g.__group ?? "")}</h3>
							<div class="flex">
								{g.map(([k, c]) => (
									<button
										type="button"
										data-color={c}
										data-name={k}
										class="btn swatch"
										style={`--backgroundColor: ${c}`}
									>
										<p>{k.split("-").pop()}</p>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
				{stops.length > 0 && (
					<div class="gradient-panel">
						<div class="stops-row">
							{stops.map((c) => <span class="stop" style={`background: ${c}`} title={c} />)}
							<button type="button" title="Clear" id="clear-stops">✕</button>
						</div>
						<div class="controls">
							<label>
								Color space
								<select data-control="space">
									<option value="srgb" selected={space === "srgb"}>sRGB</option>
									<option value="oklch" selected={space === "oklch"}>OKLCH</option>
								</select>
							</label>
							{space === "oklch" && (
								<label>
									Hue
									<select data-control="hue">
										{HUE_METHODS.map((h) => (
											<option value={h} selected={hue === h}>{titleCase(h)}</option>
										))}
									</select>
								</label>
							)}
							<label>
								Direction/Position
								<select data-control="dir">
									{DIRECTIONS.map((d) => (
										<option value={d} selected={dir === d}>{titleCase(d)}</option>
									))}
								</select>
							</label>
						</div>
						<div class="gradient-grid">
							{GRADIENT_KINDS.map((kind) => {
								const gradient = buildGradient(kind, stops, space, hue, dir);
								return (
									<button
										type="button"
										class="gradient-swatch"
										data-gradient={gradient}
										data-kind={kind}
									>
										<div class="preview" style={`background: ${gradient}`} />
										<p>{titleCase(kind)}</p>
									</button>
								);
							})}
						</div>
					</div>
				)}
				<script raw>
					{js`
					    function showToast(message) {
					        const toast = document.createElement("p")
					        toast.id = "toast"
					        toast.textContent = message;
					        toast.addEventListener("animationend", e => {
					            e.target.remove();
					        }, {once:true})
					        document.body.append(toast);
					    }

					    document.addEventListener("contextmenu", e => {
					        const target = e.target.closest("[data-color]");
					        if (!target) return;
					        e.preventDefault();
					        const url = new URL(location.href);
					        const existing = url.searchParams.get("stops");
					        const list = existing ? existing.split(",").filter(Boolean) : [];
					        list.push(target.dataset.color);
					        url.searchParams.set("stops", list.join(","));
					        location.href = url.toString();
					    });

					    document.addEventListener("click", e => {
							const colorTarget = e.target.closest("[data-color]");
							if (colorTarget) {
    							const color = colorTarget.dataset.color;
    							navigator.clipboard.writeText(color);
                                showToast(\`Copied \$\{colorTarget.dataset.name\} to clipboard\`);
                                return;
							}

							const gradientTarget = e.target.closest("[data-gradient]");
							if (gradientTarget) {
								navigator.clipboard.writeText(gradientTarget.dataset.gradient);
								showToast(\`Copied \$\{gradientTarget.dataset.kind\} gradient to clipboard\`);
								return;
							}

							if (e.target.closest("#clear-stops")) {
								const url = new URL(location.href);
								url.searchParams.delete("stops");
								location.href = url.toString();
							}
						});

						document.addEventListener("change", e => {
							const control = e.target.closest("[data-control]");
							if (!control) return;
							const url = new URL(location.href);
							url.searchParams.set(control.dataset.control, control.value);
							location.href = url.toString();
						});
					`}
				</script>
			</body>
		</html>
	);

	return Html((await page).toString());
});

Deno.serve(router.handle);
