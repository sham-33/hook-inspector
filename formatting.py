"""Format only successful file edits, inside the session workspace."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = {
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
}


def format_event(payload):
    if (
        payload.get("demo")
        or payload.get("hook_event_name") != "PostToolUse"
        or payload.get("tool_name") not in {"Write", "Edit", "MultiEdit"}
    ):
        return None
    policy = json.loads((ROOT / "policy.json").read_text())
    if not policy.get("format_on_edit", False):
        return {"status": "disabled"}
    path = payload.get("tool_input", {}).get("file_path")
    if not path:
        return {"status": "skipped", "reason": "No file target"}
    cwd = Path(payload["cwd"]).resolve()
    target = (cwd / path).resolve()
    if cwd not in target.parents or any(
        target == (cwd / p).resolve() or (cwd / p).resolve() in target.parents
        for p in policy["protected_paths"]
    ):
        return {"status": "skipped", "reason": "Outside workspace or protected"}
    if not target.is_file() or target.stat().st_size > 2_000_000:
        return {"status": "skipped", "reason": "Missing file or larger than 2 MB"}
    if target.suffix == ".py":
        command = [str(ROOT / ".venv/bin/ruff"), "format", "--isolated", str(target)]
    elif target.suffix in WEB:
        command = [
            str(ROOT / "node_modules/.bin/prettier"),
            "--write",
            "--no-config",
            "--ignore-path",
            "/dev/null",
            str(target),
        ]
    else:
        return {"status": "skipped", "reason": "Unsupported file type"}
    before = target.read_bytes()
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, timeout=8)
        if result.returncode:
            return {
                "status": "error",
                "reason": "Formatter rejected the file; original syntax needs attention",
            }
        return {
            "status": "formatted" if target.read_bytes() != before else "unchanged",
            "formatter": Path(command[0]).name,
        }
    except FileNotFoundError:
        return {
            "status": "error",
            "reason": "Formatter not installed; run setup instructions",
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "reason": "Formatter exceeded 8 seconds"}
