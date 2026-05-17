#!/usr/bin/env bash
# Rebuild GumbyAI, wipe its sandbox on the booted simulator, install, launch.
#
# Usage:
#   ./scripts/run.sh                          # uses currently-booted simulator
#   ./scripts/run.sh <SIM_ID>                 # specific simulator UDID
#
# Auto-detects an installed iOS Simulator runtime so it works even when
# Xcode's default SDK version (e.g. 26.5) isn't installed.

set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE_ID="com.ishaan.gumby"
SIM_ID="${1:-}"

# --- pick a simulator ------------------------------------------------------

if [[ -z "$SIM_ID" ]]; then
  SIM_ID=$(xcrun simctl list devices booted | awk -F'[()]' '/Booted/ {print $2; exit}')
fi
if [[ -z "$SIM_ID" ]]; then
  echo "No booted simulator. Boot one in Simulator.app or pass a UDID." >&2
  exit 1
fi
echo "▸ simulator: $SIM_ID"

# --- pick an installed iOS runtime -----------------------------------------

# Newest installed iOS runtime (e.g. "iOS 26.0" → "26.0")
RUNTIME_OS=$(xcrun simctl list runtimes \
  | grep -E '^iOS ' \
  | grep -v 'unavailable' \
  | tail -1 \
  | sed -E 's/^iOS ([0-9.]+).*/\1/')
if [[ -z "$RUNTIME_OS" ]]; then
  echo "No iOS Simulator runtime installed. Install one via Xcode > Settings > Components." >&2
  exit 1
fi
echo "▸ runtime:   iOS $RUNTIME_OS"

DEVICE_NAME=$(xcrun simctl list devices "$RUNTIME_OS" \
  | awk -F'[()]' -v id="$SIM_ID" '$0 ~ id { gsub(/^ +| +$/,"",$1); print $1; exit }')
if [[ -z "$DEVICE_NAME" ]]; then
  # Fall back to first available device on that runtime
  DEVICE_NAME=$(xcrun simctl list devices "$RUNTIME_OS" \
    | awk -F'[()]' '/Booted|Shutdown/ { gsub(/^ +| +$/,"",$1); print $1; exit }')
fi
echo "▸ device:    $DEVICE_NAME"

# --- regenerate xcodeproj --------------------------------------------------

if command -v xcodegen >/dev/null 2>&1; then
  echo "▸ xcodegen…"
  xcodegen generate >/dev/null
fi

# --- ensure simulator booted -----------------------------------------------

xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -gj -a Simulator || true

# --- wipe old app sandbox (clears stale URLSession disk cache) -------------

echo "▸ uninstalling old app…"
xcrun simctl uninstall "$SIM_ID" "$BUNDLE_ID" 2>/dev/null || true

# --- build -----------------------------------------------------------------

DEST="platform=iOS Simulator,OS=$RUNTIME_OS,name=$DEVICE_NAME"
echo "▸ build: $DEST"

# NOTE: Sign in with Apple needs the `com.apple.developer.applesignin`
# entitlement embedded into the simulator binary. Disabling code signing
# strips entitlements, which makes ASAuthorizationController fail with the
# generic "AuthorizationError". Use Xcode's "Sign to Run Locally" identity
# (`-`) so the entitlements file is preserved on simulator builds without
# requiring a real Apple Developer cert / profile.
xcodebuild \
  -project GumbyAI.xcodeproj \
  -scheme GumbyAI \
  -configuration Debug \
  -destination "$DEST" \
  -derivedDataPath build \
  -sdk iphonesimulator \
  CODE_SIGN_IDENTITY=- \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build | sed -nE '/error:|warning:|\*\* BUILD/p' || true

# --- locate .app -----------------------------------------------------------

APP_PATH=$(find build/Build/Products/Debug-iphonesimulator -maxdepth 2 -name "GumbyAI.app" -print -quit 2>/dev/null || true)
if [[ -z "$APP_PATH" ]]; then
  echo "Build failed — no .app produced. Re-run with verbose output:" >&2
  echo "  xcodebuild -project GumbyAI.xcodeproj -scheme GumbyAI -configuration Debug \\" >&2
  echo "    -destination \"$DEST\" -derivedDataPath build -sdk iphonesimulator \\" >&2
  echo "    CODE_SIGNING_ALLOWED=NO build" >&2
  exit 1
fi

# --- install + launch ------------------------------------------------------

echo "▸ installing $APP_PATH"
xcrun simctl install "$SIM_ID" "$APP_PATH"
echo "▸ launching"
xcrun simctl launch "$SIM_ID" "$BUNDLE_ID"
echo "✓ done"
