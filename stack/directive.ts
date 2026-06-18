import { type CollectionMap, joinPath } from "@bearmetal/miscellanea";
import { directoryOf } from "@bearmetal/miscellanea/path";

const directivePattern = /^(\s*)\/\/\s*@bearmetal-(\S+)(?:\s+(.*))?$/;

interface ParsedDirective {
	name: string;
	args: string;
	indent: string;
}

function parseDirectiveLine(line: string): ParsedDirective | null {
	const match = line.match(directivePattern);
	if (!match) return null;
	return { name: match[2], args: (match[3] ?? "").trim(), indent: match[1] };
}

interface ScannedFile {
	/** Content with state directives (flag, include) stripped. May still
	 *  contain content directives (partial), those fire during write. */
	content: string;
	/** undefined = always-on */
	requiredFlag?: string;
	/** @bearmetal-include targets recorded during scan */
	includes: string[];
}

export interface ResolveOptions {
	[flag: string]: boolean | string | undefined;
}

export interface TemplateProcessorOptions {
	targetDir: string;
	partials: CollectionMap<string, string>;
}

export class TemplateProcessor {
	#files = new Map<string, ScannedFile>();

	constructor(private opts: ResolveOptions, private options: TemplateProcessorOptions) {}

	/**
	 * Scan a single file from the tar. Decodes the readable stream, strips
	 * state directives (flag, include), records their effects, and stores
	 * the cleaned content keyed by path. Content directives (partial) are
	 * left in the content string. They fire during write when the full
	 * partial map is guaranteed to be populated.
	 */
	async scan(path: string, readable: ReadableStream<Uint8Array>): Promise<void> {
		const reader = readable.pipeThrough(new TextDecoderStream() as any).getReader();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += value;
		}

		const lines = text.split("\n");
		const outputLines: string[] = [];
		let requiredFlag: string | undefined;
		const includes: string[] = [];

		for (const line of lines) {
			const directive = parseDirectiveLine(line);
			if (!directive) {
				outputLines.push(line);
				continue;
			}

			switch (directive.name) {
				// State directives: consume, strip, record.
				case "flag":
					requiredFlag = directive.args;
					break;
				case "include":
					if (directive.args) includes.push(directive.args);
					break;

				// Content directives: leave in place for the write phase.
				case "partial":
					outputLines.push(line);
					break;

				// Unknown directive: leave in place rather than silently
				// eating it. Likely a typo; better visible than gone.
				default:
					outputLines.push(line);
					break;
			}
		}

		this.#files.set(path, {
			content: outputLines.join("\n"),
			requiredFlag,
			includes,
		});
	}

	// -------------------------------------------------------------------------
	// Resolution (pure, between phases)
	// -------------------------------------------------------------------------

	/**
	 * Determines which scanned paths should be written, based on flags and
	 * cascading @bearmetal-include directives. Pure and synchronous, no disk
	 * access, safe to call multiple times (e.g. for testing).
	 *
	 * Files with no @bearmetal-flag are always included. Files whose flag
	 * matches opts are included. @bearmetal-include cascades transitively;
	 * included files are force-included regardless of their own flag.
	 * Cycles and dangling include targets are both handled safely.
	 */
	resolve(): Set<string> {
		const resolved = new Set<string>();

		for (const [path, file] of this.#files) {
			if (file.requiredFlag === undefined || this.opts[file.requiredFlag]) {
				resolved.add(path);
			}
		}

		let changed = true;
		while (changed) {
			changed = false;
			for (const path of [...resolved]) {
				const file = this.#files.get(path);
				if (!file) continue;
				for (const includePath of file.includes) {
					if (!resolved.has(includePath)) {
						resolved.add(includePath);
						changed = true;
					}
				}
			}
		}

		return resolved;
	}

	/**
	 * Writes all resolved files to disk. For each file, applies content
	 * directives (currently: @bearmetal-partial <name>, which replaces the
	 * directive line wholesale with the named partial's applied content).
	 *
	 * Partials are applied recursively. A partial may itself contain
	 * @bearmetal-partial directives, which are expanded depth-first. Cycles
	 * are detected via a seen-set and logged loudly rather than hanging.
	 */
	async write(resolved: Set<string>): Promise<void> {
		for (const path of resolved) {
			const file = this.#files.get(path);
			if (!file) {
				console.error(
					`bearmetal templator: unresolved include target "${path}", no such file was scanned`,
				);
				continue;
			}

			const content = this.#applyContentDirectives(path, file.content, new Set());
			const outPath = joinPath(this.options.targetDir, path);

			console.log(`   writing ${outPath}...`);
			await Deno.mkdir(directoryOf(outPath), { recursive: true });
			await Deno.writeTextFile(outPath, content);
		}
	}

	/**
	 * Walks a file's content line by line, expanding @bearmetal-partial
	 * directives by substituting the named partial's own applied content
	 * in place of the directive line. Tracks expansion ancestry to detect
	 * and break cycles.
	 */
	#applyContentDirectives(
		sourcePath: string,
		content: string,
		seen: Set<string>,
	): string {
		const lines = content.split("\n");
		const outputLines: string[] = [];

		for (const line of lines) {
			const directive = parseDirectiveLine(line);
			if (!directive || directive.name !== "partial") {
				outputLines.push(line);
				continue;
			}

			const partialName = directive.args;
			if (!partialName) {
				console.error(
					`bearmetal templator: @bearmetal-partial in "${sourcePath}" has no name`,
				);
				continue;
			}

			const partial = this.#files.get(partialName) ??
				this.options.partials.get(partialName)?.values().toArray()
					.join("\n" + directive.indent);
			if (!partial) {
				console.error(
					`bearmetal templator: @bearmetal-partial "${partialName}" referenced in "${sourcePath}" was not scanned`,
				);
				continue;
			}

			if (seen.has(partialName)) {
				console.error(
					`bearmetal templator: @bearmetal-partial cycle detected. "${partialName}" is already being expanded (from "${sourcePath}"), skipping`,
				);
				continue;
			}

			const expanded = this.#applyContentDirectives(
				partialName,
				typeof partial === "string" ? partial : partial.content,
				new Set([...seen, partialName]),
			);
			outputLines.push(directive.indent + expanded);
		}

		return outputLines.join("\n");
	}
}
