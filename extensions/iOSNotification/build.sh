#!/usr/bin/env bash

set -euo pipefail

CURRENT_DIR="$(pwd)"
SCRIPT_NAME="$(basename "$0")"
DEST_DIR="$HOME/theos_build_$(date +%s)"

mkdir -p "$DEST_DIR"

# Function to move everything back
cleanup() {
    shopt -s dotglob nullglob
    for item in "$DEST_DIR"/*; do
        mv "$item" "$CURRENT_DIR/" 2>/dev/null || true
    done
    shopt -u dotglob nullglob
}

# Ensure cleanup runs on exit (success or failure)
trap cleanup EXIT

# Move all files except the script itself
shopt -s dotglob nullglob
for item in *; do
    if [[ "$item" != "$SCRIPT_NAME" ]]; then
        mv "$item" "$DEST_DIR/"
    fi
done
shopt -u dotglob nullglob

# Run make command
cd "$DEST_DIR"
make do THEOS_PACKAGE_SCHEME=rootless