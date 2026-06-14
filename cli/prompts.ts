// deno-lint-disable-must-await-calls
// deno-lint-ignore-file no-explicit-any
import { Cursor } from "./cursor.ts";
import { type CLICharEvent, InputManager } from "./InputManager.ts";
import { colorize } from "./style.ts";

export async function cliPrompt(
	this: any,
	message: string,
	defaultValue?: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const input: string[] = defaultValue ? defaultValue.split("") : [];
	let cursorPos = 0;

	Cursor.saveVisibility();
	Cursor.show();

	const im = InputManager.getInstance();
	const { row: promptRow } = await Cursor.getPosition();
	// deno-lint-ignore no-control-regex
	const ANSI = /\x1b\[[0-9;]*m/g;
	const visibleLength = (s: string) => s.replace(ANSI, "").length;
	const inputStart = visibleLength(message) + 1; // 0-indexed col where input begins

	const render = () => {
		const line = message + " " + input.join("");
		const moveTo = `\x1b[${inputStart + cursorPos}G`;
		Deno.stdout.writeSync(encoder.encode("\r\x1b[K" + line + moveTo));
		// Cursor.restorePosition();
		im.initCursor(promptRow, inputStart + cursorPos);
	};

	render();
	im.setBounds({
		top: promptRow,
		bottom: promptRow,
		left: inputStart,
		right: inputStart + input.length,
	});
	im.claim(this);

	const exit = () => {
		im.removeEventListener("enter", onEnter);
		im.removeEventListener("backspace", onBackspace);
		im.removeEventListener("delete", onDelete);
		im.removeEventListener("arrow-left", onLeft);
		im.removeEventListener("arrow-right", onRight);
		im.removeEventListener("char", onKey);
		Cursor.restoreVisibility();
		im.release(this);
		// im.deactivate();
		Deno.stdout.writeSync(new TextEncoder().encode("\n"));
	};

	let resolve: null | ((value: string) => void) = null;

	const onEnter = () => {
		exit();
		resolve?.(input.join(""));
	};

	const onBackspace = () => {
		cursorPos = im.getRelativeCursor();
		if (cursorPos > 0) {
			input.splice(cursorPos - 1, 1);
			im.updateBounds({ right: input.length + message.length + 1 });
			// cursorPos--;
			render();
		}
	};

	const onDelete = () => {
		cursorPos = im.getRelativeCursor();
		if (cursorPos < input.length) {
			input.splice(cursorPos, 1);
			render();
		}
	};

	const onLeft = () => {
		if (cursorPos > 0) {
			cursorPos--;
			render();
		}
	};

	const onRight = () => {
		if (cursorPos < input.length) {
			cursorPos++;
			render();
		}
	};

	const onKey = (e: Event) => {
		const ke = (e as CLICharEvent).detail;
		cursorPos = im.getRelativeCursor();
		input.splice(cursorPos, 0, ke.char);
		im.updateBounds({ right: input.length + message.length + 1 });
		render();
	};

	return await new Promise<string>((res) => {
		resolve = res;
		im.addEventListener("enter", onEnter);
		im.addEventListener("backspace", onBackspace);
		im.addEventListener("delete", onDelete);
		im.addEventListener("arrow-left", onLeft);
		im.addEventListener("arrow-right", onRight);
		im.addEventListener("char", onKey);
	});
}

export async function cliConfirm(message: string, def = false): Promise<boolean> {
	const im = InputManager.getInstance();
	let inpout = "";
	function isValidInput(input: string) {
		switch (input) {
			case "y":
			case "n":
				return inpout.length === 0;
			case "e":
				return inpout === "y";
			case "s":
				return inpout === "ye";
			case "o":
				return inpout === "n";
			default:
				return false;
		}
	}

	function onKey(e: CLICharEvent) {
		const ke = e.detail;
		const char = String.fromCharCode(ke.key);
		if (isValidInput(char)) {
			inpout += char;
		} else {
			e.stopImmediatePropagation();
		}
	}
	im.addEventListener("char", onKey);
	const yn = colorize(def ? "Y/n" : "y/N", "cyan");
	const value = await cliPrompt(`${colorize(message, "green")} (${yn})`).then((v) =>
		v ? v.charAt(0).toLowerCase() === "y" : def
	);
	im.removeEventListener("char", onKey);
	return value;
}

export async function cliAlert(message: string): Promise<void> {
	const im = InputManager.getInstance();
	const onKey = (e: CLICharEvent) => {
		e.stopImmediatePropagation();
	};
	im.addEventListener("char", onKey);
	await cliPrompt(
		message + colorize(" Press Enter to continue", "gray"),
	);
	im.removeEventListener("char", onKey);
}

export function cliLog(
	message: string | object | Array<unknown>,
): void {
	console.log(message);
}

if (import.meta.main) {
	const gay = await cliConfirm("Are you gay?", true);
	await cliAlert("Alert: you are " + (gay ? "gay" : "boring"));
	await cliPrompt("You ever think about where gaybies come from?");
}
