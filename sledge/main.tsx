import "@bearmetal/slag/global";
import "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

let _bundle = await bundle();

Deno.serve({ port: Number(Deno.env.get("BEARMETAL_SLEDGE_PORT") ?? 3000) }, async (r) => {
	const url = new URL(r.url);
	const character = url.pathname.match(/^\/characters\/([\w-]+\.svg)$/)?.[1];
	if (character) {
		try {
			return new Response(
				await Deno.readFile(new URL(`./characters/${character}`, import.meta.url)),
				{
					headers: { "Content-Type": "image/svg+xml" },
				},
			);
		} catch {
			return new Response("Not found", { status: 404 });
		}
	}
	if (url.pathname.endsWith(".js")) {
		return new Response(_bundle.outputFiles?.find((f) => f.path === url.pathname)?.text(), {
			headers: {
				"Content-Type": "text/javascript",
			},
		});
	}
	return new Response(
		(await (
			<html>
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Sledge Proving</title>
					<style $raw>
						{css`
							html {
								background: #1a1a1a;
							}
							.stage {
								position: fixed;
								top: 50%;
								left: 50%;
								transform: translate(-50%, -50%);
								display: flex;
								gap: 4rem;
								align-items: center;
							}
							bm-sledge {
								width: 200px;
							}
							/*body {
								display: flex;
								justify-content: center;
								align-items: center;
								flex-wrap: wrap;
							}*/
						`}
					</style>
					{_bundle.outputFiles?.map((f) => <script type="module" src={f.path}></script>)}
				</head>
				<body>
					<div class="stage">
						<bm-sledge debug></bm-sledge>
						<bm-sledge src="/characters/ghost.svg"></bm-sledge>
					</div>
				</body>
			</html>
		)).toString().replace(/^/g, "<!DOCTYPE html>"),
		{
			headers: {
				"Content-Type": "text/html",
			},
		},
	);
});

for await (const ev of Deno.watchFs(["./mod.tsx", "./lib"])) {
	if (ev.kind === "modify") {
		const next = await bundle().catch((e) => ({ errors: [e], outputFiles: undefined }));
		if (next.errors?.length || !next.outputFiles?.length) {
			console.error("Rebundle failed, keeping the previous bundle:", next.errors);
		} else _bundle = next;
	}
}

function bundle() {
	return Deno.bundle({
		entrypoints: ["./mod.tsx"],
		sourcemap: "inline",
		write: false,
		platform: "browser",
		codeSplitting: false,
		outputDir: "./",
	});
}
