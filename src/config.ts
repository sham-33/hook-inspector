import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Policy, Payload } from "./types.js";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PORT = Number(process.env.HOOK_INSPECTOR_PORT || 8765);
export const URL = `http://127.0.0.1:${PORT}`;
export const STATE = resolve(ROOT, ".runtime");
export const WRITERS = new Set(["Write", "Edit", "MultiEdit"]);
export function policy(): Policy {
  const p = JSON.parse(
    readFileSync(resolve(ROOT, "policy.json"), "utf8"),
  ) as Policy;
  if (
    !Array.isArray(p.protected_paths) ||
    !p.protected_paths.every((x) => typeof x === "string")
  )
    throw Error("Invalid protected_paths");
  return p;
}
export function canonical(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if (
      !["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code || "",
      )
    )
      throw error;
    const parent = dirname(absolute);
    return parent === absolute
      ? absolute
      : resolve(canonical(parent), basename(absolute));
  }
}
export function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (!rel.startsWith(".." + "/") && rel !== ".." && !isAbsolute(rel))
  );
}
export function protectedPath(cwd: string, target: string, p: Policy): boolean {
  return p.protected_paths.some((path) =>
    within(canonical(resolve(cwd, path)), target),
  );
}
export function validate(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected a JSON object");
  const p = value as Payload;
  for (const key of [
    "cwd",
    "session_id",
    "hook_event_name",
    "tool_name",
  ] as const)
    if (p[key] !== undefined && typeof p[key] !== "string")
      throw Error(`${key} must be a string`);
  if (
    p.tool_input !== undefined &&
    (!p.tool_input ||
      typeof p.tool_input !== "object" ||
      Array.isArray(p.tool_input))
  )
    throw Error("tool_input must be an object");
  if (
    p.tool_input?.file_path !== undefined &&
    typeof p.tool_input.file_path !== "string"
  )
    throw Error("file_path must be a string");
  return p;
}
export function isMain(url: string): boolean {
  return !!process.argv[1] && fileURLToPath(url) === resolve(process.argv[1]);
}
