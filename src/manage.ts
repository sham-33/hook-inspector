import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { ROOT, URL, isMain } from "./config.js";
import { ensureServer } from "./runtime.js";
export const EVENTS = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SessionEnd",
];
interface Hook {
  command?: string;
  [key: string]: unknown;
}
interface Group {
  hooks: Hook[];
  [key: string]: unknown;
}
interface Settings {
  hooks?: Record<string, Group[]>;
  disableAllHooks?: boolean;
  [key: string]: unknown;
}
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
export function hookConfig() {
  const command = [process.execPath, resolve(ROOT, "dist/src/hook.js")]
    .map(quote)
    .join(" ");
  return Object.fromEntries(
    EVENTS.map((event) => [
      event,
      [{ hooks: [{ type: "command", command, timeout: 25 }] }],
    ]),
  );
}
export function configure(settings: string, install: boolean): void {
  const data: Settings = existsSync(settings)
    ? JSON.parse(readFileSync(settings, "utf8"))
    : {};
  if (install && data.disableAllHooks)
    throw Error("Hooks are disabled; enable them first");
  const hooks = (data.hooks ??= {});
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event]!.map((group) => ({
      ...group,
      hooks: group.hooks.filter(
        (h) =>
          ![resolve(ROOT, "hook.py"), resolve(ROOT, "dist/src/hook.js")].some(
            (path) => h.command?.includes(path),
          ),
      ),
    })).filter((group) => group.hooks.length);
    if (groups.length) hooks[event] = groups;
    else delete hooks[event];
  }
  if (install)
    for (const [event, groups] of Object.entries(hookConfig()))
      (hooks[event] ??= []).push(...groups);
  mkdirSync(dirname(settings), { recursive: true });
  const id = randomUUID();
  if (existsSync(settings))
    copyFileSync(settings, settings + ".hook-inspector-backup-" + id);
  const temp = settings + "." + id + ".tmp";
  writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, settings);
}
if (isMain(import.meta.url)) {
  const action = process.argv[2];
  const index = process.argv.indexOf("--settings");
  const settings =
    index >= 0
      ? process.argv[index + 1]
      : resolve(homedir(), ".claude/settings.json");
  if (!settings) throw Error("--settings requires a path");
  if (action === "start") {
    await ensureServer();
    console.log(URL);
  } else if (action === "install" || action === "uninstall") {
    configure(resolve(settings), action === "install");
    console.log(`${action} complete: ${settings}`);
  } else {
    console.error(
      "Usage: node dist/src/manage.js start|install|uninstall [--settings PATH]",
    );
    process.exitCode = 1;
  }
}
