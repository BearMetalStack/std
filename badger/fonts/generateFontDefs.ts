import { parseTTF } from "./readFont.ts";

const targetDir = Deno.args[0] ?? ".bearmetal/fonts";

for await (const entry of Deno.readDir(targetDir)) {
  if (!entry.isDirectory) {
    console.log(
      `File ${entry.name} found in fonts directory, please move this to a subdirectory before processing fonts.`,
    );
    continue;
  }

  const fontName = entry.name;
  const files: string[] = [];
  for await (const f of Deno.readDir(`${targetDir}/${fontName}`)) {
    files.push(f.name);
  }

  // if (files.includes("style.css") && files.includes("width_lut.json")) continue;

  const nonWoffs = files.filter((f) =>
    f.endsWith(".ttf") || f.endsWith(".otf")
  );
  const needsConversions = nonWoffs.filter((f) =>
    !files.includes(f.replace(/\.(ttf|otf)/, ".woff2"))
  );

  for (const toConvert of needsConversions) {
    const cmd = new Deno.Command("woff2_compress", {
      args: [toConvert],
      cwd: `${Deno.cwd()}/${targetDir}/${fontName}`,
    });
    const child = cmd.spawn();
    const status = await child.status;
    if (!status.success) {
      throw "Trouble converting fonts, make sure woff2 is installed on the system";
    }
  }

  const lut: Record<
    "regular" | "italic" | "bold" | string,
    Record<string, number>
  > = {};
  const b64s: Record<
    "regular" | "italic" | "bold" | string,
    string
  > = {};
  let styleSheet = "";
  for (const file of nonWoffs) {
    const path = `${targetDir}/${fontName}/${file}`;
    const f = await Deno.readFile(path);
    const measurements = measureFont(f);
    const type = file.match(/bold|italic|regular/i)?.[0]?.toLowerCase() ??
      "regular";
    lut[type] = measurements;

    const fontBytes = await Deno.readFile(path.replace(".ttf", ".woff2"));
    let b64 = "";
    const chunk = 8192;
    for (let i = 0; i < fontBytes.length; i += chunk) {
      b64 += String.fromCharCode(...fontBytes.subarray(i, i + chunk));
    }
    b64 = btoa(b64);
    styleSheet += `
    @font-face {
    	font-family: '${fontName}';
      font-weight: ${type === "bold" ? 700 : 400};
      font-style: ${type === "italic" ? "italic" : "normal"};
     	src: url('data:font/woff2;base64,${b64}') format('woff2');
    }
    `;
    b64s[type] = b64;
  }

  await Deno.writeTextFile(
    `${targetDir}/${fontName}/width_lut.json`,
    JSON.stringify(lut),
  );
  await Deno.writeTextFile(
    `${targetDir}/${fontName}/b64.json`,
    JSON.stringify(b64s),
  );
  if (styleSheet) {
    await Deno.writeTextFile(
      `${targetDir}/${fontName}/style.css`,
      styleSheet,
    );
  }
}

function measureFont(file: Uint8Array): Record<string, number> {
  const getWidthByCodepoint = parseTTF(file);
  const defaultChars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()-_=+[]{}\\|,<.>/?`~≥";
  const widths: Record<string, number> = {};
  for (const char of defaultChars) {
    const width = getWidthByCodepoint(char.charCodeAt(0));
    widths[char] = width;
  }
  return widths;
}
