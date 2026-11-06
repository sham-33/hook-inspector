# Hook Inspector

A dependency-free local dashboard for AI coding-agent hooks. Inspect events, search by session or path, export JSON, and deny protected file edits.

## Run

Requires Python 3.10+:

```sh
python3 server.py
```

Open http://127.0.0.1:8765. Click **Run demo sequence** for six labeled sample events, including a blocked `.env` write. Events persist in local SQLite; only metadata is stored, not tool contents or command text. The dashboard displays the latest 1,000 events.

## Connect Claude Code

Merge the entries from `claude-hooks.example.json` into your project's `.claude/settings.json`. Update the absolute hook script path if you move this repository. This project does not modify your agent configuration automatically. Start the receiver before using the hooks.

The adapter forwards events over loopback and returns Claude Code's `PreToolUse` denial response. Receiver failure exits with code 2, blocking a pre-tool action. Post-tool failures cannot undo an action.

## Policy

Edit `policy.json` to change protected paths. Paths are relative to each event's working directory; absolute paths, parent traversal and symlinks are normalized. Write, Edit and MultiEdit file targets are checked. Read calls and post-action events are observed only. Shell commands and alternate tool schemas are not covered: this is a hook inspector, not an OS sandbox. Keep your agent's own permission controls enabled.

The receiver binds to 127.0.0.1 and rejects cross-origin browser POSTs. It is intended for a single trusted local user; local processes can submit events. File paths and session IDs are stored locally. Never expose the port publicly.

## Tests

```sh
python3 -m unittest discover -s tests -v
```

## Structure

- `server.py`: HTTP receiver, SQLite persistence, path policy
- `hook.py`: command-hook adapter using stdin/stdout
- `static/index.html`: responsive live dashboard
- `policy.json`: editable protected paths
- `tests/`: policy and privacy regression tests

## Next steps

Add opt-in language formatters, session comparison, and configurable retention. Automatic formatting is not enabled in this first version.
