// deno-lint-ignore-file no-explicit-any
import { Cursor } from "./cursor.ts";
import { type CLICharEvent, InputManager } from "./InputManager.ts";
import { colorize } from "./style.ts";

interface ISelectMenuConfig {
	initialSelection?: number;
	initialSelections?: number[];
}

type callback = (...args: any[]) => any;

export function selectMenu(items: string[]): string {
	const menu = items.map((i, index) => `${index + 1}. ${i}`).join("\n");
	console.log(menu);
	const index = parseInt(prompt("Please select an option:") || "1") - 1;
	return items[index];
}

export async function selectMenuInteractive(
	this: any,
	q: string,
	options: (string | [string, string])[],
	config?: ISelectMenuConfig,
): Promise<string | null> {
	Deno.stdin.setRaw(true);
	let selected = config?.initialSelection ?? 0;
	const encoder = new TextEncoder();
	Cursor.saveVisibility();
	Cursor.hide();

	function renderMenu() {
		const { rows } = Deno.consoleSize();
		const maxHeight = Math.min(rows - 1, options.length);
		let startPoint = Math.max(0, selected - Math.floor(maxHeight / 2));
		const endPoint = Math.min(options.length, startPoint + maxHeight);
		if (endPoint - startPoint < maxHeight) {
			startPoint = Math.max(0, options.length - maxHeight);
		}

		const lines: string[] = [];
		lines.push(colorize(q, "green"));
		for (let i = startPoint; i < endPoint; i++) {
			let option = options[i];
			if (Array.isArray(option)) option = option[0];
			if (i === selected) {
				lines.push(`${numberAndPadding(i, ">")}${colorize(option, "porple")}`);
			} else {
				lines.push(`${numberAndPadding(i)}${option}`);
			}
		}

		let out = "\x1b[H";
		for (const line of lines) {
			out += `\r\x1b[K${line}\n`;
		}
		Deno.stdout.writeSync(encoder.encode(out.replace(/\n$/, "")));
	}

	function numberAndPadding(i: number, prefix?: string) {
		const padded = `${i + 1}. `.padStart(
			options.length.toString().length + 4,
		);
		return prefix ? padded.replace(" ", prefix.substring(0, 1)) : padded;
	}

	let inputBuffer = "";

	const im = InputManager.getInstance();

	const exit = () => {
		im.removeEventListener("arrow-up", onUp);
		im.removeEventListener("arrow-down", onDown);
		im.removeEventListener("char", onKey);
		im.removeEventListener("backspace", onBackspace);
		im.removeEventListener("enter", onEnter);
		im.removeEventListener("escape", onEscape);
		im.release(this);
		Cursor.exitAltBuffer();
		Cursor.restoreVisibility();
	};
	const onUp = (e: Event) => {
		e.stopImmediatePropagation();
		selected = (selected - 1 + options.length) % options.length;
		renderMenu();
	};

	const onDown = (e: Event) => {
		e.stopImmediatePropagation();
		selected = (selected + 1) % options.length;
		renderMenu();
	};

	const onKey = (e: CLICharEvent) => {
		e.stopImmediatePropagation();
		const ke = e.detail;
		const char = String.fromCharCode(ke.key);
		inputBuffer += char;
	};

	const onBackspace = (e: Event) => {
		e.stopImmediatePropagation();
		inputBuffer = inputBuffer.slice(0, -1);
	};

	let resolve: null | ((value: string | null) => void) = null;

	const onEscape = () => {
		exit();
		resolve?.(null);
	};

	const onEnter = (e: Event) => {
		e.stopImmediatePropagation();
		exit();
		if (inputBuffer) {
			const parsed = parseInt(inputBuffer);
			if (!isNaN(parsed)) {
				selected = parsed - 1;
			}
			inputBuffer = "";
		}
		const result = Array.isArray(options[selected])
			? options[selected][1]
			: options[selected] as string;
		Deno.stdout.writeSync(
			encoder.encode(`${colorize(q, "green")} - ${colorize(result, "porple")}\n`),
		);
		resolve?.(result);
	};

	Cursor.enterAltBuffer();
	im.claim(this);
	renderMenu();
	const final = await new Promise<string | null>((res) => {
		resolve = res;
		im.addEventListener("char", onKey);
		im.addEventListener("backspace", onBackspace);
		im.addEventListener("enter", onEnter);
		im.addEventListener("arrow-up", onUp);
		im.addEventListener("arrow-down", onDown);
		im.addEventListener("escape", onEscape);
	});

	return final;
}

export async function multiSelectMenuInteractive(
	this: any,
	q: string,
	options: (string | [string, callback])[],
	config?: ISelectMenuConfig & { allOption?: boolean },
): Promise<string[] | null> {
	Deno.stdin.setRaw(true);
	let selected = 0;
	let selectedOptions: number[] = config?.initialSelections || [];
	const encoder = new TextEncoder();

	Cursor.saveVisibility();
	Cursor.hide();

	if (config?.allOption) {
		options.unshift("Select All");
	}
	const rawValues = options.map((i) => typeof i === "string" ? i : i[0]);

	if (rawValues.length !== options.length) {
		throw new Error("Duplicate options in multi-select menu");
	}

	const checkSelectAll = () => {
		if (selectedOptions.includes(0)) {
			selectedOptions = [];
		} else {
			selectedOptions = Array.from(options).map((_, i) => i);
		}
	};

	const validateSelectAll = () => {
		const allPresent = selectedOptions.length == options.length;
		if (!allPresent && config?.allOption) {
			selectedOptions = selectedOptions.filter((e) => e != 0);
		}
	};

	function renderMenu() {
		const { rows } = Deno.consoleSize();
		const maxHeight = Math.min(rows - 1, options.length);
		let startPoint = Math.max(0, selected - Math.floor(maxHeight / 2));
		const endPoint = Math.min(options.length, startPoint + maxHeight);
		if (endPoint - startPoint < maxHeight) {
			startPoint = Math.max(0, options.length - maxHeight);
		}

		const lines: string[] = [];
		lines.push(colorize(q, "green"));
		for (let i = startPoint; i < endPoint; i++) {
			const option = rawValues[i];
			const checkbox = selectedOptions.includes(i) ? colorize("◼", "green") : "◻";
			if (i === selected) {
				lines.push(`> ${checkbox} ${colorize(option, "porple")}`);
			} else {
				lines.push(`  ${checkbox} ${option}`);
			}
		}

		let out = "\x1b[H";
		for (const line of lines) {
			out += `\r\x1b[K${line}\n`;
		}
		Deno.stdout.writeSync(encoder.encode(out.replace(/\n$/, "")));
	}

	const im = InputManager.getInstance();
	// im.claim(this);

	let resolve = null as null | ((value: number[] | null) => void);

	const exit = () => {
		im.removeEventListener("arrow-up", onUp);
		im.removeEventListener("arrow-down", onDown);
		im.removeEventListener("char", onSpace);
		im.removeEventListener("enter", onEnter);
		im.removeEventListener("escape", onEscape);
		Cursor.restoreVisibility();
		im.release(this);
		Cursor.exitAltBuffer();
	};

	const onUp = (e: Event) => {
		e.stopImmediatePropagation();
		selected = (selected - 1 + options.length) % options.length;
		renderMenu();
	};

	const onDown = (e: Event) => {
		e.stopImmediatePropagation();
		selected = (selected + 1) % options.length;
		renderMenu();
	};

	const onSpace = (e: CLICharEvent) => {
		if (e.detail.char !== " ") return;
		e.stopImmediatePropagation();
		if (config?.allOption && selected === 0) {
			checkSelectAll();
		} else if (selectedOptions.includes(selected)) {
			selectedOptions = selectedOptions.filter((i) => i !== selected);
		} else {
			selectedOptions.push(selected);
		}
		validateSelectAll();
		renderMenu();
	};

	const onEscape = () => {
		exit();
		resolve?.(null);
	};

	const onEnter = (e: Event) => {
		e.stopImmediatePropagation();
		exit();
		const results = selectedOptions
			.filter((i) => !(config?.allOption && i === 0))
			.map((i) => rawValues[i]);
		if (results.length > 0) {
			const shownRes = results.slice(0, 3);
			const remaining = results.length - 3;
			Deno.stdout.writeSync(
				encoder.encode(
					`${colorize(q, "green")} - ${colorize(shownRes.join(", "), "porple")}${
						remaining > 0 ? `, and ${remaining} more` : ""
					}\n`,
				),
			);
		}
		resolve?.(selectedOptions);
	};

	Cursor.enterAltBuffer();
	im.claim(this);
	renderMenu();

	const selections = await new Promise<number[] | null>((res) => {
		resolve = res;
		im.addEventListener("arrow-up", onUp);
		im.addEventListener("arrow-down", onDown);
		im.addEventListener("char", onSpace);
		im.addEventListener("enter", onEnter);
		im.addEventListener("escape", onEscape);
	});
	if (!selections) return null;
	for (const optionI of selections) {
		const option = options[optionI];
		if (Array.isArray(option)) {
			await option[1](option[0]);
		}
	}
	const final = selectedOptions.map((i) => rawValues[i]);

	return final;
}

if (import.meta.main) {
	// InputManager.addEventListener("exit", () => InputManager.getInstance().deactivate());

	const _val = await selectMenuInteractive("choose a fruit", [
		"apple",
		"banana",
		"cherry",
		"date",
		"elderberry",
		"fig",
		"grape",
		"honeydew",
		"ilama",
		"jackfruit",
		"kiwi",
		"lemon",
		"mango",
		"nectarine",
		"orange",
		"papaya",
		"peach",
		"pineapple",
		"pomegranate",
		"quince",
		"raspberry",
		"strawberry",
		"tangerine",
		"watermelon",
	], {});
	// console.log(val);

	const _val2 = await multiSelectMenuInteractive("choose some fruit", [
		"apple",
		"banana",
		"cherry",
		"date",
		"elderberry",
		"fig",
		"grape",
		"honeydew",
		"ilama",
		"jackfruit",
		"kiwi",
		"lemon",
		"mango",
		"nectarine",
		"orange",
		"papaya",
		"quince",
		"raspberry",
		"strawberry",
		"tangerine",
		"udara",
		"vogelbeere",
		"watermelon",
		"ximenia",
		"yuzu",
		"zucchini",
	], { allOption: true });
}
