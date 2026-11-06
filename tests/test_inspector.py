import unittest, tempfile, json
from pathlib import Path
import server


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = server.DB
        server.DB = Path(self.temp.name) / "test.db"

    def tearDown(self):
        server.DB = self.old
        self.temp.cleanup()

    def event(self, path, tool="Write", event="PreToolUse"):
        return server.inspect_event(
            {
                "cwd": self.temp.name,
                "hook_event_name": event,
                "tool_name": tool,
                "tool_input": {"file_path": path},
            }
        )

    def test_protected(self):
        for p in [
            ".env",
            "secrets/key",
            "src/../.env",
            str(Path(self.temp.name) / ".git/config"),
        ]:
            self.assertEqual(
                self.event(p)["hookSpecificOutput"]["permissionDecision"], "deny"
            )

    def test_allowed(self):
        for p in ["src/main.py", ".env.example", "secrets-other/key"]:
            self.assertNotIn("hookSpecificOutput", self.event(p))

    def test_symlink(self):
        (Path(self.temp.name) / "alias").symlink_to(Path(self.temp.name) / ".env")
        self.assertIn("hookSpecificOutput", self.event("alias"))

    def test_read_and_post_do_not_block(self):
        self.assertNotIn("hookSpecificOutput", self.event(".env", "Read"))
        self.assertNotIn("hookSpecificOutput", self.event(".env", event="PostToolUse"))

    def test_payload_not_saved(self):
        server.inspect_event({"tool_input": {"content": "SECRET"}})
        with server.connect() as db:
            self.assertNotIn(
                "SECRET", db.execute("SELECT data FROM events").fetchone()[0]
            )

    def test_invalid(self):
        with self.assertRaises(ValueError):
            server.inspect_event([])
        with self.assertRaises(ValueError):
            server.inspect_event({"tool_input": []})


if __name__ == "__main__":
    unittest.main()
