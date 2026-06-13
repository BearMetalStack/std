const DEV = Deno.args.find((e) => e.startsWith("--dev"))?.split("=").at(-1) ??
	Deno.env.get("BEARMETAL_PLAYGROUND_DEV") ?? "emma";

const { run } = await import(`./${DEV}/mod.ts`);

run();
