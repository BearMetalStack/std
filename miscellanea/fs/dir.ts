import { directoryOf } from "@path";

export function ensureDir(path: string): Promise<void> {
	return Deno.mkdir(path, { recursive: true });
}
export function ensureDirOf(path: string): Promise<void> {
	path = directoryOf(path);
	return ensureDir(path);
}
