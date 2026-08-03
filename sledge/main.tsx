import "@bearmetal/slag/global";
import "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

let _bundle = await bundle();

Deno.serve({ port: 3000 }, async (r) => {
	const url = new URL(r.url);
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
							bm-sledge {
								position: fixed;
								top: 50%;
								left: 50%;
								transform: translate(-50%, -50%);
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
					{Array.from({ length: 1 }, () => (
						<bm-sledge>
						</bm-sledge>
					))}
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

for await (const ev of Deno.watchFs("./mod.tsx")) {
	if (ev.kind === "modify") {
		_bundle = await bundle();
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
