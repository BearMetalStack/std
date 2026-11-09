import { BMElement, prop } from "@bearmetal/app";
import type { Signal } from "@bearmetal/app/signals";
import type { BMTemplate } from "@bearmetal/app/types";
import { defaultRules } from "../rules/mod.ts";
import type { StagedRule } from "../types.ts";
import { collectMeta, editorRules } from "./annotate.ts";
import { activeState, matchesShortcut, selectionFor, setBlock, toggleInline } from "./commands.ts";
import { markdownToRich, richToMarkdown } from "./convert.ts";
import { editorStyles } from "./styles.ts";
import type { EditorChangeDetail, EditorMeta, EditorView } from "./types.ts";

const VIEWS: { view: EditorView; label: string }[] = [
	{ view: "rich", label: "Rich" },
	{ view: "raw", label: "Raw" },
	{ view: "preview", label: "Preview" },
];

/** `part` is a real attribute the JSX prop types do not list; spreading sidesteps the excess-property check. */
const part = (name: string) => ({ part: name });

/** Shows a slot's wrapper only while something is assigned to the slot. */
const reveal = (e: Event): void => {
	const slot = e.target as HTMLSlotElement;
	slot.parentElement!.hidden = slot.assignedNodes({ flatten: true }).length === 0;
};

const FLUSH_MS = 150;
const HISTORY_LIMIT = 100;

type Refs = {
	rich: HTMLElement;
	raw: HTMLTextAreaElement;
	preview: HTMLElement;
	block: HTMLSelectElement;
	linkRow: HTMLFormElement;
	linkInput: HTMLInputElement;
};

/**
 * A markdown editor with rich, raw and preview views.
 *
 * Rules are functions, so they cannot arrive through an attribute: a subclass
 * carries them as `static rules` (see {@link defineEditor}). The toolbar is
 * derived from the editor metadata those rules carry, so a rule set with
 * different styles gets a different toolbar without touching this class.
 *
 * `value` is the markdown, and the only source of truth. The rich view is a
 * projection of it that is rewritten only when `value` changed from somewhere
 * other than the rich view itself, so typing never fights the caret.
 */
export class ClawmarkEditor extends BMElement<Refs> {
	static rules: StagedRule[] = editorRules(defaultRules());

	static override shadow = "open" as const;
	static override client = true;
	static formAssociated = true;

	static override get observedAttributes(): readonly string[] {
		return [...super.observedAttributes, "value"];
	}

	@prop()
	accessor view: Signal.State<EditorView> = this.signal<EditorView>("rich");
	@prop()
	accessor readonly: Signal.State<boolean> = this.signal(false);
	@prop()
	accessor placeholder: Signal.State<string> = this.signal("");

	#md = this.signal("");
	#internals = typeof this.attachInternals === "function" ? this.attachInternals() : undefined;
	#lastFromRich: string | undefined;
	#lastChange = "";
	#flushTimer: ReturnType<typeof setTimeout> | undefined;
	#saved: Range | undefined;
	#pendingLink: EditorMeta | undefined;
	#history: string[] = [];
	#at = -1;

	get #rules(): StagedRule[] {
		return (this.constructor as typeof ClawmarkEditor).rules;
	}
	get #meta() {
		return collectMeta(this.#rules);
	}

	/** The markdown. Assigning replaces the content without emitting events. */
	get value(): string {
		return this.#md.get();
	}
	set value(next: string) {
		this.#md.set(String(next ?? ""));
	}

	override attributeChangedCallback(name: string, old: string | null, value: string | null) {
		if (name === "value") {
			if (value !== null && value !== this.#md.get()) this.#md.set(value);
			return;
		}
		super.attributeChangedCallback(name, old, value);
	}

	/**
	 * Applies a toolbar style by its key (`"bold"`, `"h2"`, `"link"`), exactly as
	 * the matching control would. This is how controls placed in the
	 * `additional-controls` or `below-controls` slots reach the editor. They
	 * should cancel `mousedown` so pressing them does not move the selection.
	 */
	apply(key: string, value?: string): void {
		const { blocks, inlines } = this.#meta;
		const meta = [...blocks, ...inlines].find((m) => m.key === key);
		if (!meta) return;
		if (meta.kind === "inline" && value === undefined) this.#toggle(meta);
		else this.#apply(meta, value);
	}

	#emit(type: "input" | "change"): void {
		this.dispatchEvent(
			new CustomEvent<EditorChangeDetail>(type, {
				bubbles: true,
				composed: true,
				detail: { value: this.#md.get() },
			}),
		);
	}

	#settle(): void {
		if (this.#md.get() === this.#lastChange) return;
		this.#lastChange = this.#md.get();
		this.#emit("change");
	}

	// --- rich view -----------------------------------------------------------

	#rich(): HTMLElement | undefined {
		return this.refs.rich.get() as HTMLElement | undefined;
	}

	#renderRich(markdown: string): void {
		const rich = this.#rich();
		if (!rich) return;
		rich.innerHTML = markdownToRich(markdown, this.#rules) || "<p><br></p>";
		rich.toggleAttribute("data-empty", markdown.trim() === "");
	}

	#flush(): void {
		clearTimeout(this.#flushTimer);
		const rich = this.#rich();
		if (!rich) return;
		const markdown = richToMarkdown(rich, this.#rules);
		rich.toggleAttribute("data-empty", markdown.trim() === "");
		if (markdown === this.#md.get()) return;
		this.#lastFromRich = markdown;
		this.#md.set(markdown);
		this.#remember(markdown);
		this.#emit("input");
	}

	#remember(markdown: string): void {
		this.#history.length = this.#at + 1;
		this.#history.push(markdown);
		if (this.#history.length > HISTORY_LIMIT) this.#history.shift();
		this.#at = this.#history.length - 1;
	}

	#step(direction: -1 | 1): void {
		this.#flush();
		const next = this.#at + direction;
		if (next < 0 || next >= this.#history.length) return;
		this.#at = next;
		const markdown = this.#history[next];
		this.#lastFromRich = markdown;
		this.#renderRich(markdown);
		this.#md.set(markdown);
		this.#emit("input");
	}

	#restoreSelection(): HTMLElement | undefined {
		const rich = this.#rich();
		if (!rich) return;
		const sel = selectionFor(rich);
		if (sel && this.#saved) {
			sel.removeAllRanges();
			sel.addRange(this.#saved);
		}
		return rich;
	}

	#apply(meta: EditorMeta, value?: string): void {
		const rich = this.#restoreSelection();
		if (!rich || this.readonly.get()) return;
		rich.focus();
		if (meta.kind === "block") setBlock(rich, meta);
		else toggleInline(rich, meta, value);
		this.#flush();
		this.#refreshToolbar();
	}

	#toggle(meta: EditorMeta): void {
		const rich = this.#restoreSelection();
		if (!rich) return;
		const active = activeState(rich, [meta]).inlines.has(meta.key);
		if (meta.prompt && !active) {
			this.#pendingLink = meta;
			const row = this.refs.linkRow.get();
			if (row) {
				row.hidden = false;
				this.refs.linkInput.get()?.focus();
			}
			return;
		}
		this.#apply(meta);
	}

	#refreshToolbar = (): void => {
		const rich = this.#rich();
		const root = this.shadowRoot;
		if (!rich || !root || this.view.get() !== "rich") return;
		const range = selectionFor(rich)?.rangeCount ? selectionFor(rich)!.getRangeAt(0) : undefined;
		if (!range || !rich.contains(range.commonAncestorContainer)) return;
		this.#saved = range.cloneRange();
		const { blocks, inlines } = this.#meta;
		const state = activeState(rich, [...blocks, ...inlines]);
		const select = this.refs.block.get();
		if (select) select.value = state.block ?? "";
		for (const button of root.querySelectorAll<HTMLElement>("[data-inline]")) {
			button.setAttribute("aria-pressed", String(state.inlines.has(button.dataset.inline!)));
		}
	};

	// --- lifecycle -----------------------------------------------------------

	protected override init(): () => void {
		try {
			document.execCommand("defaultParagraphSeparator", false, "p");
		} catch { /* a browser without it falls back to its own separator */ }

		this.#lastChange = this.#md.get();

		this.addEffect(() => {
			const markdown = this.#md.get();
			const view = this.view.get();
			this.setAttribute("view", view);
			for (const tab of this.shadowRoot?.querySelectorAll<HTMLElement>("[data-view]") ?? []) {
				tab.setAttribute("aria-selected", String(tab.dataset.view === view));
			}
			this.#internals?.setFormValue(markdown);
			const rich = this.refs.rich.get();
			const raw = this.refs.raw.get();
			const preview = this.refs.preview.get();
			if (rich) {
				rich.contentEditable = this.readonly.get() ? "false" : "true";
				rich.dataset.placeholder = this.placeholder.get();
			}
			if (raw) {
				raw.placeholder = this.placeholder.get();
				raw.readOnly = this.readonly.get();
			}
			if (raw && raw.value !== markdown) raw.value = markdown;
			if (view === "preview" && preview) preview.innerHTML = markdownToRich(markdown, this.#rules);
			if (view === "rich" && rich && markdown !== this.#lastFromRich) {
				this.#lastFromRich = markdown;
				this.#renderRich(markdown);
				this.#history = [markdown];
				this.#at = 0;
			}
		});

		document.addEventListener("selectionchange", this.#refreshToolbar);
		return () => {
			document.removeEventListener("selectionchange", this.#refreshToolbar);
			clearTimeout(this.#flushTimer);
		};
	}

	#show(view: EditorView): void {
		if (view !== "rich") this.#flush();
		this.view.set(view);
		this.#settle();
	}

	#onKeyDown = (e: KeyboardEvent): void => {
		const rich = this.#rich();
		if (!rich) return;
		const key = e.key.toLowerCase();
		if ((e.metaKey || e.ctrlKey) && key === "z") {
			e.preventDefault();
			this.#step(e.shiftKey ? 1 : -1);
			return;
		}
		if ((e.metaKey || e.ctrlKey) && key === "y") {
			e.preventDefault();
			this.#step(1);
			return;
		}
		for (const meta of this.#meta.inlines) {
			if (matchesShortcut(e, meta.shortcut)) {
				e.preventDefault();
				this.#saved = selectionFor(rich)?.getRangeAt(0).cloneRange();
				this.#toggle(meta);
				return;
			}
		}
	};

	protected override get template(): BMTemplate {
		const { blocks, inlines } = this.#meta;
		return (
			<>
				<style $raw>{editorStyles}</style>
				<div class="editor" {...part("editor")}>
					<div class="toolbar" {...part("toolbar")} role="toolbar">
						<select
							ref="block"
							{...part("select")}
							class="rich-only"
							aria-label="Block style"
							onChange={(e: Event) => {
								const meta = blocks.find((b) => b.key === (e.target as HTMLSelectElement).value);
								if (meta) this.#apply(meta);
							}}
						>
							<option value="" hidden></option>
							{blocks.map((b) => <option value={b.key}>{b.label}</option>)}
						</select>
						<span class="group rich-only">
							{inlines.map((m) => (
								<button
									type="button"
									{...part("toggle")}
									data-inline={m.key}
									data-key={m.key}
									aria-pressed="false"
									title={m.shortcut ? `${m.label} (${m.shortcut.replace("Mod", "Ctrl")})` : m.label}
									onMousedown={(e: Event) => e.preventDefault()}
									onClick={() => this.#toggle(m)}
								>
									<slot name={`control-${m.key}`}>{m.icon ?? m.label}</slot>
								</button>
							))}
						</span>
						<span class="extra" hidden>
							<slot name="additional-controls" onSlotchange={reveal}></slot>
						</span>
						<span class="spacer"></span>
						<span class="group" role="tablist" {...part("tabs")}>
							{VIEWS.map((v) => (
								<button
									type="button"
									role="tab"
									{...part("tab")}
									data-view={v.view}
									aria-selected="false"
									onClick={() => this.#show(v.view)}
								>
									<slot name={`view-${v.view}`}>{v.label}</slot>
								</button>
							))}
						</span>
						<div class="below" hidden>
							<slot name="below-controls" onSlotchange={reveal}></slot>
						</div>
					</div>
					<form
						ref="linkRow"
						class="link-row"
						hidden
						onSubmit={(e: Event) => {
							e.preventDefault();
							const input = this.refs.linkInput.get();
							const meta = this.#pendingLink;
							this.refs.linkRow.get()!.hidden = true;
							if (meta && input?.value) this.#apply(meta, input.value);
							if (input) input.value = "";
						}}
					>
						<input ref="linkInput" type="url" placeholder="https://" aria-label="Link address" />
						<button type="submit">Apply</button>
						<button type="button" onClick={() => (this.refs.linkRow.get()!.hidden = true)}>
							Cancel
						</button>
					</form>
					<div
						ref="rich"
						data-pane="rich"
						{...part("content")}
						class="cm-content"
						spellcheck="true"
						onInput={() => {
							clearTimeout(this.#flushTimer);
							this.#flushTimer = setTimeout(() => this.#flush(), FLUSH_MS);
						}}
						onKeydown={this.#onKeyDown}
						onBlur={() => {
							this.#flush();
							this.#settle();
						}}
					>
					</div>
					<textarea
						ref="raw"
						data-pane="raw"
						{...part("raw")}
						spellcheck="false"
						onInput={(e: Event) => {
							e.stopPropagation();
							this.#md.set((e.target as HTMLTextAreaElement).value);
							this.#emit("input");
						}}
						onBlur={() => this.#settle()}
					>
					</textarea>
					<div ref="preview" data-pane="preview" {...part("preview")} class="cm-content"></div>
				</div>
			</>
		);
	}
}
