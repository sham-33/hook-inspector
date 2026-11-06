"""Start one background receiver on demand, including concurrent hooks."""

import fcntl
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8765"
STATE = ROOT / ".runtime"


def healthy():
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=0.3) as response:
            return json.load(response).get("service") == "hook-inspector-v2"
    except Exception:
        return False


def ensure_server():
    if healthy():
        return
    STATE.mkdir(exist_ok=True, mode=0o700)
    with (STATE / "start.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if healthy():
            return
        with (STATE / "server.log").open("ab") as log:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / "server.py")],
                cwd=ROOT,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        for _ in range(40):
            if healthy():
                return
            if process.poll() is not None:
                break
            time.sleep(0.1)
        raise RuntimeError(
            "Receiver did not start; check .runtime/server.log (port 8765 may be occupied)"
        )


if __name__ == "__main__":
    ensure_server()
    print(URL)
