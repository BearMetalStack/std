import { joinPath } from "@bearmetal/miscellanea";
import { buildDependencyGraph } from "./dep_graph.ts";
const token = Deno.env.get("JSR_PUBLISH_TOKEN");
async function publishPackage(
  pack: string,
  { dependencies, promises }: {
    dependencies: string[];
    promises: Record<string, Promise<boolean>>;
  },
  dryRun: boolean = false,
) {
  await new Promise((res) => {
    setTimeout(res, 0);
  });
  const statuses = await Promise.all(
    dependencies.map(async (dep) => [dep, await promises[dep]]),
  );
  if (!statuses.every((e) => e[1])) {
    console.log(
      `Unable publish ${pack}, publishing failed for the following dependencies: ${
        statuses.filter((e) => !e[1]).map((e) => e[0]).join(", ")
      }`,
    );
  }
  console.log(`Publishing ${pack}...`);
  const dir = pack.split("/")[1];
  const cmd = new Deno.Command("deno", {
    args: [
      "publish",
      "-q",
      `--token=${token}`,
      dryRun ? "--dry-run" : "",
    ].filter(Boolean),
    cwd: joinPath(Deno.cwd(), dir),
    stdout: "piped",
  });
  const child = cmd.spawn();
  const status = await child.status;
  if (status.success) console.log(`Successfully published ${pack}`);
  return status.success;
}

async function publishWorkspace(dryRun: boolean = false) {
  const dependencyGraph = await buildDependencyGraph("@bearmetal");
  if (checkCircularDependencies(dependencyGraph)) {
    console.log("Circular dependencies detected, exiting...");
    return;
  }
  const pubProms: Record<string, Promise<boolean>> = {};
  for (const [pack, dependencies] of Object.entries(dependencyGraph)) {
    pubProms[pack] = publishPackage(
      pack,
      { dependencies, promises: pubProms },
      dryRun,
    );
  }
}

function checkCircularDependencies(graph: Record<string, string[]>): boolean {
  let found = false;
  for (const [pack, dependencies] of Object.entries(graph)) {
    if (dependencies.flatMap((d) => graph[d]).includes(pack)) {
      console.log(`%cCircular dependency detected: ${pack}`, "color: red");
      found = true;
    }
  }
  return found;
}

if (import.meta.main) {
  await publishWorkspace(Deno.args.includes("--dry-run"));
}
