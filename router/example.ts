import { Router } from "./mod.ts";
import { ForagerModule } from "@bearmetal/router/modules/forager";
import { s } from "./schema.ts";

const router = new Router();
router.logALot();
router.use(new ForagerModule());

router.get("/", () => new Response("GET /"));

router.route("/users")
  .use<{ a: string }>((ctx, next) => {
    console.log("before");
    ctx.state.a = "hello";
    const res = next();
    console.log("after");
    return res;
  })
  .get<{ b: number }>((ctx) => {
    ctx.state.a;
    return new Response("GET /users");
  }).responds("get", { 200: s.string() })
  .post(s.object({ a: s.string().trim() }), (ctx) => {
    ctx.body;
    ctx.state.a;
    return new Response("POST /users");
  });

router.serveDirectory("./testbed", "/testbed", { spa: true });

Deno.serve({
  port: 7357,
}, router.handle);
