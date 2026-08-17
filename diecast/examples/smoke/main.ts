import { router } from "./app.ts";

Deno.serve(router.handle);
