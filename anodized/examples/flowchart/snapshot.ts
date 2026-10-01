import { createHeadless, loadFont } from "@bearmetal/anodized";
import { scene } from "./scene.ts";

const font = await loadFont(
	await Deno.readFile(new URL("../../testdata/Vera.ttf", import.meta.url)),
);
const a = await createHeadless({ width: 1, height: 1, font });
const img = await a.snapshot((f) => scene(f), { scale: 2, background: "#ffffff" });
await Deno.writeFile("flowchart.png", await img.png());
console.log(`wrote flowchart.png (${img.width}x${img.height})`);
a.destroy();
