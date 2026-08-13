#!/usr/bin/env bash
#
# Installs the Netsocket GNOME Shell extension for the current user on
# Fedora Linux 44 Workstation.
#
# Usage:
#   ./install.sh            install (or update) and enable the extension
#   ./install.sh --uninstall  remove it
#
set -euo pipefail

UUID="netsocket@strayfade.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if [[ "${1:-}" == "--uninstall" ]]; then
    echo "Disabling and removing ${UUID}..."
    gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true
    rm -rf "${DEST_DIR}"
    echo "Removed ${DEST_DIR}"
    exit 0
fi

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This installer only supports Linux (Fedora Workstation with GNOME Shell)." >&2
    exit 1
fi

if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "gnome-shell was not found on PATH — this extension requires GNOME Shell." >&2
    exit 1
fi

# glib-compile-schemas is required to build the settings schema; it ships
# in glib2 on Fedora, present on any GNOME Workstation install, but make
# sure it's there (and pull libsecret for the device-key keyring backend).
MISSING_PKGS=()
command -v glib-compile-schemas >/dev/null 2>&1 || MISSING_PKGS+=("glib2")
rpm -q libsecret >/dev/null 2>&1 || MISSING_PKGS+=("libsecret")

if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
    echo "Installing missing dependencies: ${MISSING_PKGS[*]}"
    sudo dnf install -y "${MISSING_PKGS[@]}"
fi

echo "Installing ${UUID} to ${DEST_DIR}..."
rm -rf "${DEST_DIR}"
mkdir -p "${DEST_DIR}"

# Copy everything except this installer, git metadata, and dev-only files.
rsync -a \
    --exclude 'install.sh' \
    --exclude '.git*' \
    --exclude 'README.md' \
    "${SCRIPT_DIR}/" "${DEST_DIR}/"

echo "Compiling settings schema..."
glib-compile-schemas "${DEST_DIR}/schemas"

echo "Enabling extension..."
gnome-extensions enable "${UUID}" || {
    echo "Could not enable automatically (this is normal right after a fresh install)."
    echo "Log out and back in, then run: gnome-extensions enable ${UUID}"
}

cat <<EOF

Done. If the panel icon doesn't appear:
  - On Wayland, log out and log back in (Shell extensions load at session start).
  - On X11, press Alt+F2, type 'r', press Enter to restart GNOME Shell.

Configure your host address from the extension's Preferences (right-click
the panel icon, or: gnome-extensions prefs ${UUID}). The first connection
will show up as "pending" in your netsocket dashboard under
Settings -> Devices until you approve it there.
EOF
