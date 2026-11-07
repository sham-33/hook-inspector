import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ROOT,
  WRITERS,
  policy,
  canonical,
  within,
  protectedPath,
} from "./config.js";
import type { Payload, FormattingResult } from "./types.js";
const execute = promisify(execFile);
const WEB = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".yaml",
  ".yml",
]);
export async function formatEvent(
  p: Payload,
): Promise<FormattingResult | undefined> {
  if (
    p.demo ||
    p.hook_event_name !== "PostToolUse" ||
    !WRITERS.has(p.tool_name ?? "")
  )
    return;
  const config = policy();
  if (!config.format_on_edit) return { status: "disabled" };
  const path = p.tool_input?.file_path;
  if (!path) return { status: "skipped", reason: "No file target" };
  const cwd = canonical(p.cwd ?? ROOT),
    target = canonical(resolve(cwd, path));
  if (
    target === cwd ||
    !within(cwd, target) ||
    protectedPath(cwd, target, config)
  )
    return { status: "skipped", reason: "Outside workspace or protected" };
  if (
    !existsSync(target) ||
    !statSync(target).isFile() ||
    statSync(target).size > 2_000_000
  )
    return { status: "skipped", reason: "Missing file or larger than 2 MB" };
  const extension = extname(target);
  let command: string, args: string[], formatter: string;
  if (extension === ".py") {
    command =
      process.env.RUFF_BIN ??
      (existsSync("/opt/homebrew/bin/ruff")
        ? "/opt/homebrew/bin/ruff"
        : "ruff");
    args = ["format", "--isolated", target];
    formatter = "ruff";
  } else if (WEB.has(extension)) {
    command = process.execPath;
    args = [
      resolve(ROOT, "node_modules/prettier/bin/prettier.cjs"),
      "--write",
      "--no-config",
      "--ignore-path",
      "/dev/null",
      target,
    ];
    formatter = "prettier";
  } else return { status: "skipped", reason: "Unsupported file type" };
  const before = readFileSync(target);
  try {
    await execute(command, args, { cwd, timeout: 8000, maxBuffer: 65536 });
    return {
      status: before.equals(readFileSync(target)) ? "unchanged" : "formatted",
      formatter,
    };
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { killed?: boolean };
    return {
      status: "error",
      reason:
        e.code === "ENOENT"
          ? "Formatter not installed; install Ruff or set RUFF_BIN"
          : e.killed
            ? "Formatter exceeded 8 seconds"
            : "Formatter rejected the file; original syntax needs attention",
    };
  }
}
