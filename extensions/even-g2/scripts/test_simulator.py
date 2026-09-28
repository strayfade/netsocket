"""Headless simulator smoke test.

Boot sequence:
  1. `npm run dev` in one terminal
  2. `npm run sim:auto` (evenhub-simulator ... --automation-port 9898) in another
  3. `python scripts/test_simulator.py` (this file)

Asserts the QA basics: app boots, framebuffer has lit pixels, and
double-tap / long-press cycle through all three tabs (framebuffer
changes each time, looping back to status).
Requires: pip install pillow
"""

import io
import json
import sys
import time
from urllib.request import Request, urlopen

from PIL import Image

BASE = "http://127.0.0.1:9898"
READY_MARKER = "[netsocket-g2] ready"
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


def send_input(action: str, fallback: str | None = None):
    """POST a glasses input, retrying once with `fallback` on 400.

    Sim 0.9+ accepts long_press; older ones only know
    up/down/click/double_click, so long_press falls back to double_click
    (both cycle tabs in this app).
    """
    from urllib.error import HTTPError

    try:
        return post_json("/api/input", {"action": action})
    except HTTPError as e:
        if e.code == 400 and fallback:
            return post_json("/api/input", {"action": fallback})
        raise


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


def shot_bytes() -> bytes:
    with urlopen(f"{BASE}/api/screenshot/glasses") as r:
        return r.read()


def main() -> int:
    with urlopen(f"{BASE}/api/ping") as r:
        ping_raw = r.read().decode("utf-8", "replace").strip()
    try:
        ping = json.loads(ping_raw)
    except json.JSONDecodeError:
        ping = ping_raw  # older simulators answer plain-text `pong`
    assert ping in ("pong", {"message": "pong"}), f"simulator not up: {ping!r}"
    wait_for_ready()

    boot = get_png("/api/screenshot/glasses")
    assert lit_pixel_count(boot) > 100, "framebuffer is blank after ready"

    # Double-tap cycles status -> alerts -> aria -> status; each step redraws.
    prev = shot_bytes()
    for action in ("double_click", "double_click", "long_press"):
        send_input(action, fallback="double_click")
        time.sleep(0.5)
        current = shot_bytes()
        assert current != prev, f"framebuffer did not change after {action} - tab cycle missing?"
        prev = current

    print("OK - app booted, rendered, and cycled status->alerts->aria->status on double-tap/long-press")
    return 0


if __name__ == "__main__":
    sys.exit(main())
