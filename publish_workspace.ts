import { joinPath } from "@bearmetal/miscellanea";
import { buildDependencyGraph } from "./dep_graph.ts";
const token = Deno.env.get("JSR_PUBLISH_TOKEN");
if (!token) throw new Error("JSR_PUBLISH_TOKEN not set");
async function publishPackage(
  pack: string,
  { dependencies, promises }: {
    dependencies: string[];
    promises: Record<string, Promise<boolean>>;
  },
  dryRun: boolean = false,
): Promise<boolean> {
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
    return false;
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
  await Promise.all(Object.values(pubProms));
  console.log("Workspace publish finished, see above for results.");
}

function checkCircularDependencies(graph: Record<string, string[]>): boolean {
  let found = false;
  for (const pack of Object.keys(graph)) {
    const travel = traverseDependencyGraph(graph, pack, pack);
    if (travel.length) {
      console.log(
        `%cCircular dependency detected: ${pack}\n\t${
          travel.map((e) => e.join(" → ")).join("\n\t")
        }`,
        "color: red",
      );
      found = true;
    }
  }
  return found;
}
function traverseDependencyGraph(
  graph: Record<string, string[]>,
  start: string,
  root: string,
  seen: string[] = [],
): string[][] {
  const s = graph[start];
  const found: string[][] = [];
  for (const d of s ?? []) {
    if (seen.includes(d)) {
      if (d === root) found.push([start, d]);
      continue;
    }
    const t = traverseDependencyGraph(graph, d, root, [...seen, start]);
    if (t.length) {
      found.push(...t.map((e) => [start, ...e]));
    }
    if (d === root) {
      found.push([start, root]);
      break;
    }
  }
  return found;
}

if (import.meta.main) {
  await publishWorkspace(Deno.args.includes("--dry-run"));
}
