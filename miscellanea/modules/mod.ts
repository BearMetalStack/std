export function isClient(): boolean {
  if (typeof globalThis["document"] !== "undefined") return true;
  return false;
}

export function throwIfNotClient(moduleName?: string): void {
  if (!isClient()) {
    throw new Error(
      moduleName ? `${moduleName} is a client only module` : "Not a client",
    );
  }
}

export function throwIfNotServer(moduleName?: string): void {
  if (isClient() || typeof globalThis["Deno"] !== "undefined") {
    throw new Error(
      moduleName ? `${moduleName} is a server only module` : "Not a server",
    );
  }
}
