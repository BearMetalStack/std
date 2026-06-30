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

router.get("/", async () => {
	const u = new ThemeUtils("bearmetal", new URL(`./themes/bearmetal.theme.json`, import.meta.url));
	const colors = (await Chain.fromAsync(u.eachColor({ skipReferences: true }))).groupBy(([k]) =>
		k.split("-").slice(1, -1).join("-")
	);
	const page = (
		<html>
			<head>
				<title>BearMetal Drip - Palette</title>
				<ThemeStyle />
				<BaseStyle />
				<style raw>
					{css`
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
					`}
				</style>
			</head>
			<body>
				<div>
					{colors.groups.map((g) => (
						<div class="group">
							<h3>
								{g.__group?.replace(/-(\w)/g, (_, e) => " " + e.toUpperCase()).replace(
									/^\w/,
									(e) => e.toUpperCase(),
								)}
							</h3>
							<div class="flex">
								{g.map(([k, c]) => (
									<button
										type="button"
										data-color={c}
										data-name={k}
										class="btn"
										style={`--backgroundColor: ${c}`}
									>
										<p>{k.split("-").pop()}</p>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
				<script raw>
					{js`
					    document.addEventListener("click", e => {
							if (e.target && e.target.hasAttribute("data-color")) {
    							const color = e.target.dataset.color;
    							navigator.clipboard.writeText(color);
                                const toast = document.createElement("p")
                                toast.id = "toast"
                                toast.textContent = (\`Copied \$\{e.target.dataset.name\} to clipboard\`);
                                toast.addEventListener("animationend", e => {
                                    e.target.remove();
                                }, {once:true})
                                document.body.append(toast);
							}
						})
					`}
				</script>
			</body>
		</html>
	);

	return Html((await page).toString());
});

Deno.serve(router.handle);
