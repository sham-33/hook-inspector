import json
import tempfile
import unittest
from pathlib import Path
from formatting import format_event
from manage import configure


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def event(self, path):
        return {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "cwd": str(self.root),
            "tool_input": {"file_path": str(path)},
        }

    def test_formats_python(self):
        p = self.root / "a.py"
        p.write_text('x= {"a":1}\n')
        self.assertEqual(format_event(self.event(p))["status"], "formatted")
        compile(p.read_text(), str(p), "exec")
        self.assertEqual(format_event(self.event(p))["status"], "unchanged")

    def test_formats_web(self):
        p = self.root / "a.json"
        p.write_text('{"a":1}')
        self.assertEqual(format_event(self.event(p))["status"], "formatted")
        self.assertEqual(json.loads(p.read_text()), {"a": 1})

    def test_does_not_format_demo_protected_or_outside(self):
        p = self.root / ".env"
        p.write_text("A=1")
        self.assertEqual(format_event(self.event(p))["status"], "skipped")
        event = self.event(p)
        event["demo"] = True
        self.assertIsNone(format_event(event))
        self.assertEqual(
            format_event(self.event(self.root.parent / "outside.json"))["status"],
            "skipped",
        )

    def test_invalid_file_preserved(self):
        p = self.root / "broken.json"
        p.write_text("{broken")
        self.assertEqual(format_event(self.event(p))["status"], "error")
        self.assertEqual(p.read_text(), "{broken")

    def test_installer_idempotent_preserves_other_settings(self):
        settings = self.root / "settings.json"
        other = {
            "permissions": {"allow": ["Read"]},
            "hooks": {
                "Stop": [{"hooks": [{"type": "command", "command": "echo existing"}]}]
            },
        }
        settings.write_text(json.dumps(other))
        configure(settings, True)
        once = json.loads(settings.read_text())
        configure(settings, True)
        self.assertEqual(once, json.loads(settings.read_text()))
        configure(settings, False)
        self.assertEqual(other, json.loads(settings.read_text()))
        self.assertEqual(len(list(self.root.glob("*backup*"))), 3)
