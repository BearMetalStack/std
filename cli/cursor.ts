import { InputManager } from "./InputManager.ts";

export class Cursor {
	private static visible = true;
	private static visibilityStack: boolean[] = [];

	static show() {
		this.visible = true;
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
	}

	static hide() {
		this.visible = false;
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
	}

	static saveVisibility() {
		this.visibilityStack.push(this.visible);
	}

	static restoreVisibility() {
		if (this.visibilityStack.pop()) {
			this.show();
		} else {
			this.hide();
		}
	}

	static savePosition() {
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b7"));
	}

	static restorePosition() {
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b8"));
	}

	static enterAltBuffer() {
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?1049h"));
		InputManager.addEventListener("exit", this.exitAltBuffer, { once: true });
		addEventListener("beforeunload", this.exitAltBuffer, { once: true });
		Deno.addSignalListener("SIGINT", this.exitAltBuffer);
		Deno.addSignalListener("SIGTERM", this.exitAltBuffer);
	}

	static exitAltBuffer() {
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?1049l"));
		InputManager.removeEventListener("exit", this.exitAltBuffer);
		removeEventListener("beforeunload", this.exitAltBuffer);
		Deno.removeSignalListener("SIGINT", this.exitAltBuffer);
		Deno.removeSignalListener("SIGTERM", this.exitAltBuffer);
	}

	static async getPosition(): Promise<{ row: number; col: number }> {
		const decoder = new TextDecoder();
		Deno.stdin.setRaw(true);
		Deno.stdout.writeSync(new TextEncoder().encode("\x1b[6n"));
		const buf = new Uint8Array(32);
		const n = await Deno.stdin.read(buf);
		Deno.stdin.setRaw(false);
		const match = decoder.decode(buf.subarray(0, n ?? 0)).match(
			// deno-lint-ignore no-control-regex
			/\x1b\[(\d+);(\d+)R/,
		);
		return match
			? { row: parseInt(match[1]) - 1, col: parseInt(match[2]) - 1 }
			: { row: 0, col: 0 };
	}
}
