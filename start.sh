#!/usr/bin/env bash
# PIB Connect — desktop launcher.
#
# Brings up the Tauri desktop app the same way regardless of your shell setup.
# In dev mode (default) it starts the Rust shell + Vite dev server with HMR.
# Pass `--build` to produce a release binary instead.

set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-dev}"

# ── Sanity checks ─────────────────────────────────────────────
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[start.sh] missing required tool: $1" >&2
    echo "           install it before running this script." >&2
    exit 1
  fi
}

require node
require pnpm
require cargo
require rustc

# ── Dependencies ──────────────────────────────────────────────
# Only install if node_modules looks stale or missing — keeps cold-start fast.
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.pnpm-lock-fingerprint ] 2>/dev/null; then
  echo "[start.sh] installing JS deps with pnpm…"
  pnpm install
  # Touch a fingerprint so we skip on subsequent runs unless the lockfile changes.
  mkdir -p node_modules
  cp pnpm-lock.yaml node_modules/.pnpm-lock-fingerprint
fi

# ── Optional: point the dev proxy at a specific robot/test backend ────────
# `PIB_ROBOT_URL=http://localhost:5000 ./start.sh` will route /pib-api there.
if [ -n "${PIB_ROBOT_URL:-}" ]; then
  echo "[start.sh] routing /pib-api → $PIB_ROBOT_URL"
fi

# ── Run ───────────────────────────────────────────────────────
case "$MODE" in
  dev)
    echo "[start.sh] launching desktop app (dev)…"
    exec pnpm tauri dev
    ;;
  build|release)
    echo "[start.sh] building production desktop binary…"
    pnpm tauri build
    echo
    echo "[start.sh] done. Bundles are in src-tauri/target/release/bundle/"
    ;;
  preview-web)
    # Frontend-only, useful for quick UI iteration without rebuilding Rust.
    echo "[start.sh] launching browser-only preview (no native shell)…"
    exec pnpm dev
    ;;
  *)
    echo "Usage: ./start.sh [dev | build | preview-web]" >&2
    exit 2
    ;;
esac
