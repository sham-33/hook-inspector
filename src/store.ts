import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  ROOT,
  WRITERS,
  canonical,
  protectedPath,
  policy,
  validate,
} from "./config.js";
import type { EventRecord, EventResult, FormattingResult } from "./types.js";
export class EventStore {
  readonly db: DatabaseSync;
  constructor(
    path = process.env.HOOK_INSPECTOR_DB ?? resolve(ROOT, "events.sqlite3"),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, data TEXT NOT NULL)",
    );
  }
  inspect(input: unknown): EventResult {
    const p = validate(input),
      event = p.hook_event_name ?? "Unknown",
      tool = p.tool_name ?? "",
      path = p.tool_input?.file_path ?? "";
    const cwd = canonical(p.cwd ?? ROOT);
    const blocked =
      !!path &&
      event === "PreToolUse" &&
      WRITERS.has(tool) &&
      protectedPath(cwd, canonical(resolve(cwd, path)), policy());
    const record: EventRecord = {
      time: Date.now() / 1000,
      event,
      tool,
      session: p.session_id ?? "local",
      path,
      status: blocked ? "blocked" : "allowed",
      reason: blocked ? "Protected path policy" : "Event recorded",
      demo: !!p.demo,
    };
    if (
      p.formatting &&
      typeof p.formatting === "object" &&
      ["disabled", "skipped", "formatted", "unchanged", "error"].includes(
        p.formatting.status,
      )
    ) {
      record.formatting = { status: p.formatting.status };
      for (const key of ["reason", "formatter"] as const)
        if (typeof p.formatting[key] === "string")
          record.formatting[key] = p.formatting[key].slice(0, 200);
    }
    record.id = Number(
      this.db
        .prepare("INSERT INTO events(data) VALUES (?)")
        .run(JSON.stringify(record)).lastInsertRowid,
    );
    return {
      record,
      ...(blocked
        ? {
            hookSpecificOutput: {
              hookEventName: "PreToolUse" as const,
              permissionDecision: "deny" as const,
              permissionDecisionReason: "Hook Inspector: protected path",
            },
          }
        : {}),
    };
  }
  list(): EventRecord[] {
    return this.db
      .prepare("SELECT id,data FROM events ORDER BY id DESC LIMIT 1000")
      .all()
      .map(
        (row) =>
          ({
            ...JSON.parse(String(row.data)),
            id: Number(row.id),
          }) as EventRecord,
      );
  }
  close() {
    this.db.close();
  }
}
