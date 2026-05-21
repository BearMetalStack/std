import { dbModule } from "@bearmetal/db";
import Router from "@bearmetal/router";
import { authModule } from "./mod.ts";
import { devProxyModule } from "@bearmetal/devproxy";

const router = new Router();
const PORT = 3000;
router
  .use(devProxyModule("auth", PORT))
  .use(dbModule("postgres", { _type: "env", poolSize: 2 }))
  .use(authModule());
console.log(router.rawServices.toArray());
await router.ready();
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, router.handle.bind(router));
