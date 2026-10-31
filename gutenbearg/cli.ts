/**
 * @module
 * The `gutenbearg` command: serve, build and check a content directory, and edit it without
 * renumbering by hand.
 *
 * ```sh
 * deno run -A jsr:@bearmetal/gutenbearg/cli dev
 * deno run -A jsr:@bearmetal/gutenbearg/cli new page guides/start-here/deploying --after getting-started
 * deno run -A jsr:@bearmetal/gutenbearg/cli new page core/learn/batching      # core's current version
 * deno run -A jsr:@bearmetal/gutenbearg/cli edit core/reference/signal         # copy it forward
 * deno run -A jsr:@bearmetal/gutenbearg/cli changelog core                     # draft from commits
 * deno run -A jsr:@bearmetal/gutenbearg/cli reindex guides/start-here
 * deno run -A jsr:@bearmetal/gutenbearg/cli build --out=dist --strict
 * ```
 */

import { ArgParser } from "@bearmetal/cli/argParser";
import { Router } from "@bearmetal/router";
import { build } from "./build.ts";
import { gutenbeargModule, reportDiagnostics } from "./module.tsx";
import { DEFAULT_DIR, loadContent } from "./content/load.ts";
import { draftChangelog } from "./content/changelog.ts";
import {
	ContentEditError,
	copyForward,
	cutVersion,
	newPage,
	newSection,
	reindex,
	resolveDir,
} from "./content/edit.ts";

const DIR = { type: "string", description: `Content directory (default ${DEFAULT_DIR})` } as const;
const POSITION = {
	after: { type: "string", description: "Slug to place it after" },
	before: { type: "string", description: "Slug to place it before" },
	reindex: { type: "flag", description: "Respace the directory if there is no room" },
} as const;

/** Runs the CLI with `args`. Returns the exit code. */
export async function main(args: string[] = Deno.args): Promise<number> {
	const parsed = await ArgParser.commandFrom(args, {
		$root: { dir: DIR },
		dev: {
			port: { type: "string", description: "Port (default 8000)" },
		},
		build: {
			out: { type: "string", description: "Output directory (default dist)" },
			strict: { type: "flag", description: "Refuse to build with content problems" },
		},
		check: {},
		new: {
			$commands: {
				page: {
					path: { type: "positional", required: true, description: "section/path/new-slug" },
					title: { type: "string", description: "Title for the stub" },
					...POSITION,
				},
				section: {
					path: { type: "positional", required: true, description: "parent/path/new-slug" },
					icon: { type: "string", description: "Phosphor icon name" },
					...POSITION,
				},
			},
		},
		reindex: {
			path: { type: "positional", required: true, description: "Directory, in slugs" },
			sections: { type: "flag", description: "Respace the sections in it instead of pages" },
			"dry-run": { type: "flag", description: "Print the renames without making them" },
		},
		cut: {
			package: { type: "positional", required: true },
			version: { type: "positional", required: true },
		},
		edit: {
			path: {
				type: "positional",
				required: true,
				description: "package/section/page; copied into the current version",
			},
		},
		changelog: {
			package: { type: "positional", required: true },
			version: { type: "string", description: "Release the entry is for" },
			force: { type: "flag", description: "Replace an existing entry" },
		},
	}).setProgram("gutenbearg").resolve();

	const a = parsed as unknown as Record<string, string | boolean | undefined> & { command: string };
	const dir = (a.dir as string | undefined) ?? DEFAULT_DIR;
	try {
		switch (a.command) {
			case "dev": {
				const router = new Router().use(await gutenbeargModule({ dir, watch: true }));
				Deno.serve({ port: Number(a.port ?? 8000) }, router.handle);
				return await new Promise<number>(() => {});
			}
			case "build": {
				const result = await build({
					dir,
					outDir: a.out as string | undefined,
					strict: !!a.strict,
				});
				if (!result.ok && result.report.pages.length === 0 && result.diagnostics.length) {
					console.error("gutenbearg: not building with content problems (--strict)");
					return 1;
				}
				console.log(`gutenbearg: wrote ${result.report.pages.length} files`);
				for (const f of result.report.failures) console.error(`  ✖ ${f.url}: ${f.message}`);
				return result.ok ? 0 : 1;
			}
			case "check": {
				const content = await loadContent(dir);
				reportDiagnostics(content.diagnostics);
				if (!content.diagnostics.length) {
					console.log(`gutenbearg: ${content.routes.size} routes, no problems`);
				}
				return content.diagnostics.length ? 1 : 0;
			}
			case "new page": {
				const file = await newPage(dir, a.path as string, {
					after: a.after as string | undefined,
					before: a.before as string | undefined,
					title: a.title as string | undefined,
					reindex: !!a.reindex,
				});
				console.log(`created ${file}`);
				return 0;
			}
			case "new section": {
				const made = await newSection(dir, a.path as string, {
					after: a.after as string | undefined,
					before: a.before as string | undefined,
					icon: a.icon as string | undefined,
					reindex: !!a.reindex,
				});
				console.log(`created ${made}`);
				return 0;
			}
			case "reindex": {
				const target = await resolveDir(dir, a.path as string);
				const moves = await reindex(target, a.sections ? "section" : "page", {
					dryRun: !!a["dry-run"],
				});
				for (const m of moves) console.log(`${m.from} → ${m.to}`);
				if (!moves.length) console.log("already evenly spaced");
				return 0;
			}
			case "cut": {
				console.log(`created ${await cutVersion(dir, a.package as string, a.version as string)}`);
				return 0;
			}
			case "edit": {
				const { file, copied } = await copyForward(dir, a.path as string);
				console.log(copied ? `copied forward to ${file}` : `already current: ${file}`);
				return 0;
			}
			case "changelog": {
				const draft = await draftChangelog(dir, a.package as string, {
					version: a.version as string | undefined,
					force: !!a.force,
				});
				console.log(
					`drafted ${draft.file} from ${draft.changes.length} commit(s) since ${
						draft.since ?? "the beginning"
					}; edit it before releasing`,
				);
				return 0;
			}
			default:
				console.error(`unknown command "${a.command}"`);
				return 2;
		}
	} catch (e) {
		if (e instanceof ContentEditError) {
			console.error(`gutenbearg: ${e.message}`);
			return 1;
		}
		throw e;
	}
}

if (import.meta.main) Deno.exit(await main());
