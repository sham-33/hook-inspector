# Hook Inspector

A local dashboard for Claude Code hooks: inspect agent activity, deny protected file edits, and automatically format successful edits. Events persist in SQLite. No model API key is needed by the inspector.

## Setup (macOS / Linux)

Requires Python 3.10+, Node.js, npm, and Claude Code for live integration.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci
python3 manage.py install
python3 manage.py start
```

Open http://127.0.0.1:8765. Start a new Claude Code session to load the hooks. The installer merges six event hooks into `~/.claude/settings.json`, preserving other settings and creating a timestamped backup. Running it again does not duplicate entries. To install only for one project, supply `--settings /path/to/project/.claude/settings.json`.

The hooks automatically start the receiver in the background if it is down, including after a reboot. A file lock prevents simultaneous hooks from starting duplicate servers. No login daemon is required. Logs are in `.runtime/server.log`. You can also open the dashboard server with `npm start` or run `python3 server.py` in the foreground. Port 8765 must be available; the hook adapter uses that port.

## What you can do

- Watch SessionStart, PreToolUse, PostToolUse, PostToolUseFailure, Stop and SessionEnd events.
- Search by path, tool or session; filter allowed/blocked decisions; inspect event metadata.
- Export the latest 1,000 events to JSON.
- Run a clearly labeled demo sequence without editing real files.
- Deny Write/Edit/MultiEdit calls targeting `.env`, `.git` or `secrets` by default.
- Automatically format successful edits with Ruff (Python) and Prettier (JS/TS, JSON, CSS/SCSS, HTML, Markdown and YAML).

Formatting results appear in event details and are communicated back to Claude. Formatters use default settings, with project configuration loading disabled. Files outside the session working directory, protected paths, unsupported extensions, files over 2 MB and demo events are skipped. Syntax errors are reported without intentionally overwriting invalid content. Each formatter has an eight-second timeout.

Edit `policy.json` to adjust `protected_paths` or set `format_on_edit` to false. Changes apply to subsequent events without restarting. Paths are relative to the agent's working directory, with absolute paths, traversal and symlinks normalized.

## Remove the integration

```sh
python3 manage.py uninstall
```

This removes only this installation's hooks, preserving other settings. Existing Claude Code sessions may need restarting. The local receiver can remain running; uninstalling does not erase your event history.

## Tests

```sh
python3 -m unittest discover -s tests -v
```

Eleven tests cover policy enforcement, traversal/symlinks, metadata privacy, Python/web formatting, invalid-file handling and reversible/idempotent settings installation. GitHub Actions runs the suite on Linux and macOS.

A real Claude Code smoke test also verified that an ordinary JSON Write was formatted and a `.env` Write was denied. Browser verification covered live events, searching, filtering, details and JSON download.

## Boundaries

This is a single-user local tool, not an OS sandbox. Shell commands and alternate tool schemas are observed but not restricted. An `allowed` status means this inspector did not deny an event, not that every agent permission check passed or that a tool succeeded. The agent's own permissions remain responsible for other controls.

The receiver binds to 127.0.0.1 and rejects cross-origin browser POSTs. Trusted local processes can submit events, so do not expose the port publicly. Hooks transmit only selected metadata, not file contents, prompts, transcripts or shell commands. Paths and session IDs remain local in `events.sqlite3`, which is ignored by Git. A receiver failure blocks PreToolUse; observational hook failures do not create Stop retry loops.

## Files

- `server.py`: HTTP receiver, policy and SQLite persistence
- `hook.py`: Claude Code adapter and metadata-only transport
- `formatting.py`: post-edit formatting
- `runtime.py`: background startup and health checks
- `manage.py`: install, uninstall and start commands
- `static/index.html`: dashboard
- `policy.json`: editable policy
