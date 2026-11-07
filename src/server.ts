import { createServer, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, PORT, policy, isMain } from "./config.js";
import { EventStore } from "./store.js";
export function createApp(store = new EventStore()) {
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = "application/json") => {
      const raw =
        type === "application/json"
          ? JSON.stringify(body)
          : (body as string | Buffer);
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(raw);
    };
    try {
      if (
        req.method !== "GET" &&
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`
      )
        return send(403, { error: "Cross-origin requests rejected" });
      if (req.method === "DELETE" && req.url === "/api/demo")
        return send(200, { deleted: store.clearDemo() });
      if (req.method === "GET") {
        if (req.url === "/api/demo")
          return send(200, { count: store.demoCount() });
        if (req.url === "/api/health")
          return send(200, {
            service: "hook-inspector-ts-v1",
            pid: process.pid,
          });
        if (req.url === "/api/events") return send(200, store.list());
        if (req.url === "/api/policy") return send(200, policy());
        if (req.url === "/" || req.url === "/index.html")
          return send(
            200,
            readFileSync(resolve(ROOT, "static/index.html")),
            "text/html; charset=utf-8",
          );
        if (req.url === "/app.js")
          return send(
            200,
            readFileSync(resolve(ROOT, "dist/public/app.js")),
            "text/javascript; charset=utf-8",
          );
      }
      if (req.method === "POST" && req.url === "/api/events") {
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        )
          return send(403, { error: "Cross-origin requests rejected" });
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 65536) {
            send(413, { error: "Body exceeds 65536 bytes" });
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        try {
          return send(
            200,
            store.inspect(JSON.parse(Buffer.concat(chunks).toString())),
          );
        } catch (error) {
          return send(400, { error: (error as Error).message });
        }
      }
      send(404, { error: "Not found" });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(500, { error: "Receiver error" });
      else res.end();
    }
  });
}
if (isMain(import.meta.url)) {
  const store = new EventStore();
  const server = createApp(store);
  server.on("error", (error) => {
    console.error(error.message);
    store.close();
    process.exitCode = 1;
  });
  server.listen(PORT, "127.0.0.1", () =>
    console.log(`Hook Inspector: http://127.0.0.1:${PORT}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () =>
      server.close(() => {
        store.close();
        process.exit(0);
      }),
    );
}
