/**
 * Builds a {@linkcode SiteContent} from a directory of markdown. The directory is the manifest:
 *
 * ```
 * index.md                               home page; `site:` holds site settings
 * glossary/<term>.md                     `term`, `see`; the body is the definition
 * guides/<NNNN-[icon]-section>/<NNNN-page>.md
 * packages/<pkg>/index.md                `name`, `status`, `description`
 * packages/<pkg>/<version>/<NNNN-[icon]-section>/<NNNN-page>.md
 * packages/<pkg>/changelog/<version>.md  `date`; a list of `type: text` items
 * ```
 *
 * A version directory holds only what changed: pages missing from it are inherited from the
 * versions before it, and `removed: true` drops one. A package with sections directly under it
 * is unversioned.
 */

import { dirname, join, normalize, SEPARATOR } from "@std/path";
import {
	type AnyRule,
	defaultRules,
	FrontmatterError,
	isForwardRule,
	type Node,
	parse,
	splitFrontmatter,
	type StagedRule,
} from "@bearmetal/clawmark";
import { CONTAINER_TAG, docsRules } from "@bearmetal/clawmark/rules/extra";
import type {
	Action,
	Change,
	ChangeType,
	Diagnostic,
	Frontmatter,
	GlossaryEntry,
	HomeFrontmatter,
	IconName,
	PackageInfo,
	PackageVersion,
	Page,
	Release,
	RouteTarget,
	Scope,
	Section,
	SiteConfig,
	SiteContent,
	Status,
} from "../types.ts";
import { compareNames, type ParsedName, parseName, titleize } from "./names.ts";
import { plainText, type RenderEnv, renderTree } from "./render.tsx";
import { readingMinutes } from "../site.ts";

/** Where content lives when nothing says otherwise. */
export const DEFAULT_DIR = ".bearmetal/gutenbearg";

/** Options for {@linkcode loadContent}. */
export interface LoadOptions {
	/** Path the site is mounted under (`/docs`), prefixed to every link content makes. */
	base?: string;
	/** Clawmark rules ahead of gutenbearg's own, for custom syntax. */
	rules?: StagedRule[];
}

const STATUSES = new Set<Status>(["stable", "beta", "alpha", "deprecated"]);
const CHANGE_TYPES = new Set<ChangeType>(["added", "changed", "fixed", "deprecated", "breaking"]);
/** `0.9`, `1.2.3-beta.1`, `v2` — but not `0000-commands`, which is a section. */
const VERSION_DIR = /^(v?\d+\.\d+(\.\d+)*([-+][\w.]+)?|v\d+)$/;

interface Parsed {
	frontmatter: Record<string, unknown>;
	tree: Node;
	title?: string;
	text: string;
}

interface PageRecord {
	name: ParsedName;
	/** Relative to the content root, `/`-separated. */
	file: string;
	doc: Parsed;
}

interface SectionRecord {
	name: ParsedName;
	dir: string;
	meta: Record<string, unknown>;
	pages: PageRecord[];
}

/**
 * Loads content, caching each file's parse by modification time so a reload after an edit only
 * re-parses what changed. Keep one per directory for watch mode.
 */
export class ContentLoader {
	#cache = new Map<string, { mtime: number; doc: Parsed }>();
	#rules: StagedRule[];
	#ruleMap: Map<string, AnyRule>;

	constructor(readonly dir: string = DEFAULT_DIR, readonly options: LoadOptions = {}) {
		this.#rules = [...(options.rules ?? []), ...docsRules(), ...defaultRules()];
		this.#ruleMap = new Map(
			this.#rules.filter((r): r is AnyRule => isForwardRule(r)).map((r) => [r.id, r]),
		);
	}

	/** Reads the whole directory. Content mistakes become diagnostics; only I/O failures throw. */
	async load(): Promise<SiteContent> {
		return await new Build(this, this.dir, this.options.base ?? "").run();
	}

	get ruleMap(): Map<string, AnyRule> {
		return this.#ruleMap;
	}

	/** Parses one markdown file, or returns `null` and records why. */
	async parseFile(abs: string, rel: string, diagnostics: Diagnostic[]): Promise<Parsed | null> {
		const stat = await Deno.stat(abs);
		const mtime = stat.mtime?.getTime() ?? 0;
		const hit = this.#cache.get(abs);
		if (hit && hit.mtime === mtime) return hit.doc;
		const source = await Deno.readTextFile(abs);
		let fm;
		try {
			fm = splitFrontmatter(source);
		} catch (e) {
			if (!(e instanceof FrontmatterError)) throw e;
			diagnostics.push({ level: "error", file: rel, message: e.message });
			return null;
		}
		const tree = parse(fm.body, this.#rules);
		const title = liftTitle(tree);
		const doc: Parsed = { frontmatter: fm.data, tree, title, text: plainText(tree) };
		this.#cache.set(abs, { mtime, doc });
		return doc;
	}
}

/** Loads `dir` once. For repeated loads (watch mode), keep a {@linkcode ContentLoader}. */
export function loadContent(
	dir: string = DEFAULT_DIR,
	options: LoadOptions = {},
): Promise<SiteContent> {
	return new ContentLoader(dir, options).load();
}

/** Removes a leading `# title` from the tree and returns its text. */
function liftTitle(tree: Node): string | undefined {
	const meaningful = (n: Node) => !(n.tag === "core:text" && !plainText(n).trim());
	for (let i = 0; i < tree.children.length; i++) {
		const child = tree.children[i];
		if (
			!meaningful(child) ||
			(child.tag === "core:paragraph" && !plainText(child).trim() &&
				!child.children.some((c) => c.tag !== "core:text"))
		) continue;
		const inner = child.tag === "core:paragraph" ? child.children.filter(meaningful) : [child];
		const heading = inner.length === 1 && inner[0].tag === "md:heading" ? inner[0] : null;
		if (!heading || (heading.data as { level?: number }).level !== 1) return undefined;
		if (child === heading) tree.children.splice(i, 1);
		else child.children = child.children.filter((c) => c !== heading && meaningful(c));
		return plainText(heading).trim();
	}
	return undefined;
}

function str(v: unknown): string | undefined {
	return v === undefined || v === null ? undefined : String(v);
}

function compareVersions(a: string, b: string): number {
	const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
	const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x === y) continue;
		if (typeof x === "number" && typeof y === "number") return x - y;
		return String(x) < String(y) ? -1 : 1;
	}
	return 0;
}

/** One pass over the directory. */
class Build {
	diagnostics: Diagnostic[] = [];
	icons = new Set<string>();
	routes = new Map<string, RouteTarget>();
	/** `/`-joined slug path of a file (`packages/router/0.9/reference/signal`) → route. */
	slugRoutes = new Map<string, string>();
	pages: { page: Page; doc: Parsed; scope: Scope; pkg?: string; version?: string }[] = [];
	glossary: Record<string, GlossaryEntry> = {};
	latest = new Map<string, string>();
	sourceBase?: string;

	constructor(readonly loader: ContentLoader, readonly root: string, readonly base: string) {}

	async run(): Promise<SiteContent> {
		const index = await this.#doc("index.md");
		const fm = index?.frontmatter ?? {};
		const site = this.#site(fm.site);
		this.sourceBase = site.sourceBase;

		const guides = await this.#guides();
		const packages = await this.#packages();
		const releases = await this.#releases(packages);
		await this.#glossary();

		this.routes.set("", { kind: "home" });
		for (const { page, scope } of this.pages) {
			this.routes.set(page.route, { kind: "page", page, scope });
		}
		for (const pkg of packages) {
			if (releases.some((r) => r.package === pkg.id)) {
				this.routes.set(`${pkg.id}/changelog`, { kind: "changelog", package: pkg });
			}
		}
		if (releases.length) this.routes.set("changelog", { kind: "changelog" });

		for (const entry of this.pages) this.#checkLinks(entry);
		if (index) collectFeatureIcons(index.tree, this.icons);

		const home = {
			frontmatter: this.#home(fm, site),
			body: index && hasContent(index.tree)
				? () => renderTree(index.tree, this.#env("index.md"))
				: undefined,
		};
		return {
			site,
			home,
			guides,
			packages,
			glossary: this.glossary,
			releases,
			routes: this.routes,
			diagnostics: this.diagnostics,
			icons: this.icons,
		};
	}

	warn(file: string, message: string, level: Diagnostic["level"] = "warn") {
		this.diagnostics.push({ level, file, message });
	}

	// ─── files ───────────────────────────────────────────────────────────

	async #entries(rel: string): Promise<Deno.DirEntry[]> {
		try {
			const out: Deno.DirEntry[] = [];
			for await (const e of Deno.readDir(join(this.root, rel))) {
				if (!e.name.startsWith(".")) out.push(e);
			}
			return out.sort((a, b) => (a.name < b.name ? -1 : 1));
		} catch (e) {
			if (e instanceof Deno.errors.NotFound) return [];
			throw e;
		}
	}

	async #doc(rel: string): Promise<Parsed | null> {
		try {
			return await this.loader.parseFile(join(this.root, rel), rel, this.diagnostics);
		} catch (e) {
			if (e instanceof Deno.errors.NotFound) return null;
			throw e;
		}
	}

	// ─── site & home ─────────────────────────────────────────────────────

	#site(raw: unknown): SiteConfig {
		const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
		const layout = str(s.layout);
		return {
			name: str(s.name) ?? "Docs",
			layout: layout === "trail" || layout === "shelves" || layout === "den" ? layout : undefined,
			repository: str(s.repository),
			sourceBase: str(s.sourceBase),
			editBase: str(s.editBase),
			theme: str(s.theme),
		};
	}

	#home(fm: Record<string, unknown>, site: SiteConfig): HomeFrontmatter {
		const action = (v: unknown): Action | undefined => {
			if (!v || typeof v !== "object") return undefined;
			const a = v as Record<string, unknown>;
			const target = str(a.href ?? a.link);
			if (!str(a.label ?? a.text) || !target) return undefined;
			return {
				label: str(a.label ?? a.text)!,
				href: this.#resolve(target, "index.md", undefined) ?? target,
			};
		};
		return {
			name: str(fm.name) ?? site.name,
			text: str(fm.text),
			tagline: str(fm.tagline),
			badge: str(fm.badge),
			primary: action(fm.primary),
			secondary: action(fm.secondary),
		};
	}

	// ─── sections ────────────────────────────────────────────────────────

	async #readSections(rel: string, skip: string[] = []): Promise<SectionRecord[]> {
		const out: SectionRecord[] = [];
		for (const entry of await this.#entries(rel)) {
			if (!entry.isDirectory || skip.includes(entry.name)) continue;
			const dir = `${rel}/${entry.name}`;
			const name = parseName(entry.name);
			this.#checkName(name, dir);
			if (name.icon) this.icons.add(name.icon);
			let meta: Record<string, unknown> = {};
			const pages: PageRecord[] = [];
			const slugs = new Set<string>();
			for (const file of await this.#entries(dir)) {
				if (!file.isFile || !file.name.endsWith(".md")) continue;
				const path = `${dir}/${file.name}`;
				const doc = await this.#doc(path);
				if (!doc) continue;
				if (file.name === "index.md") {
					meta = doc.frontmatter;
					continue;
				}
				const pname = parseName(file.name);
				this.#checkName(pname, path);
				if (slugs.has(pname.slug)) {
					this.warn(path, `another page in this section is also "${pname.slug}"`, "error");
					continue;
				}
				slugs.add(pname.slug);
				pages.push({ name: pname, file: path, doc });
			}
			if (str(meta.icon)) this.icons.add(str(meta.icon)!);
			out.push({ name, dir, meta, pages });
		}
		return out;
	}

	#checkName(name: ParsedName, file: string) {
		if (!name.numbered) {
			this.warn(file, "has no order prefix (0000-); it sorts after the numbered entries");
		}
	}

	/** Pages and sections, made into the public shapes for one scope. */
	#section(
		rec: { name: ParsedName; meta: Record<string, unknown> },
		pages: { rec: PageRecord; addedIn?: string }[],
		routeOf: (page: string) => string,
		scope: () => Scope,
		version?: { pkg: string; version: string },
	): Section {
		const section: Section = {
			slug: rec.name.slug,
			title: str(rec.meta.title) ?? titleize(rec.name.slug),
			icon: (str(rec.meta.icon) ?? rec.name.icon ?? "book-open") as IconName,
			order: rec.name.order,
			description: str(rec.meta.description),
			pages: [],
		};
		section.pages = pages
			.sort((a, b) => compareNames(a.rec.name, b.rec.name))
			.map(({ rec: p, addedIn }) => {
				const fm = p.doc.frontmatter as Frontmatter;
				const page: Page = {
					slug: p.name.slug,
					title: str(fm.title) ?? p.doc.title ?? titleize(p.name.slug),
					route: routeOf(p.name.slug),
					section: section.slug,
					frontmatter: {
						...fm,
						status: STATUSES.has(fm.status as Status) ? fm.status : undefined,
						draft: fm.draft === true,
					},
					file: p.file,
					order: p.name.order,
					addedIn,
					minutes: readingMinutes(p.doc.text),
					body: () => renderTree(p.doc.tree, this.#env(p.file, version)),
				};
				this.pages.push({ page, doc: p.doc, scope: scope(), ...version });
				return page;
			});
		return section;
	}

	// ─── guides ──────────────────────────────────────────────────────────

	async #guides(): Promise<Section[]> {
		const recs = await this.#readSections("guides");
		const sections: Section[] = [];
		const scope = (): Scope => ({ kind: "guides", sections });
		for (const rec of recs.sort((a, b) => compareNames(a.name, b.name))) {
			for (const p of rec.pages) {
				this.slugRoutes.set(
					`guides/${rec.name.slug}/${p.name.slug}`,
					`guides/${rec.name.slug}/${p.name.slug}`,
				);
			}
			const section = this.#section(
				rec,
				rec.pages.map((p) => ({ rec: p })),
				(page) => `guides/${rec.name.slug}/${page}`,
				scope,
			);
			if (section.pages.length) sections.push(section);
		}
		return sections;
	}

	// ─── packages ────────────────────────────────────────────────────────

	async #packages(): Promise<PackageInfo[]> {
		const packages: PackageInfo[] = [];
		for (const entry of await this.#entries("packages")) {
			if (!entry.isDirectory) continue;
			const id = entry.name;
			const rel = `packages/${id}`;
			const meta = (await this.#doc(`${rel}/index.md`))?.frontmatter ?? {};
			const dirs = (await this.#entries(rel)).filter((e) =>
				e.isDirectory && e.name !== "changelog"
			);
			const versionDirs = dirs.filter((d) => VERSION_DIR.test(d.name));
			const status = str(meta.status) as Status | undefined;
			const pkg: PackageInfo = {
				id,
				name: str(meta.name) ?? id,
				status: status && STATUSES.has(status) ? status : undefined,
				description: str(meta.description),
				versions: [],
			};

			let versions: { version: string; dir: string }[];
			if (versionDirs.length) {
				for (const d of dirs) {
					if (!versionDirs.includes(d)) {
						this.warn(
							`${rel}/${d.name}`,
							"is not a version; sections belong inside a version directory",
						);
					}
				}
				versions = versionDirs.map((d) => ({
					version: d.name.replace(/^v/, ""),
					dir: `${rel}/${d.name}`,
				}))
					.sort((a, b) => compareVersions(a.version, b.version));
			} else {
				versions = [{ version: "", dir: rel }];
			}

			// Inheritance: walk oldest to newest, snapshotting the merged state at each version.
			type State = Map<
				string,
				{
					name: ParsedName;
					meta: Record<string, unknown>;
					pages: Map<string, { rec: PageRecord; addedIn: string }>;
				}
			>;
			const state: State = new Map();
			const snapshots: { version: string; state: State }[] = [];
			for (const v of versions) {
				for (const sec of await this.#readSections(v.dir, ["changelog"])) {
					const cur = state.get(sec.name.slug) ??
						{ name: sec.name, meta: {}, pages: new Map() };
					cur.name = sec.name;
					cur.meta = { ...cur.meta, ...sec.meta };
					for (const p of sec.pages) {
						if (p.doc.frontmatter.removed === true) cur.pages.delete(p.name.slug);
						else {
							cur.pages.set(p.name.slug, {
								rec: p,
								addedIn: cur.pages.get(p.name.slug)?.addedIn ?? v.version,
							});
						}
					}
					state.set(sec.name.slug, cur);
				}
				snapshots.push({
					version: v.version,
					state: new Map([...state].map(([k, s]) => [k, { ...s, pages: new Map(s.pages) }])),
				});
			}

			const newest = snapshots.at(-1)?.version ?? "";
			this.latest.set(id, newest);
			for (const snap of snapshots.reverse()) {
				const latest = snap.version === newest;
				const base = latest || !snap.version ? id : `${id}/v${snap.version}`;
				const version: PackageVersion = { version: snap.version, latest, base, sections: [] };
				const scope = (): Scope => ({ kind: "package", package: pkg, version });
				const recs = [...snap.state.values()].sort((a, b) => compareNames(a.name, b.name));
				for (const rec of recs) {
					for (const slug of rec.pages.keys()) {
						this.slugRoutes.set(
							`packages/${id}/${snap.version}/${rec.name.slug}/${slug}`,
							`${base}/${rec.name.slug}/${slug}`,
						);
					}
				}
				for (const rec of recs) {
					const section = this.#section(
						rec,
						[...rec.pages.values()].map(({ rec: p, addedIn }) => ({
							rec: p,
							addedIn: snap.version ? addedIn : undefined,
						})),
						(page) => `${base}/${rec.name.slug}/${page}`,
						scope,
						{ pkg: id, version: snap.version },
					);
					if (section.pages.length) version.sections.push(section);
				}
				pkg.versions.push(version);
			}
			packages.push(pkg);
		}
		return packages;
	}

	// ─── changelog ───────────────────────────────────────────────────────

	async #releases(packages: PackageInfo[]): Promise<Release[]> {
		const releases: Release[] = [];
		for (const pkg of packages) {
			for (const entry of await this.#entries(`packages/${pkg.id}/changelog`)) {
				if (!entry.isFile || !entry.name.endsWith(".md")) continue;
				const file = `packages/${pkg.id}/changelog/${entry.name}`;
				const doc = await this.#doc(file);
				if (!doc) continue;
				releases.push({
					package: pkg.id,
					version: str(doc.frontmatter.version) ?? entry.name.replace(/\.md$/, ""),
					date: str(doc.frontmatter.date),
					changes: this.#changes(doc.tree, file),
				});
			}
		}
		const time = (r: Release) => (r.date ? Date.parse(r.date) || 0 : 0);
		return releases.sort((a, b) => time(b) - time(a) || compareVersions(b.version, a.version));
	}

	#changes(tree: Node, file: string): Change[] {
		const out: Change[] = [];
		const walk = (node: Node) => {
			if (node.tag === "md:unorderedlist") {
				for (const item of node.children) out.push(this.#change(item, file));
				return;
			}
			for (const child of node.children) walk(child);
		};
		walk(tree);
		return out;
	}

	#change(item: Node, file: string): Change {
		const inline = item.children.flatMap((c) => (c.tag === "core:paragraph" ? c.children : [c]));
		let type: ChangeType = "changed";
		const first = inline[0];
		if (first?.tag === "core:text") {
			const value = String((first.data as { value: string }).value);
			const m = /^\s*([A-Za-z]+)\s*:\s*/.exec(value);
			if (m && CHANGE_TYPES.has(m[1].toLowerCase() as ChangeType)) {
				type = m[1].toLowerCase() as ChangeType;
				inline[0] = { ...first, data: { value: value.slice(m[0].length) } };
			} else {this.warn(
					file,
					`a change has no type (${[...CHANGE_TYPES].join(", ")}); reading it as "changed"`,
				);}
		}
		const root: Node = { tag: "core:root", data: {}, children: inline };
		return { type, text: () => renderTree(root, this.#env(file)) };
	}

	// ─── glossary ────────────────────────────────────────────────────────

	async #glossary() {
		for (const entry of await this.#entries("glossary")) {
			if (!entry.isFile || !entry.name.endsWith(".md")) continue;
			const file = `glossary/${entry.name}`;
			const doc = await this.#doc(file);
			if (!doc) continue;
			const id = parseName(entry.name).slug;
			const see = str(doc.frontmatter.see);
			let href: string | undefined;
			if (see) {
				href = this.#resolve(see, file, undefined);
				if (!href) this.warn(file, `"see: ${see}" leads nowhere`);
			}
			this.glossary[id] = {
				term: str(doc.frontmatter.term) ?? doc.title ?? titleize(id),
				definition: doc.text.trim().replace(/\s+/g, " "),
				href,
			};
		}
	}

	// ─── links ───────────────────────────────────────────────────────────

	#env(file: string, version?: { pkg: string; version: string }): RenderEnv {
		return {
			rules: this.loader.ruleMap,
			glossary: this.glossary,
			sourceBase: this.sourceBase,
			resolveLink: (href) => this.#resolve(href, file, version),
		};
	}

	/**
	 * A link as an author wrote it, as an href. Files are matched by slug, so numbers and icons in
	 * the path don't matter, and a link into the author's own package follows the version being
	 * read. Bare words (`[[signal]]`) match a page slug in the same section, then anywhere.
	 */
	#resolve(
		href: string,
		from: string,
		version?: { pkg: string; version: string },
	): string | undefined {
		if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) {
			return href.startsWith("/") && this.base ? this.base + href : href;
		}
		const [path, hash = ""] = href.split(/(?=[#?])/);
		const suffix = href.slice(path.length) || hash;
		if (!path.includes("/") && !path.endsWith(".md")) {
			const hits = this.pages.filter((p) =>
				p.page.slug === path &&
				(!version || (p.pkg === version.pkg && p.version === version.version))
			);
			return hits[0] ? `${this.base}/${hits[0].page.route}${suffix}` : undefined;
		}
		const target = normalize(join(dirname(from), path)).split(SEPARATOR).join("/");
		if (target.startsWith("..")) return undefined;
		const parts = target.split("/").map((seg) => parseName(seg).slug);
		if (parts.length === 1 && parts[0] === "index") return `${this.base}/${suffix}`;
		if (parts[0] === "packages" && parts.length === 5) {
			const pkg = parts[1];
			parts[2] = version && version.pkg === pkg
				? version.version
				: this.latest.get(pkg) ?? parts[2];
		} else if (parts[0] === "packages" && parts.length === 4) {
			parts.splice(2, 0, "");
		}
		const route = this.slugRoutes.get(parts.join("/"));
		return route === undefined ? undefined : `${this.base}/${route}${suffix}`;
	}

	#checkLinks(entry: { page: Page; doc: Parsed; pkg?: string; version?: string }) {
		const version = entry.pkg !== undefined
			? { pkg: entry.pkg, version: entry.version! }
			: undefined;
		const walk = (node: Node) => {
			const data = node.data as Record<string, unknown>;
			if (node.tag === "md:link") {
				const href = String(data.href ?? "");
				if (!this.#resolve(href, entry.page.file, version)) {
					this.warn(
						entry.page.file,
						`link "${href}" leads nowhere${version?.version ? ` in v${version.version}` : ""}`,
					);
				}
			}
			if (node.tag === CONTAINER_TAG && data.kind === "features") {
				collectFeatureIcons(node, this.icons);
			}
			for (const child of node.children) walk(child);
		};
		walk(entry.doc.tree);
	}
}

function hasContent(tree: Node): boolean {
	return tree.children.some((c) => c.tag !== "core:paragraph" || plainText(c).trim() !== "");
}

/** First segments of `::: features` items under `node` — their icon names. */
function collectFeatureIcons(node: Node, icons: Set<string>) {
	const walk = (n: Node, inFeatures: boolean) => {
		const features = inFeatures ||
			(n.tag === CONTAINER_TAG && (n.data as { kind?: string }).kind === "features");
		if (features && n.tag === "md:listitem") {
			const icon = plainText(n).split("|")[0]?.trim();
			if (icon) icons.add(icon);
			return;
		}
		for (const child of n.children) walk(child, features);
	};
	walk(node, false);
}
