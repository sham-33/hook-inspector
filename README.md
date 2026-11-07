# Hook Inspector

A TypeScript application for inspecting Claude Code hooks, protecting file paths, and formatting edits. Includes a local HTTP server, SQLite persistence, browser dashboard, CLI installer and hook adapter. All application and test code is TypeScript; HTML/CSS provide the dashboard's layout and styling.

## Setup (macOS / Linux)

Requires Node.js **22.13+** and npm. Python is not required. Install standalone [Ruff](https://docs.astral.sh/ruff/installation/) if you want Python-file formatting (`brew install ruff` on macOS, or set `RUFF_BIN` to an installed executable). Ruff is a Rust formatter invoked as an external tool. Prettier is installed through npm.

```sh
npm ci
npm run build
npm run hooks:install
npm start
```

Open http://127.0.0.1:8765. Start a new Claude Code session to load installed hooks. The installer merges six event hooks into `~/.claude/settings.json`, preserving other settings and creating a timestamped backup. Reinstalling is idempotent. To install for one project:

```sh
npm run hooks:install -- --settings /path/to/project/.claude/settings.json
```

Hooks use absolute paths to Node and the compiled adapter. Rebuild after changing TypeScript sources. Reinstall if you move the repository or replace your Node installation.

## Automatic startup

The adapter starts the receiver in the background if needed, including after a reboot. The loopback port acts as the atomic singleton lock: competing startup processes exit if another receiver binds first, and callers wait for a matching health response. Logs are in `.runtime/server.log`. No login daemon is installed.

`npm start` also starts the background receiver. To run in the foreground, use `node dist/src/server.js`. Port 8765 must be available; `HOOK_INSPECTOR_PORT` overrides it for both server and adapter. A receiver failure blocks PreToolUse; errors in observational hooks do not create Stop retry loops.

## Dashboard and hooks

- Live SessionStart, PreToolUse, PostToolUse, PostToolUseFailure, Stop and SessionEnd events.
- Search by path, tool or session, filter decisions, inspect details and export the latest 1,000 events.
- Labeled demo events do not edit files.
- **Clear demo data** appears beside Run demo sequence when demo records exist. It deletes only demo events, updates the dashboard, and hides when none remain.
- Protected Write/Edit/MultiEdit targets default to `.env`, `.git` and `secrets`.
- Automatic formatting after successful edits: Ruff for Python; Prettier for JS/TS, JSON, CSS/SCSS, HTML, Markdown and YAML.

Formatting outcomes appear in event details and are returned to Claude. Formatter project configuration loading is disabled. Protected/outside-workspace files, unsupported extensions, missing files and files over 2 MB are skipped. Formatter failures are reported; commands have an eight-second timeout. Missing Ruff affects only Python formatting.

Edit `policy.json` to change `protected_paths` or disable `format_on_edit`. Changes apply to subsequent events. Paths are relative to the session working directory; absolute paths, traversal and symlinks are normalized.

## Uninstall hooks

```sh
npm run hooks:uninstall
```

Only this installation's hooks are removed. Other settings and event history are preserved. Restart existing Claude Code sessions if necessary.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Strict TypeScript checks cover both browser and server code. The 19 Node test-runner tests cover policy, symlinks, malformed payloads, privacy, legacy SQLite data, formatting, settings migration, HTTP endpoints, cross-origin/body limits, and a subprocess hook invocation. CI runs on Node 22 and 24 on macOS and Linux, installing Ruff to test Python formatting too.

## Source layout

- `src/types.ts`: shared payload, event and policy types
- `src/config.ts`: configuration, runtime validation and path handling
- `src/store.ts`: SQLite persistence and policy decisions
- `src/server.ts`: local HTTP API and static assets
- `src/client.ts`: browser dashboard logic
- `src/hook.ts`: Claude Code adapter, metadata transport and formatting
- `src/formatting.ts`: formatter invocation
- `src/runtime.ts`: health checks and automatic startup
- `src/manage.ts`: reversible settings installer and start CLI
- `tests/inspector.test.ts`: regression and integration tests
- `static/index.html`: dashboard HTML/CSS
- `dist/`: generated JavaScript, ignored by Git

## Migration from Python

The existing `events.sqlite3` schema is unchanged, including event IDs. No data conversion is needed. The installer recognizes and replaces this repository's old `hook.py` entries. Stop an old Python receiver before starting the TypeScript server. Legacy `.venv` and `__pycache__` directories are unused and ignored; they are not needed by this version.

## Boundaries

This is a trusted single-user local tool, not an OS sandbox. Shell commands and alternate tool schemas are observed but not restricted. `allowed` means the inspector did not deny an event; it does not assert that other permission checks passed or the tool succeeded. Keep the agent's normal permission controls enabled.

The receiver binds to 127.0.0.1 and rejects cross-origin browser POSTs. Local processes may submit events; do not expose it publicly. The adapter sends selected metadata, never file contents, prompts, transcripts or shell commands. Paths and session IDs are stored in the Git-ignored SQLite database. `HOOK_INSPECTOR_DB` can select a separate database for isolated testing.
