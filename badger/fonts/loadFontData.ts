const baseDir = ".bearmetal/fonts";
export interface FontData {
	widths: Record<string, Record<string, number>>;
	b64s: Record<string, string>;
	style: string;
}
export async function loadFontData(fontName: string): Promise<FontData> {
	const widths = await Deno.readTextFile(
		`${baseDir}/${fontName}/width_lut.json`,
	);
	const b64s = await Deno.readTextFile(`${baseDir}/${fontName}/b64.json`);
	const style = await Deno.readTextFile(`${baseDir}/${fontName}/style.css`);
	return {
		widths: JSON.parse(widths),
		b64s: JSON.parse(b64s),
		style,
	};
}
