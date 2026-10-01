import { assertEquals } from "@std/assert";
import { localGuard } from "./local.ts";

const req = (method: string, headers: Record<string, string>) =>
	new Request("http://127.0.0.1:8000/api", { method, headers });

Deno.test("localGuard accepts loopback hosts", () => {
	assertEquals(localGuard(req("GET", { host: "127.0.0.1:8000" })), null);
	assertEquals(localGuard(req("GET", { host: "localhost:8000" })), null);
	assertEquals(localGuard(req("GET", { host: "[::1]:8000" })), null);
});

Deno.test("localGuard refuses a rebound hostname", async () => {
	const res = localGuard(req("GET", { host: "evil.example:8000" }));
	assertEquals(res?.status, 403);
	await res?.body?.cancel();
	assertEquals(
		localGuard(req("GET", { host: "app.test:8000" }), { allowedHosts: ["app.test"] }),
		null,
	);
});

Deno.test("localGuard refuses cross-origin writes, allows reads and originless writes", async () => {
	const host = "127.0.0.1:8000";
	assertEquals(localGuard(req("GET", { host, origin: "https://evil.example" })), null);
	assertEquals(localGuard(req("POST", { host })), null);
	assertEquals(localGuard(req("POST", { host, origin: "http://127.0.0.1:8000" })), null);
	const res = localGuard(req("POST", { host, origin: "https://evil.example" }));
	assertEquals(res?.status, 403);
	await res?.body?.cancel();
	assertEquals(
		localGuard(req("DELETE", { host, origin: "http://localhost:5173" }), {
			allowedOrigins: ["http://localhost:5173"],
		}),
		null,
	);
});
