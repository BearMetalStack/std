import { join } from "node:path";
import { HEALTH_ENDPOINT } from "./consts.ts";

const registry = new Map<string, string>();
setInterval(poll, 30_000);
Deno.serve({ port: 8888, hostname: "0.0.0.0" }, async (req, a) => {
  const NotFoundPage = await Deno.readTextFile("./404.html");
  const host = req.headers.get("host") ?? "";
  const name = host.split(".")[0];

  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/__claim") {
    const ip = (req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-cluster-client-ip") ||
      req.headers.get("x-client-ip") ||
      req.headers.get("x-proxy-user-ip"))?.split(",")[0]?.trim() ||
      a.remoteAddr.hostname;
    const { target, port } = await req.json();
    console.log(`[BearMetal devproxy] Claiming ${target} at ${ip}:${port}`);
    registry.set(target, ip + ":" + port);
    return new Response("claimed");
  }

  const upstream = registry.get(name);
  if (!upstream) {
    return new Response(NotFoundPage, {
      status: 404,
      headers: {
        "content-type": "text/html",
      },
    });
  }

  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleWebSocket(req, upstream);
  }

  url.host = upstream;
  const upstreamReq = new Request(url, req);
  return fetch(upstreamReq);
});

// deno-lint-ignore require-await
async function handleWebSocket(
  req: Request,
  upstream: string,
): Promise<Response> {
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  const wsUpstream = upstream.replace(/^http/, "ws");
  const url = new URL(req.url);
  const serverSocket = new WebSocket(wsUpstream + url.pathname + url.search);

  serverSocket.onopen = () => {
    clientSocket.onmessage = (e) => serverSocket.send(e.data);
    serverSocket.onmessage = (e) => clientSocket.send(e.data);
  };

  clientSocket.onclose = () => serverSocket.close();
  serverSocket.onclose = () => clientSocket.close();

  clientSocket.onerror = (e) => console.error("client ws error", e);
  serverSocket.onerror = (e) => console.error("upstream ws error", e);

  return response;
}

function poll() {
  for (const [host, upstream] of registry.entries()) {
    fetch("http://" + join(upstream, HEALTH_ENDPOINT)).then((r) => {
      if (!(r.status >= 200 && r.status < 400)) {
        console.log(`${host} is not healthy, deleting`);
        registry.delete(host);
      }
    }).catch((e) => {
      console.log(e);
      registry.delete(host);
    });
  }
}
