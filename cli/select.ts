/**
 * Selection menus.
 *
 * These used to render from the screen's home position, which is only meaningful
 * if you own the whole screen — so they took over the alternate screen to make it
 * true, destroying whatever had been printed before them. They now render inline,
 * below existing output, and collapse to a summary line when answered.
 *
 * The alternate screen is still used, but only when a list genuinely cannot fit
 * on screen, where the alternative is pushing all the surrounding context out of
 * view anyway.
 * @module
 */

import type { KeyEvent } from "./input/mod.ts";
import { type CliSession, getOrCreateSession, runWidget } from "./render/mod.ts";
import { NotInteractiveError } from "./prompts.ts";
import { colorize } from "./style.ts";

/** A choice: a label, or a `[label, value]` pair. */
export type SelectOption = string | [string, string];

/** A choice whose selection runs a callback. */
export type SelectCallback = (label: string) => unknown | Promise<unknown>;

/** A multi-select choice: a label, or a `[label, callback]` pair. */
export type MultiSelectOption = string | [string, SelectCallback];

/** Shared menu configuration. */
export interface SelectMenuConfig {
	initialSelection?: number;
	initialSelections?: number[];
	session?: CliSession;
	/** Keeps the menu inline even when it does not fit, instead of taking the screen. */
	neverEscalate?: boolean;
}

/** Configuration for {@linkcode multiSelectMenuInteractive}. */
export interface MultiSelectMenuConfig extends SelectMenuConfig {
	/** Prepends a "Select All" entry. */
	allOption?: boolean;
}

/** Prints a numbered list and reads a choice with the platform prompt. */
export function selectMenu(items: string[]): string {
	const menu = items.map((i, index) => `${index + 1}. ${i}`).join("\n");
	console.log(menu);
	const index = parseInt(prompt("Please select an option:") || "1") - 1;
	return items[index];
}

function labelOf(option: SelectOption | MultiSelectOption): string {
	return Array.isArray(option) ? option[0] : option;
}

/**
 * Computes the slice of a list to show, keeping the selection in view.
 *
 * `capacity` is rows available for options — the question line is already
 * accounted for by the caller. The old version reserved `rows - 1` for options
 * and *then* added the question on top, which overflowed by exactly one row.
 */
function window(total: number, selected: number, capacity: number): [number, number] {
	if (total <= capacity) return [0, total];
	let start = Math.max(0, selected - Math.floor(capacity / 2));
	start = Math.min(start, total - capacity);
	return [start, start + capacity];
}

/**
 * Presents a list and returns the chosen value, or `null` if dismissed.
 *
 * ```ts
 * const db = await selectMenuInteractive("Database?", ["postgres", "kv"]);
 * ```
 */
export async function selectMenuInteractive(
	q: string,
	options: SelectOption[],
	config: SelectMenuConfig = {},
): Promise<string | null> {
	if (options.length === 0) return null;

	const { session, release } = getOrCreateSession(config.session);
	const plain = session.mode === "plain";
	release();
	if (plain) throw new NotInteractiveError("selectMenuInteractive");

	let selected = Math.min(
		Math.max(config.initialSelection ?? 0, 0),
		options.length - 1,
	);
	let typed = "";

	const pad = (i: number, marker?: string) => {
		const padded = `${i + 1}. `.padStart(options.length.toString().length + 4);
		return marker ? padded.replace(" ", marker.substring(0, 1)) : padded;
	};

	const valueOf = (i: number) => {
		const option = options[i];
		return Array.isArray(option) ? option[1] : option;
	};

	return await runWidget<string | null>({
		session: config.session,
		neverEscalate: config.neverEscalate,
		naturalHeight: () => options.length + 1,
		frame: (ctl) => {
			const budget = ctl.session.availableRows;
			const showQuestion = budget >= 2;
			const capacity = Math.max(1, showQuestion ? budget - 1 : budget);
			const [start, end] = window(options.length, selected, capacity);
			const lines = showQuestion ? [colorize(q, "green")] : [];
			for (let i = start; i < end; i++) {
				const label = labelOf(options[i]);
				lines.push(
					i === selected ? `${pad(i, ">")}${colorize(label, "porple")}` : `${pad(i)}${label}`,
				);
			}
			return lines;
		},
		afterRender: (ctl) => ctl.session.hideCursor(),
		onKey: (event: KeyEvent, ctl) => {
			switch (event.name) {
				case "up":
					selected = (selected - 1 + options.length) % options.length;
					break;
				case "down":
					selected = (selected + 1) % options.length;
					break;
				case "home":
					selected = 0;
					break;
				case "end":
					selected = options.length - 1;
					break;
				case "pageup":
					selected = Math.max(0, selected - ctl.session.availableRows);
					break;
				case "pagedown":
					selected = Math.min(options.length - 1, selected + ctl.session.availableRows);
					break;
				case "backspace":
					typed = typed.slice(0, -1);
					return;
				case "escape":
					ctl.region.clear();
					ctl.resolve(null);
					return;
				case "enter": {
					if (typed) {
						const parsed = parseInt(typed, 10);
						if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= options.length) {
							selected = parsed - 1;
						}
						typed = "";
					}
					const value = valueOf(selected);
					ctl.region.commit([
						`${colorize(q, "green")} - ${colorize(value, "porple")}`,
					]);
					ctl.resolve(value);
					return;
				}
				case "char":
					if (event.ctrl) return;
					if (/\d/.test(event.char ?? "")) typed += event.char;
					return;
				default:
					return;
			}
			ctl.rerender();
		},
	});
}

/**
 * Presents a list with checkboxes and returns every chosen label, or `null` if
 * dismissed.
 */
export async function multiSelectMenuInteractive(
	q: string,
	options: MultiSelectOption[],
	config: MultiSelectMenuConfig = {},
): Promise<string[] | null> {
	const entries: MultiSelectOption[] = config.allOption ? ["Select All", ...options] : [...options];
	if (entries.length === 0) return null;

	const { session, release } = getOrCreateSession(config.session);
	const plain = session.mode === "plain";
	release();
	if (plain) throw new NotInteractiveError("multiSelectMenuInteractive");

	const labels = entries.map(labelOf);
	let selected = Math.min(Math.max(config.initialSelection ?? 0, 0), entries.length - 1);
	let chosen = new Set(config.initialSelections ?? []);

	const toggleAll = () => {
		if (chosen.has(0)) chosen = new Set();
		else chosen = new Set(entries.map((_, i) => i));
	};

	/** Keeps "Select All" checked only while everything else is. */
	const reconcileAll = () => {
		if (!config.allOption) return;
		if (chosen.size !== entries.length) chosen.delete(0);
	};

	const result = await runWidget<number[] | null>({
		session: config.session,
		neverEscalate: config.neverEscalate,
		naturalHeight: () => entries.length + 1,
		frame: (ctl) => {
			const budget = ctl.session.availableRows;
			const showQuestion = budget >= 2;
			const capacity = Math.max(1, showQuestion ? budget - 1 : budget);
			const [start, end] = window(entries.length, selected, capacity);
			const lines = showQuestion ? [colorize(q, "green")] : [];
			for (let i = start; i < end; i++) {
				const box = chosen.has(i) ? colorize("◼", "green") : "◻";
				lines.push(
					i === selected ? `> ${box} ${colorize(labels[i], "porple")}` : `  ${box} ${labels[i]}`,
				);
			}
			return lines;
		},
		afterRender: (ctl) => ctl.session.hideCursor(),
		onKey: (event: KeyEvent, ctl) => {
			switch (event.name) {
				case "up":
					selected = (selected - 1 + entries.length) % entries.length;
					break;
				case "down":
					selected = (selected + 1) % entries.length;
					break;
				case "home":
					selected = 0;
					break;
				case "end":
					selected = entries.length - 1;
					break;
				case "escape":
					ctl.region.clear();
					ctl.resolve(null);
					return;
				case "enter": {
					const picked = [...chosen]
						.filter((i) => !(config.allOption && i === 0))
						.sort((a, b) => a - b);
					if (picked.length > 0) {
						const shown = picked.slice(0, 3).map((i) => labels[i]);
						const remaining = picked.length - shown.length;
						ctl.region.commit([
							`${colorize(q, "green")} - ${colorize(shown.join(", "), "porple")}${
								remaining > 0 ? `, and ${remaining} more` : ""
							}`,
						]);
					} else {
						ctl.region.commit([`${colorize(q, "green")} - ${colorize("none", "gray")}`]);
					}
					ctl.resolve(picked);
					return;
				}
				case "char": {
					if (event.ctrl || event.char !== " ") return;
					if (config.allOption && selected === 0) toggleAll();
					else if (chosen.has(selected)) chosen.delete(selected);
					else chosen.add(selected);
					reconcileAll();
					break;
				}
				default:
					return;
			}
			ctl.rerender();
		},
	});

	if (!result) return null;

	for (const index of result) {
		const entry = entries[index];
		if (Array.isArray(entry)) await entry[1](entry[0]);
	}
	return result.map((i) => labels[i]);
}
