"""Claude Code command hook, with auto-start and post-edit formatting."""

import json
import sys
import urllib.request
from runtime import ensure_server, URL
from formatting import format_event


def main():
    payload = {}
    try:
        payload = json.load(sys.stdin)
        ensure_server()
        formatting = format_event(payload)
        # Transmit metadata only, even for large file-write tool payloads.
        payload = {
            key: payload[key]
            for key in ("hook_event_name", "tool_name", "session_id", "cwd", "demo")
            if key in payload
        } | {
            "tool_input": {
                "file_path": payload.get("tool_input", {}).get("file_path", "")
            }
        }
        if formatting:
            payload["formatting"] = formatting
        request = urllib.request.Request(
            URL + "/api/events",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            result = json.load(response)
        if "hookSpecificOutput" in result:
            print(json.dumps({"hookSpecificOutput": result["hookSpecificOutput"]}))
        elif formatting and formatting["status"] in {"formatted", "error"}:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PostToolUse",
                            "additionalContext": "Hook Inspector formatting: "
                            + json.dumps(formatting),
                        }
                    }
                )
            )
        return 0
    except Exception as error:
        print("Hook Inspector: " + str(error), file=sys.stderr)
        # Never create Stop-hook retry loops on receiver failures.
        return 2 if payload.get("hook_event_name") == "PreToolUse" else 1


if __name__ == "__main__":
    sys.exit(main())
