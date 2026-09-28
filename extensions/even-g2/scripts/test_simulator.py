"""Headless simulator smoke test.

Boot sequence:
  1. `npm run dev` in one terminal
  2. `npm run sim:auto` (evenhub-simulator ... --automation-port 9898) in another
  3. `python scripts/test_simulator.py` (this file)

Asserts the QA basics: app boots, framebuffer has lit pixels,
and double-tap produces the system exit dialog.
Requires: pip install pillow
"""

import io
import json
import sys
import time
from urllib.request import Request, urlopen

from PIL import Image

BASE = "http://127.0.0.1:9898"
READY_MARKER = "[even-g2-example] ready"
TIMEOUT_S = 30


def get_json(path: str):
    with urlopen(f"{BASE}{path}") as r:
        return json.loads(r.read())


def get_png(path: str) -> Image.Image:
    with urlopen(f"{BASE}{path}") as r:
        return Image.open(io.BytesIO(r.read()))


def post_json(path: str, body: dict):
    req = Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req) as r:
        return r.read()


def wait_for_ready(timeout: float = TIMEOUT_S):
    deadline = time.time() + timeout
    since_id = 0
    while time.time() < deadline:
        data = get_json(f"/api/console?since_id={since_id}")
        for entry in data.get("entries", []):
            since_id = max(since_id, entry["id"])
            if READY_MARKER in entry.get("message", ""):
                return
        time.sleep(0.25)
    raise TimeoutError(f"App did not log {READY_MARKER!r} within {timeout}s")


def lit_pixel_count(img: Image.Image) -> int:
    # Simulator returns RGBA on purpose; both bg and fg are pure green,
    # so alpha > 0 is the lit-pixel test (not RGB deltas).
    assert img.mode == "RGBA", f"expected RGBA, got {img.mode}"
    return sum(1 for px in img.getdata() if px[3] > 0)


def main() -> int:
    ping = get_json("/api/ping")
    assert ping in ("pong", {"message": "pong"}), f"simulator not up: {ping}"
    wait_for_ready()

    boot = get_png("/api/screenshot/glasses")
    assert lit_pixel_count(boot) > 100, "framebuffer is blank after ready"

    post_json("/api/input", {"action": "double_click"})
    time.sleep(0.5)

    after = get_png("/api/screenshot/glasses")
    delta = abs(lit_pixel_count(after) - lit_pixel_count(boot))
    assert delta > 50, "framebuffer did not change after double_click - exit dialog missing?"

    print("OK - app booted, rendered, and produced an exit dialog on double-tap")
    return 0


if __name__ == "__main__":
    sys.exit(main())
