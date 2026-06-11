# @bearmetal/sockpuppet

WebSocket channel server with a matching browser client.

```ts
// server
import { sockpuppetModule } from "@bearmetal/sockpuppet";

// client (browser)
import { Sockpuppet } from "@bearmetal/sockpuppet/client";
```

## Quick start

```ts
// server.ts
import { Router } from "@bearmetal/router";
import { sockpuppetModule } from "@bearmetal/sockpuppet";

const router = new Router();
router.use(sockpuppetModule().build());

Deno.serve(router.handle);
```

```ts
// client.ts (browser)
import { Sockpuppet } from "@bearmetal/sockpuppet/client";

const puppet = new Sockpuppet("/ws", () => {
  puppet.joinChannel("chat", (message) => {
    console.log("received:", message);
  });
});

puppet.getChannel("chat")?.send("hello");
```

---

## sockpuppetModule() :: router integration

`sockpuppetModule(path?, options?)` returns a builder that configures the WebSocket server and produces a `@bearmetal/router` `Module`.

```ts
import { sockpuppetModule, SockpuppetServiceToken } from "@bearmetal/sockpuppet";

const mod = sockpuppetModule("/_ws", { pingInterval: 10_000 })
  .permanentChannel("global")
  .permanentChannel("notifications")
  .addMiddleware("^private:", (packet) => {
    // runs before any listener on channels matching /^private:/
  })
  .build();

router.use(mod);
```

### Builder methods

| Method | Description |
|---|---|
| `permanentChannel(channelId)` | Pre-creates a channel that persists even when empty |
| `addMiddleware(pattern, callback)` | Registers a `packetCallback` on all channels whose ID matches `pattern` (used as a `RegExp`) |
| `build()` | Returns the assembled `Module` to pass to `router.use()` |

All builder methods return the builder, so they can be chained.

### SockpuppetServiceToken

The module registers a `SockpuppetServiceToken` service that any downstream handler can use to control the server programmatically:

```ts
import { SockpuppetServiceToken } from "@bearmetal/sockpuppet";

router.route("/broadcast").post(async (ctx) => {
  const ws = ctx.getService(SockpuppetServiceToken);
  await ws.invoke("sendToChannel", "global", "a new message");
  return Ok();
});
```

| Action | Signature |
|---|---|
| `sendToChannel` | `(channelId: string, message: string) => Promise<void>` |
| `sendToClient` | `(clientId: string, message: string) => Promise<void>` |
| `createChannel` | `(channelId: string) => Promise<void>` |
| `closeChannel` | `(channelId: string) => Promise<void>` |

### Transmitter options

```ts
sockpuppetModule("/_ws", {
  pingInterval: 15_000,  // ms between pings (default unset)
  pingTimeout:  5_000,   // ms to wait for pong before disconnecting (default unset)
  reconnect:    true,    // whether to attempt reconnect on timeout
})
```

---

## SocketServer :: direct usage

`SocketServer` is the underlying class. Use it directly when you need the full server API outside of the router module, or when subclassing.

```ts
import { Sockpuppet as SocketServer } from "@bearmetal/sockpuppet";

const server = new SocketServer();

// wire into Deno.serve manually
Deno.serve((req, info) => server.requestHandler(req, info));
```

### Channels

Channels are the unit of pub/sub. Clients join channels by name and receive every message sent to that channel.

**Permanent channels** are created at startup and persist when empty:

```ts
server.createChannel("global");
```

**Dynamic channels** are created by clients at runtime and are deleted automatically when the last member leaves.

### to()

Broadcast a message to all listeners on a channel from the server side:

```ts
server.to("global", { type: "announcement", text: "Server restarting in 5 minutes" });

// send to a specific client within the channel
server.to("global", "private message", targetClientId);
```

### onConnect / onDisconnect

```ts
server.onConnect((packet) => {
  console.log("client connected:", packet.from.id);
});

server.onDisconnect((clientId) => {
  console.log("client disconnected:", clientId);
});
```

`onConnect` receives a `Packet`; `onDisconnect` receives the raw client ID string.

### use() :: channel middleware

Registers a `packetCallback` that runs before any channel listener. The first argument is a regex string matched against channel names at creation time.

```ts
server.use("^room:", (packet) => {
  logPacket(packet);
});
```

### Inspecting state

```ts
server.getClients();           // Map<string, Client>
server.getChannels();          // Map<string, Channel>
server.getChannel("global");   // Channel | undefined
```

---

## Client :: Sockpuppet

Import from the `/client` subpath. This module is browser-only.

```ts
import { Sockpuppet } from "@bearmetal/sockpuppet/client";
```

### Constructor

```ts
new Sockpuppet(path, onConnect?, options?)
```

| Argument | Type | Description |
|---|---|---|
| `path` | `string` | WebSocket URL or path. A bare path like `"/_ws"` is resolved against `location.host`. |
| `onConnect` | `() => void` | Called when the socket opens. Join channels here. |
| `options.keepAlive` | `boolean` | Send periodic pongs to prevent idle disconnection. Defaults to `true`. |

WebSocket connections are pooled by URL -- multiple `Sockpuppet` instances pointing at the same path share one underlying socket.

### joinChannel / leaveChannel

```ts
puppet.joinChannel("chat", (message) => {
  appendMessage(message);
});

puppet.leaveChannel("chat");
```

`joinChannel` safely queues if the socket isn't open yet. The callback receives the raw message string.

### getChannel().send()

```ts
puppet.getChannel("chat")?.send("hello everyone");

// send to a specific client only
puppet.getChannel("chat")?.send("private", targetClientId);
```

`getChannel` returns `undefined` if the client has not joined that channel.

### createChannel()

Creates a new channel on the server. Resolves with a `Message` on success, rejects on failure.

```ts
const msg = await puppet.createChannel("room:42");
```

### on() and onDisconnect()

Listen for socket-level events:

```ts
puppet.on("reconnect", () => {
  puppet.joinChannel("chat", handler);
});

puppet.onDisconnect(() => {
  showOfflineBanner();
});
```

### handshakeAccepted / versionMismatch

```ts
puppet.handshakeAccepted  // true once the server confirms the handshake
puppet.versionMismatch    // true if the server is running an older protocol version
```

A version mismatch logs a warning automatically but does not close the connection.
