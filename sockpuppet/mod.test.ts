import { assertEquals } from "@std/assert";
import { Sockpuppet } from "./mod.ts";
import { socketUrl } from "./client/mod.ts";

function serve(puppet: Sockpuppet) {
	return Deno.serve(
		{ port: 0, hostname: "127.0.0.1", onListen: () => {} },
		(req, info) => puppet.requestHandler(req, info),
	);
}

/** Opens a socket and collects every text frame until `close()`. */
async function connect(url: string) {
	const ws = new WebSocket(url);
	const frames: string[] = [];
	const waiters: (() => void)[] = [];
	ws.onmessage = (e) => {
		frames.push(e.data);
		waiters.splice(0).forEach((w) => w());
	};
	const opened = await new Promise<boolean>((res) => {
		ws.onopen = () => res(true);
		ws.onerror = () => res(false);
	});
	const until = async (pred: (f: string) => boolean, ms = 1000) => {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			const hit = frames.find(pred);
			if (hit) return hit;
			await new Promise<void>((res) => {
				waiters.push(res);
				setTimeout(res, 20);
			});
		}
		return undefined;
	};
	const close = () =>
		new Promise<void>((res) => {
			if (ws.readyState === WebSocket.CLOSED) return res();
			ws.onclose = () => res();
			ws.close();
		});
	return { ws, frames, opened, until, close };
}

Deno.test("authorize refuses a socket and keeps meta for one it accepts", async () => {
	const puppet = new Sockpuppet({
		authorize: (req) => {
			const token = new URL(req.url).searchParams.get("token");
			return token === "good" ? { user: "bear" } : false;
		},
	});
	puppet.createChannel("room");
	let seenMeta: unknown;
	puppet.onJoin((client) => (seenMeta = client.meta));
	const server = serve(puppet);
	const base = `ws://127.0.0.1:${server.addr.port}`;

	const res = await fetch(`http://127.0.0.1:${server.addr.port}/?token=bad`, {
		headers: {
			upgrade: "websocket",
			connection: "upgrade",
			"sec-websocket-key": "x",
			"sec-websocket-version": "13",
		},
	});
	assertEquals(res.status, 401);
	await res.body?.cancel();

	const good = await connect(`${base}/?token=good`);
	assertEquals(good.opened, true);
	good.ws.send(JSON.stringify({ connect_to: ["room"] }));
	await good.until((f) => f === "Connected to room");
	assertEquals(seenMeta, { user: "bear" });

	await good.close();
	await server.shutdown();
});

Deno.test("canJoin gates channels, onJoin can send a backlog to just that client", async () => {
	const puppet = new Sockpuppet({ canJoin: (_c, id) => id !== "secret" });
	puppet.createChannel("log");
	puppet.createChannel("secret");
	puppet.onJoin((client, id) => {
		if (id === "log") puppet.to("log", { backlog: ["a", "b"] }, client.id);
	});
	const server = serve(puppet);
	const sock = await connect(`ws://127.0.0.1:${server.addr.port}/`);

	sock.ws.send(JSON.stringify({ connect_to: ["secret", "log"] }));
	assertEquals(
		await sock.until((f) => f === "Not allowed to join secret"),
		"Not allowed to join secret",
	);
	const backlog = await sock.until((f) => f.includes("backlog"));
	assertEquals(JSON.parse(backlog!).message, { backlog: ["a", "b"] });
	assertEquals(puppet.getChannel("secret")!.listeners.size, 0);

	await sock.close();
	await server.shutdown();
});

Deno.test("middleware returning false drops a packet before the broadcast", async () => {
	const puppet = new Sockpuppet();
	const seen: unknown[] = [];
	puppet.use("^cmd$", (packet) => {
		seen.push(packet.message);
		return packet.message !== "blocked";
	});
	puppet.createChannel("cmd");
	const server = serve(puppet);
	const url = `ws://127.0.0.1:${server.addr.port}/`;
	const a = await connect(url);
	const b = await connect(url);
	for (const s of [a, b]) {
		s.ws.send(JSON.stringify({ connect_to: ["cmd"] }));
		await s.until((f) => f === "Connected to cmd");
	}

	a.ws.send(JSON.stringify({ send_packet: { to: "cmd", message: "blocked" } }));
	a.ws.send(JSON.stringify({ send_packet: { to: "cmd", message: "allowed" } }));
	const got = await b.until((f) => f.includes("allowed"));
	assertEquals(JSON.parse(got!).message, "allowed");
	assertEquals(b.frames.some((f) => f.includes("blocked")), false);
	assertEquals(seen, ["blocked", "allowed"]);

	await a.close();
	await b.close();
	await server.shutdown();
});

Deno.test("socketUrl resolves paths against the page", () => {
	const page = (href: string) => new URL(href) as unknown as Location;
	assertEquals(socketUrl("/ws", page("http://127.0.0.1:8080/x")), "ws://127.0.0.1:8080/ws");
	assertEquals(socketUrl("ws", page("https://kk.example/x")), "wss://kk.example/ws");
	assertEquals(socketUrl("wss://a.b/ws"), "wss://a.b/ws");
	assertEquals(socketUrl("http://localhost:3000/ws"), "ws://localhost:3000/ws");
});
