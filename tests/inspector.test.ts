import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventStore } from "../src/store.js";
import { formatEvent } from "../src/formatting.js";
import { configure, hookConfig } from "../src/manage.js";
import { createApp } from "../src/server.js";
import { ROOT, validate } from "../src/config.js";
import type { Payload } from "../src/types.js";
const exec = promisify(execFile);
function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(resolve(tmpdir(), "hook-inspector-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function payload(
  cwd: string,
  path: string,
  event = "PreToolUse",
  tool = "Write",
): Payload {
  return {
    cwd,
    hook_event_name: event,
    tool_name: tool,
    tool_input: { file_path: path },
    session_id: "test",
  };
}
for (const path of [".env", "secrets/key", "src/../.env", ".git/config"])
  test(`denies ${path}`, (t) => {
    const dir = fixture(t),
      store = new EventStore(":memory:");
    t.after(() => store.close());
    assert.equal(
      store.inspect(payload(dir, path)).hookSpecificOutput?.permissionDecision,
      "deny",
    );
  });
test("permits unrelated paths, reads and observational events", (t) => {
  const dir = fixture(t),
    store = new EventStore(":memory:");
  t.after(() => store.close());
  for (const path of ["src/main.ts", ".env.example", "secrets-other/key"])
    assert.equal(store.inspect(payload(dir, path)).record.status, "allowed");
  assert.equal(
    store.inspect(payload(dir, ".env", "PreToolUse", "Read")).record.status,
    "allowed",
  );
  assert.equal(
    store.inspect(payload(dir, ".env", "PostToolUse")).record.status,
    "allowed",
  );
});
test("normalizes absolute paths and symlinks", (t) => {
  const dir = fixture(t),
    store = new EventStore(":memory:");
  t.after(() => store.close());
  writeFileSync(resolve(dir, ".env"), "test");
  symlinkSync(resolve(dir, ".env"), resolve(dir, "alias"));
  assert.equal(store.inspect(payload(dir, "alias")).record.status, "blocked");
  assert.equal(
    store.inspect(payload(dir, resolve(dir, ".env"))).record.status,
    "blocked",
  );
});
test("rejects malformed input", () => {
  for (const p of [
    [],
    null,
    4,
    { tool_input: [] },
    { cwd: 4 },
    { tool_input: { file_path: 4 } },
  ])
    assert.throws(() => validate(p));
});
test("never stores content or command text", (t) => {
  const store = new EventStore(":memory:");
  t.after(() => store.close());
  store.inspect({ tool_input: { content: "SECRET", command: "SECRET" } });
  assert.ok(!JSON.stringify(store.list()).includes("SECRET"));
});
test("reads legacy SQLite records and preserves IDs", (t) => {
  const dir = fixture(t),
    dbPath = resolve(dir, "events.sqlite3");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY,data TEXT NOT NULL)");
  db.prepare("INSERT INTO events VALUES (?,?)").run(
    42,
    JSON.stringify({ event: "Legacy", status: "allowed" }),
  );
  db.close();
  const store = new EventStore(dbPath);
  assert.equal(store.list()[0]?.id, 42);
  assert.equal(store.inspect({}).record.id, 43);
  store.close();
  const reopened = new EventStore(dbPath);
  assert.equal(reopened.list().length, 2);
  reopened.close();
});
for (const [name, content] of [
  ["sample.json", '{"hello":1}'],
  ["sample.ts", "const value={hello:1};"],
  ["sample.py", 'x= {"hello":1}\n'],
] as const)
  test(`formats ${name} and is idempotent`, async (t) => {
    const dir = fixture(t),
      path = resolve(dir, name);
    writeFileSync(path, content);
    const p = payload(dir, path, "PostToolUse");
    assert.equal((await formatEvent(p))?.status, "formatted");
    assert.equal((await formatEvent(p))?.status, "unchanged");
  });
test("skips protected, outside, unsupported and demo targets", async (t) => {
  const dir = fixture(t);
  writeFileSync(resolve(dir, ".env"), "a=1");
  writeFileSync(resolve(dir, "a.bin"), "binary");
  for (const path of [".env", "../outside.json", "a.bin", "missing.json"])
    assert.equal(
      (await formatEvent(payload(dir, path, "PostToolUse")))?.status,
      "skipped",
    );
  assert.equal(
    await formatEvent({ ...payload(dir, "a.json", "PostToolUse"), demo: true }),
    undefined,
  );
});
test("invalid syntax remains intact", async (t) => {
  const dir = fixture(t),
    path = resolve(dir, "bad.json");
  writeFileSync(path, "{broken");
  assert.equal(
    (await formatEvent(payload(dir, path, "PostToolUse")))?.status,
    "error",
  );
  assert.equal(readFileSync(path, "utf8"), "{broken");
});
test("installer upgrades legacy hooks, preserves other config, and is reversible", (t) => {
  const dir = fixture(t),
    path = resolve(dir, "settings.json");
  const original = {
    permissions: { allow: ["Read"] },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo other" }] }] },
  };
  writeFileSync(
    path,
    JSON.stringify({
      ...original,
      hooks: {
        ...original.hooks,
        PreToolUse: [
          { hooks: [{ type: "command", command: `python3 ${ROOT}/hook.py` }] },
        ],
      },
    }),
  );
  configure(path, true);
  const once = readFileSync(path, "utf8");
  assert.ok(!once.includes("hook.py"));
  assert.ok(once.includes("dist/src/hook.js"));
  configure(path, true);
  assert.equal(readFileSync(path, "utf8"), once);
  configure(path, false);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), original);
  assert.equal(readdirSync(dir).filter((x) => x.includes("backup")).length, 3);
});
test("does not override disabled hooks", (t) => {
  const dir = fixture(t),
    path = resolve(dir, "settings.json");
  writeFileSync(path, '{"disableAllHooks":true}');
  assert.throws(() => configure(path, true));
  assert.equal(readFileSync(path, "utf8"), '{"disableAllHooks":true}');
});
test("HTTP endpoints, body limits, origin checks and hook adapter", async (t) => {
  const dir = fixture(t),
    store = new EventStore(":memory:"),
    server = createApp(store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port,
    url = `http://127.0.0.1:${port}`;
  assert.equal(
    (await fetch(url + "/api/health").then((r) => r.json())).service,
    "hook-inspector-ts-v1",
  );
  assert.match(await fetch(url).then((r) => r.text()), /app.js/);
  assert.equal((await fetch(url + "/app.js")).status, 200);
  assert.equal((await fetch(url + "/missing")).status, 404);
  assert.equal(
    (await fetch(url + "/api/events", { method: "POST", body: "[]" })).status,
    400,
  );
  assert.equal(
    (
      await fetch(url + "/api/events", {
        method: "POST",
        body: "x".repeat(65537),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(url + "/api/events", {
        method: "POST",
        headers: { Origin: "https://example.com" },
        body: "{}",
      })
    ).status,
    403,
  );
  const child = execFile(
    process.execPath,
    [resolve(ROOT, "dist/src/hook.js")],
    { env: { ...process.env, HOOK_INSPECTOR_PORT: String(port) } },
  );
  child.stdin!.end(
    JSON.stringify({
      ...payload(dir, ".env"),
      tool_input: { file_path: ".env", content: "SECRET".repeat(20000) },
    }),
  );
  let output = "";
  child.stdout!.on("data", (data) => (output += data));
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.equal(
    JSON.parse(output).hookSpecificOutput.permissionDecision,
    "deny",
  );
  assert.ok(!JSON.stringify(store.list()).includes("SECRET"));
});

test("demo cleanup deletes only demo records, including outside the visible window", (t) => {
  const store = new EventStore(":memory:");
  t.after(() => store.close());
  assert.equal(store.demoCount(), 0);
  store.inspect({ demo: true });
  for (let i = 0; i < 1001; i++) store.inspect({ session_id: "real" });
  assert.equal(
    store.list().some((e) => e.demo),
    false,
  );
  assert.equal(store.demoCount(), 1);
  assert.equal(store.clearDemo(), 1);
  assert.equal(store.demoCount(), 0);
  assert.equal(
    store.db.prepare("SELECT count(*) AS count FROM events").get()!.count,
    1001,
  );
  assert.equal(store.clearDemo(), 0);
});

test("demo cleanup API protects real events and rejects cross-origin deletion", async (t) => {
  const store = new EventStore(":memory:"),
    server = createApp(store);
  store.inspect({ demo: true });
  store.inspect({ session_id: "real" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/demo`;
  assert.deepEqual(await fetch(url).then((r) => r.json()), { count: 1 });
  assert.equal(
    (
      await fetch(url, {
        method: "DELETE",
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  assert.equal(store.demoCount(), 1);
  assert.deepEqual(
    await fetch(url, { method: "DELETE" }).then((r) => r.json()),
    { deleted: 1 },
  );
  assert.equal(store.list()[0]?.session, "real");
  assert.deepEqual(await fetch(url).then((r) => r.json()), { count: 0 });
});
