import { namespaces } from "@bearmetal/drip/namespaces";
import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import type { DotBearmetalFile } from "@bearmetal/miscellanea/types";

interface DripConfig {
	disableBearmetal?: boolean;
	defaultTheme?: string;
}

let conf: DotBearmetalFile<DripConfig>;
export async function getDripConfig(): Promise<DotBearmetalFile<DripConfig>> {
	return conf ??= await dotBearmetalFile<DripConfig>(namespaces.primary, "config.json");
}

export async function dripConfig<T extends keyof DripConfig>(key: T, value: DripConfig[T]) {
	const configFile = await dotBearmetalFile(namespaces.primary, "config.json");
	const config = await configFile.readJson<DripConfig>();
	config[key] = value;
	await configFile.writeJson(config);
}
