# Netsocket GNOME Shell extension

A GNOME Shell port of the Android app's non-notification features:

- **Dashboard link** — opens the netsocket host's web UI in your default browser.
- **Command palette** — a text chat window talking to your netsocket agent over
  the same encrypted device-pairing WebSocket protocol as the Android app and
  the desktop overlay. Voice is out of scope for this port.
- **Authenticator** — a searchable window of TOTP codes synced from the host,
  cached locally for offline use, click-to-copy.

Notification forwarding is intentionally **not** ported — GNOME Shell has no
equivalent of Android's "read all system notifications" capability, and it
was explicitly excluded from scope.

## Install (Fedora Linux 44 Workstation)

```bash
./install.sh
```

This copies the extension to
`~/.local/share/gnome-shell/extensions/netsocket@strayfade.com`, compiles the
GSettings schema, and enables it. Log out/in (Wayland) or `Alt+F2` → `r`
(X11) to load it if the panel icon doesn't appear immediately.

To remove it: `./install.sh --uninstall`.

After installing, open **Preferences** (right-click the panel icon, or
`gnome-extensions prefs netsocket@strayfade.com`) and set your host address.
The device will show as **pending** in the dashboard under
**Settings → Devices** until you approve it there — same flow as the mobile
app and desktop overlay.

## Architecture

```
extension.js        entry point: wires store + connection + panel indicator
prefs.js             Preferences window (Adw)
lib/
  store.js            GSettings + local state (device identity, pinned
                       server key, conversation id, OTP cache)
  connection.js        WebSocket client: deviceHello -> deviceChallenge ->
                        deviceAuth -> deviceStatus handshake, then encrypted
                        app traffic (command palette + OTP requests)
  crypto.js             Ed25519 identity / X25519 ECDH / HKDF-SHA256 /
                        AES-256-GCM helpers, wrapping vendor/nacl.js +
                        aesgcm.js
  aesgcm.js             AES-256-GCM (NIST SP 800-38D) built on the raw AES
                        block cipher in vendor/aes.js — GJS has no
                        WebCrypto binding, so this is implemented in pure JS
  totp.js               RFC 6238 TOTP + base32 decode, including the
                        server's short-secret zero-pad-to-16-bytes quirk
  slashCommands.js       Client-side-only /settings /otp /clear /? handling
ui/
  indicator.js           Panel button + dropdown menu
  commandPalette.js      Chat window (ModalDialog)
  otpWindow.js            Searchable OTP list (ModalDialog)
vendor/
  nacl.js                 tweetnacl-js (public domain), wrapped for GJS ESM
  aes.js                  Chris Veness's reference AES block cipher (MIT)
```

The protocol (handshake, message shapes, TOTP padding quirk) mirrors
`server/utils/deviceAuth.js`, `server/utils/deviceCrypto.js`, and
`server/utils/authenticator.js` in the repo root, and was cross-checked
against the existing Rust port in `extensions/overlay/src-tauri/src/`.

## Known limitations / things to verify on real hardware

This was built and reviewed without a GNOME Shell runtime available in the
development environment, so a few APIs are implemented to spec but not yet
exercised live:

- `GLib.Hmac.get_digest()`'s exact GJS return shape (used for HKDF and TOTP's
  HMAC-SHA1) — verify against a real GJS instance; if it returns something
  other than a byte array, `lib/crypto.js` and `lib/totp.js` need a one-line
  adjustment.
- `Soup.Session.websocket_connect_async`'s exact argument list can drift
  between libsoup3 minor versions — if `install.sh`'s target Fedora ships a
  libsoup3 with a different signature, `lib/connection.js`'s `_connect()`
  is the only place that needs updating.
- The AES-256-GCM implementation in `lib/aesgcm.js` is a from-scratch
  NIST SP 800-38D implementation (no vendored GCM library was available) —
  worth running against `tests/deviceAuth.test.js`-style vectors before
  relying on it for anything beyond local development.

If something doesn't handshake, the most useful debugging tool is
`journalctl -f /usr/bin/gnome-shell` while watching the extension try to
connect — all handshake errors are logged via `logError()`.
