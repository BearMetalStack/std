import { createAnodized, loadFont } from "@bearmetal/anodized";
import { scene } from "./scene.ts";

const canvas = document.querySelector("canvas")!;
const a = await createAnodized(canvas, { font: await loadFont("/Vera.ttf") });
a.camera.pan(40, 40);
a.viewport();
a.loop((f) => scene(f, true));

const status = document.querySelector("p")!;
a.onClick(({ hit, target, button, x, y }) => {
	const where = `(${x.toFixed(0)}, ${y.toFixed(0)})`;
	status.textContent = hit
		? `button ${button} clicked "${target!.label ?? target!.id}" (${target!.kind}) at ${where}`
		: `button ${button} clicked empty space at ${where}`;
});
a.onLineClick(({ target, point, fraction, button }) => {
	const at = `(${point!.x.toFixed(0)}, ${point!.y.toFixed(0)})`;
	status.textContent = `button ${button} clicked ${target!.kind} "${target!.id}" at ${at}, ${
		Math.round(fraction! * 100)
	}% along`;
});
