import { mkdirSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { ROOT, STATE, URL } from "./config.js";
export async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(URL + "/api/health", {
      signal: AbortSignal.timeout(400),
    });
    return (await response.json()).service === "hook-inspector-ts-v1";
  } catch {
    return false;
  }
}
export async function ensureServer(): Promise<void> {
  if (await healthy()) return;
  mkdirSync(STATE, { recursive: true, mode: 0o700 });
  const log = openSync(resolve(STATE, "server.log"), "a", 0o600);
  const child = spawn(process.execPath, [resolve(ROOT, "dist/src/server.js")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.on("error", () => {});
  child.unref();
  // The loopback port is the atomic singleton lock: competing startups exit on EADDRINUSE.
  for (let i = 0; i < 40; i++) {
    if (await healthy()) return;
    await delay(100);
  }
  throw Error(
    "Receiver did not start; inspect .runtime/server.log and port 8765",
  );
}
