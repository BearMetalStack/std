export function joinPath(...paths: string[]) {
  const leading = paths[0]?.startsWith("/") ?? false;
  const segments = paths.flatMap((p) => p.split("/")).reduce((a, b) => {
    if (b === ".." || a.at(-1) === "*") a.pop();
    else if (b !== "." && b !== "") a.push(b);
    return a;
  }, [] as string[]);
  return (leading ? "/" : "") + segments.join("/");
}
