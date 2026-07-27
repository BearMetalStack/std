import { namespaces } from "./namespaces.ts";
import { dotBearmetalFile, dotBearmetalFileUrl } from "@bearmetal/miscellanea/fs";
import type { DotBearmetalFile } from "@bearmetal/miscellanea/types";

export interface DripConfig {
	disableBearmetal?: boolean;
	defaultTheme?: string;
}

/**
 * Reads the project config. Uses the URL-based reader so this also works from
 * inside a compiled binary, where a `.bearmetal` embedded with
 * `deno compile --include .bearmetal` is invisible to the cwd-walking utilities.
 */
export async function readDripConfig(): Promise<DripConfig> {
	const file = await dotBearmetalFileUrl<DripConfig>(namespaces.primary, "config.json", {
		base: import.meta.url,
	});
	return await file.readJson();
}

/**
 * The writable config handle. Only for tooling that mutates config — a compiled
 * binary's embedded file system is read-only, so prefer {@link readDripConfig}
 * anywhere that only reads.
 */
let conf: DotBearmetalFile<DripConfig>;
export async function getDripConfig(): Promise<DotBearmetalFile<DripConfig>> {
	return conf ??= await dotBearmetalFile<DripConfig>(namespaces.primary, "config.json");
}

export async function dripConfig<T extends keyof DripConfig>(
	key: T,
	value: DripConfig[T],
): Promise<void> {
	const configFile = await getDripConfig();
	const config = await configFile.readJson<DripConfig>();
	config[key] = value;
	await configFile.writeJson(config);
}
