"""Install/uninstall only Hook Inspector entries; preserve all other settings."""

import argparse
import json
import shlex
import shutil
import sys
import time
from pathlib import Path
from runtime import ROOT, ensure_server, URL

EVENTS = [
    "SessionStart",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SessionEnd",
]


def configure(settings, install):
    data = json.loads(settings.read_text()) if settings.exists() else {}
    hooks = data.setdefault("hooks", {})
    for event in list(hooks):
        groups = []
        for group in hooks[event]:
            kept = [
                h
                for h in group.get("hooks", [])
                if str(ROOT / "hook.py") not in h.get("command", "")
            ]
            if kept:
                groups.append(dict(group, hooks=kept))
        if groups:
            hooks[event] = groups
        else:
            del hooks[event]
    if install:
        if data.get("disableAllHooks"):
            raise ValueError(
                "Hooks are disabled in settings; enable them before installing"
            )
        command = shlex.join([sys.executable, str(ROOT / "hook.py")])
        for event in EVENTS:
            hooks.setdefault(event, []).append(
                {"hooks": [{"type": "command", "command": command, "timeout": 20}]}
            )
    settings.parent.mkdir(parents=True, exist_ok=True)
    if settings.exists():
        backup = settings.with_name(
            settings.name + ".hook-inspector-backup-" + str(time.time_ns())
        )
        shutil.copy2(settings, backup)
    temporary = settings.with_name(settings.name + ".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(settings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "install", "uninstall"])
    parser.add_argument(
        "--settings", type=Path, default=Path.home() / ".claude/settings.json"
    )
    args = parser.parse_args()
    if args.action == "start":
        ensure_server()
        print(URL)
    else:
        configure(args.settings, args.action == "install")
        print(args.action + " complete: " + str(args.settings))
