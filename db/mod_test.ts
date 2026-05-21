import { assertExists } from "@std/assert";
import { dbModule, dbToken } from "./mod.ts";

Deno.test("dbModule returns a Module", () => {
  assertExists(dbModule);
});

Deno.test("dbToken is a string token", () => {
  assertExists(dbToken);
});
