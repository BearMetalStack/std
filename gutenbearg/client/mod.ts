/**
 * @module
 * The browser half of gutenbearg. Every page renders complete on the server; this adds what only
 * the reader's browser knows — what they have read, where they are on the page, which tab they
 * prefer — by finding the `data-gb-*` hooks the templates leave. No framework, no dependencies.
 */

interface ClientPage {
	route: string;
	title: string;
	/** Section title. */
	section: string;
	/** Package name, for package pages. */
	package?: string;
	icon: string;
}

interface ClientData {
	base: string;
	route: string;
	written: boolean;
	pages: ClientPage[];
	glossary: Record<string, { term: string; definition: string; href: string }>;
}

const SHEET = "/@bearmetal/gutenbearg/icons.svg";
/** The docs, which may be one part of an app's page; nothing outside it is touched. */
const APP: ParentNode = document.querySelector(".gb-app") ?? document;
const $ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = APP) =>
	root.querySelector<E & Element>(sel) as E | null;
const $$ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = APP) =>
	[...root.querySelectorAll(sel)] as E[];

const store = {
	get<T>(key: string, fallback: T): T {
		try {
			const raw = localStorage.getItem(`gb-${key}`);
			return raw === null ? fallback : JSON.parse(raw) as T;
		} catch {
			return fallback;
		}
	},
	set(key: string, value: unknown) {
		try {
			localStorage.setItem(`gb-${key}`, JSON.stringify(value));
		} catch {
			// private mode or blocked storage: the page works, it just forgets
		}
	},
};

function icon(name: string, className = ""): SVGSVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("class", `gb-icon ${className}`.trim());
	svg.setAttribute("aria-hidden", "true");
	const use = document.createElementNS(ns, "use");
	use.setAttribute("href", `${SHEET}#${name}`);
	svg.append(use);
	return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<Record<string, string>> = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
	node.append(...children);
	return node;
}

const data: ClientData = JSON.parse(document.getElementById("gb-data")?.textContent ?? "{}");
const link = (route: string) => `${data.base}/${route}`;

// ─── Theme ────────────────────────────────────────────────────────────────────

for (const btn of $$("[data-gb-theme]")) {
	btn.addEventListener("click", () => {
		const root = document.documentElement;
		const next = root.dataset.theme === "light" ? "dark" : "light";
		root.dataset.theme = next;
		try {
			localStorage.setItem("gb-theme", next);
		} catch {
			// as above
		}
	});
}

// ─── Menus ────────────────────────────────────────────────────────────────────

const menus = $$<HTMLDetailsElement>("[data-gb-menu]");
document.addEventListener("mousedown", (e) => {
	for (const m of menus) if (m.open && !m.contains(e.target as Node)) m.open = false;
});
for (const m of menus) {
	m.addEventListener("toggle", () => {
		if (m.open) { for (const other of menus) if (other !== m) other.open = false; }
	});
	m.querySelector(".gb-pop")?.addEventListener("click", (e) => {
		if ((e.target as Element).closest("a, button")) m.open = false;
	});
}

// ─── Visited & recent ─────────────────────────────────────────────────────────

const visited = new Set(store.get<string[]>("visited", []));
let recent = store.get<string[]>("recent", []);
if (data.written && data.route) {
	visited.add(data.route);
	recent = [data.route, ...recent.filter((r) => r !== data.route)].slice(0, 6);
	store.set("visited", [...visited]);
	store.set("recent", recent);
}

for (const node of $$("[data-gb-route]")) {
	if (visited.has(node.dataset.gbRoute!)) node.classList.add("seen");
}

for (const foot of $$("[data-gb-meter]")) {
	const routes = foot.dataset.gbMeter!.split(" ");
	const read = routes.filter((r) => visited.has(r)).length;
	const bar = $("i", foot);
	if (bar) bar.style.width = `${(read / routes.length) * 100}%`;
	const count = $("[data-gb-meter-count]", foot);
	if (count) count.textContent = String(read);
}

const recentBox = $("[data-gb-recent]");
if (recentBox) {
	const pages = recent.filter((r) => r !== data.route).slice(0, 3)
		.map((r) => data.pages.find((p) => p.route === r)).filter((p): p is ClientPage => !!p);
	if (pages.length) {
		$("div", recentBox)!.append(
			...pages.map((p) => el("a", { href: link(p.route), class: "sq" }, p.title)),
		);
		recentBox.hidden = false;
	}
}

const upNext = $<HTMLAnchorElement>("[data-gb-upnext]");
if (upNext) {
	const after: { route: string; title: string; minutes: number }[] = JSON.parse(
		upNext.dataset.gbUpnext!,
	);
	const pick = after.find((p) => !visited.has(p.route));
	if (pick) {
		upNext.href = link(pick.route);
		$("b", upNext)!.textContent = pick.title;
		$("[data-gb-upnext-minutes]", upNext)!.textContent = String(pick.minutes);
	}
}

// ─── Search ───────────────────────────────────────────────────────────────────

for (const box of $$("[data-gb-search]")) {
	const input = $<HTMLInputElement>("input", box)!;
	const pop = $(".gb-search-pop", box)!;
	const render = () => {
		const q = input.value.trim().toLowerCase();
		pop.hidden = !q;
		if (!q) return;
		const hits = data.pages
			.filter((p) => `${p.title} ${p.section} ${p.package ?? ""}`.toLowerCase().includes(q))
			.slice(0, 6)
			.map((p) =>
				el(
					"a",
					{ href: link(p.route) },
					icon(p.icon),
					el("span", {}, p.title),
					el("small", {}, p.package ?? p.section),
				)
			);
		const terms = Object.entries(data.glossary)
			.filter(([id, g]) => id.includes(q) || g.term.toLowerCase().includes(q))
			.map(([, g]) =>
				el(
					"a",
					{ href: g.href },
					icon("book-bookmark"),
					el("span", {}, g.term),
					el("small", {}, "glossary"),
				)
			);
		pop.replaceChildren(...hits, ...terms);
		if (!hits.length && !terms.length) {
			pop.append(
				el(
					"div",
					{ class: "gb-empty" },
					icon("paw-print"),
					el("span", {}, "Nothing here but bear tracks."),
					el("small", {}, "Try another word."),
				),
			);
		}
	};
	input.addEventListener("input", render);
	input.addEventListener("focus", render);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			input.value = "";
			render();
			input.blur();
		}
		if (e.key === "Enter") $<HTMLAnchorElement>("a", pop)?.click();
	});
	document.addEventListener("mousedown", (e) => {
		if (!box.contains(e.target as Node)) pop.hidden = true;
	});
}

document.addEventListener("keydown", (e) => {
	const t = e.target as HTMLElement;
	if (e.key !== "/" || t.closest("input, textarea, [contenteditable]")) return;
	const input = $<HTMLInputElement>("[data-gb-search] input");
	if (!input || !input.offsetParent) return;
	e.preventDefault();
	input.focus();
});

// ─── Shelf filter ─────────────────────────────────────────────────────────────

const shelves = $("[data-gb-shelves]");
if (shelves) {
	const filter = $<HTMLInputElement>("[data-gb-filter]", shelves)!;
	const apply = () => {
		const q = filter.value.trim().toLowerCase();
		let shown = 0;
		for (const shelf of $$<HTMLDetailsElement>(".gb-shelf", shelves)) {
			let here = 0;
			for (const li of $$("li", shelf)) {
				const ok = li.dataset.gbTitle!.includes(q);
				li.hidden = !ok;
				if (ok) here++;
			}
			shelf.hidden = !here;
			if (q && here) shelf.open = true;
			const count = $("small", shelf);
			if (count) count.textContent = String(here);
			shown += here;
		}
		$("[data-gb-filter-empty]", shelves)!.hidden = shown > 0;
	};
	filter.addEventListener("input", apply);
}

// ─── Code ─────────────────────────────────────────────────────────────────────

const showTab = (label: string) => {
	for (const group of $$("[data-gb-group]")) {
		const panes = $$("[data-gb-pane]", group);
		if (!panes.some((p) => p.dataset.gbPane === label)) continue;
		for (const p of panes) p.hidden = p.dataset.gbPane !== label;
		for (const t of $$("[data-gb-tab]", group)) {
			const on = t.dataset.gbTab === label;
			t.classList.toggle("on", on);
			t.setAttribute("aria-selected", String(on));
		}
	}
};
for (const tab of $$("[data-gb-tab]")) {
	tab.addEventListener("click", () => {
		store.set("tab", tab.dataset.gbTab);
		showTab(tab.dataset.gbTab!);
	});
}
const savedTab = store.get<string | null>("tab", null);
if (savedTab) showTab(savedTab);

for (const btn of $$("[data-gb-copy]")) {
	btn.addEventListener("click", () => {
		const box = btn.closest(".gb-code, .gb-sig")!;
		const pre = $$("pre", box).find((p) => !p.hidden);
		const text = [...(pre?.querySelectorAll("code > div") ?? [])].length
			? $$("code > div", pre!).map((d) => d.textContent!.replace(/^\$ /, "")).join("\n")
			: pre?.textContent ?? "";
		navigator.clipboard?.writeText(text);
		const label = $("span", btn)!;
		label.textContent = "Copied";
		setTimeout(() => (label.textContent = ""), 1400);
	});
}

// ─── Glossary terms ───────────────────────────────────────────────────────────

for (const term of $$("[data-term]")) {
	const g = data.glossary[term.dataset.term!];
	if (!g) continue;
	let pop: HTMLElement | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const show = () => {
		clearTimeout(timer);
		if (pop) return;
		pop = el(
			"span",
			{ class: "gb-term-pop sq", role: "tooltip" },
			el("span", { class: "gb-term-h" }, icon("book-bookmark"), g.term),
			el("span", {}, g.definition),
			el("a", { href: g.href }, "Read more ", icon("arrow-right")),
		);
		term.append(pop);
	};
	const hide = () => {
		timer = setTimeout(() => {
			pop?.remove();
			pop = null;
		}, 120);
	};
	term.addEventListener("mouseenter", show);
	term.addEventListener("mouseleave", hide);
	term.addEventListener("focus", show);
	term.addEventListener("blur", hide);
}

// ─── Changelog filters ────────────────────────────────────────────────────────

const changelog = $("[data-gb-changelog]");
if (changelog) {
	const types = new Set<string>();
	let pkg = "";
	const apply = () => {
		for (const rel of $$(".gb-rel", changelog)) {
			let kept = 0;
			for (const li of $$("li", rel)) {
				const ok = (!types.size || types.has(li.dataset.gbType!)) &&
					(!pkg || li.dataset.gbPackage === pkg);
				li.hidden = !ok;
				if (ok) kept++;
			}
			rel.classList.toggle("dim", !kept);
			$(".gb-rel-none", rel)!.hidden = kept > 0;
		}
		for (const b of $$("[data-gb-cl-type]", changelog)) {
			b.classList.toggle("on", types.has(b.dataset.gbClType!));
		}
		for (const b of $$("[data-gb-cl-pkg]", changelog)) {
			b.classList.toggle("on", b.dataset.gbClPkg === pkg);
		}
	};
	for (const b of $$("[data-gb-cl-type]", changelog)) {
		b.addEventListener("click", () => {
			const t = b.dataset.gbClType!;
			if (!types.delete(t)) types.add(t);
			apply();
		});
	}
	for (const b of $$("[data-gb-cl-pkg]", changelog)) {
		b.addEventListener("click", () => {
			pkg = pkg === b.dataset.gbClPkg ? "" : b.dataset.gbClPkg!;
			apply();
		});
	}
}

// ─── Reading position ─────────────────────────────────────────────────────────

const prose = $(".gb-article > .gb-prose");
const progressBar = $("[data-gb-progress]");

interface Geometry {
	top: number;
	height: number;
	headings: { id: string; top: number }[];
	blocks: { top: number; height: number; kind: string }[];
}

function kindOf(node: HTMLElement): string {
	if (node.dataset.kind) return node.dataset.kind;
	const tag = node.tagName.toLowerCase();
	if (tag === "ul" || tag === "ol") return "list";
	return tag === "h2" || tag === "h3" ? tag : "p";
}

let geo: Geometry | null = null;

function measure() {
	if (!prose) return;
	const box = prose.getBoundingClientRect();
	const top = box.top + scrollY;
	const headings = $$("h2[id], .gb-steps h3[id]", prose).map((h) => ({
		id: h.id,
		top: h.getBoundingClientRect().top + scrollY,
	}));
	const blocks: Geometry["blocks"] = [];
	for (const child of [...prose.children] as HTMLElement[]) {
		const parts = child.matches(".gb-steps")
			? [...child.children] as HTMLElement[]
			: child.matches(".gb-cl")
			? [...child.children] as HTMLElement[]
			: [child];
		for (const part of parts) {
			const r = part.getBoundingClientRect();
			blocks.push({
				top: r.top + scrollY - top,
				height: r.height,
				kind: part.parentElement === child && child.matches(".gb-steps") ? "step" : kindOf(part),
			});
		}
	}
	geo = { top, height: box.height, headings, blocks };
	drawMinimap();
	placeSpine();
	onScroll();
}

function activeHeading(): string | null {
	if (!geo?.headings.length) return null;
	let active = geo.headings[0].id;
	for (const h of geo.headings) if (h.top <= scrollY + 140) active = h.id;
	return active;
}

const minimap = $("[data-gb-minimap]");
function drawMinimap() {
	if (!minimap || !geo) return;
	const map = $(".gb-mini-map", minimap)!;
	const scale = map.clientHeight / geo.height;
	$$("i", map).forEach((i) => i.remove());
	map.prepend(
		...geo.blocks.map((b) =>
			el("i", {
				class: `k-${b.kind}`,
				style: `top:${b.top * scale}px;height:${Math.max(2, b.height * scale - 1.5)}px`,
			})
		),
	);
	const labels = $(".gb-mini-labels", minimap)!;
	labels.classList.add("placed");
	labels.style.height = `${map.clientHeight}px`;
	for (const a of $$("a", labels)) {
		const h = geo.headings.find((x) => x.id === a.dataset.gbHeading);
		if (h) a.style.top = `${(h.top - geo.top) * scale}px`;
	}
	map.onclick = (e) => {
		const r = map.getBoundingClientRect();
		scrollTo({
			top: geo!.top + (e.clientY - r.top) / scale - innerHeight / 2,
			behavior: "smooth",
		});
	};
}

const spine = $("[data-gb-spine]");
const PAW_STEPS = 14;
function placeSpine() {
	if (!spine || !geo) return;
	spine.classList.add("placed");
	const height = spine.clientHeight;
	for (const a of $$<HTMLElement>(".gb-spine-h", spine)) {
		const h = geo.headings.find((x) => x.id === a.dataset.gbHeading);
		if (h) a.style.top = `${((h.top - geo.top) / geo.height) * height}px`;
	}
	const layer = $(".gb-steps-layer", spine)!;
	layer.replaceChildren(
		...Array.from({ length: PAW_STEPS }, (_, i) => {
			const paw = icon("paw-print-fill", `gb-pawstep ${i % 2 ? "r" : "l"}`);
			paw.style.top = `${(i / PAW_STEPS) * height}px`;
			paw.style.display = "none";
			return paw;
		}),
	);
}

function onScroll() {
	const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
	const progress = Math.min(1, scrollY / max);
	if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
	if (!geo) return;

	const active = activeHeading();
	for (const a of $$("[data-gb-heading]")) a.classList.toggle("on", a.dataset.gbHeading === active);

	if (minimap) {
		const map = $(".gb-mini-map", minimap)!;
		const scale = map.clientHeight / geo.height;
		const win = $(".gb-mini-win", map)!;
		const h = Math.max(14, innerHeight * scale);
		win.style.height = `${h}px`;
		win.style.top = `${
			Math.min(map.clientHeight - h, Math.max(0, (scrollY + 80 - geo.top) * scale))
		}px`;
		const minutes = Number(minimap.dataset.minutes) || 1;
		$("[data-gb-left]", minimap)!.textContent = progress > 0.98
			? "Finished"
			: `${Math.max(1, Math.round(minutes * (1 - progress)))} min left`;
	}

	const toc = $("[data-gb-toc]");
	if (toc) {
		const h2 = $$("h2[id]", prose!).map((h) => h.getBoundingClientRect().top + scrollY);
		const end = document.documentElement.scrollHeight - 200;
		$$("li a", toc).forEach((a, i) => {
			const from = h2[i];
			const to = h2[i + 1] ?? end;
			if (from === undefined) return;
			const f = Math.max(0, Math.min(1, (scrollY + innerHeight * 0.35 - from) / (to - from)));
			const bar = $("b", a);
			if (bar) bar.style.width = `${f * 100}%`;
		});
	}

	if (spine) {
		const height = spine.clientHeight;
		$(".gb-spine-fill", spine)!.style.height = `${progress * height}px`;
		$(".gb-bear", spine)!.style.top = `${progress * height}px`;
		const steps = Math.floor(progress * PAW_STEPS);
		$$<HTMLElement>(".gb-pawstep", spine).forEach((p, i) => {
			p.style.display = i < steps ? "" : "none";
		});
	}
}

if (prose) {
	addEventListener("scroll", onScroll, { passive: true });
	new ResizeObserver(() => measure()).observe(document.body);
	measure();
} else {
	addEventListener("scroll", onScroll, { passive: true });
}
