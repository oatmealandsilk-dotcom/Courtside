#!/bin/zsh
# The check-in zoom's simulator proof (zoomV7): puts this checkout's app code, as a Release (Hermes) bundle, inside a copy
# of a Release simulator build of the app (its native code unchanged: build one per
# ~/Desktop/CourtSide-Onboarding/SIM-HOWTO.md), signs the copy for the simulator and installs it. About 30 s.
# The bundle is the demo build (no .env: made-up demo data) with the proof's switches on (simDriver):
#   EXPO_PUBLIC_SIM_DRIVER (commands from the Mac, sim-log.txt), EXPO_PUBLIC_SIM_ADMIN (the demo player an admin),
#   EXPO_PUBLIC_SIM_ZOOM (the zoom on for that admin; ZOOM_ON_PHONES stays off in the code).
# Env: SIM (simulator UDID), SRC_APP (the Release .app to copy), OUT (work folder), SIM_ZOOM=0 (the zoom left off).
set -e
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SRC=${SRC_APP:-/Users/william/Desktop/Courtside/.claude/worktrees/simbuild/ios/build/Build/Products/Release-iphonesimulator/CourtSide.app}
OUT=${OUT:-${TMPDIR:-/tmp}/courtside-sim-zoom}
APP=$OUT/CourtSide.app
if [ -e "$ROOT/.env" ]; then echo "STOP: $ROOT/.env exists (the live backend); the proof build is demo data only"; exit 1; fi
if [ "$(plutil -extract EXUpdatesEnabled raw "$SRC/Expo.plist" 2>/dev/null)" != "false" ]; then echo "STOP: over-the-air updates are on in $SRC"; exit 1; fi
mkdir -p "$OUT/js" "$OUT/metro-tmp"
rm -rf "$OUT/assets"; mkdir -p "$OUT/assets"
cd "$ROOT"
ENTRY=$(node -e "require('expo/scripts/resolveAppEntry')" "$ROOT" ios absolute | tail -n 1)
TMPDIR=$OUT/metro-tmp NODE_ENV=production EXPO_PUBLIC_SIM_DRIVER=1 EXPO_PUBLIC_SIM_ADMIN=1 EXPO_PUBLIC_SIM_ZOOM=${SIM_ZOOM:-1} \
  node "$(node --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")" export:embed \
  --entry-file "$ENTRY" --platform ios --dev false --minify false --reset-cache \
  --bundle-output "$OUT/js/main.js" --assets-dest "$OUT/assets" > "$OUT/bundle.log" 2>&1 || { tail -30 "$OUT/bundle.log"; exit 1; }
"$ROOT/node_modules/hermes-compiler/hermesc/osx-bin/hermesc" -emit-binary -max-diagnostic-width=80 -O -out "$OUT/js/main.jsbundle" "$OUT/js/main.js"
rm -rf "$APP"; cp -c -R "$SRC" "$APP"
cp "$OUT/js/main.jsbundle" "$APP/main.jsbundle"
rsync -a "$OUT/assets/" "$APP/"
codesign -d --entitlements :- "$SRC" > "$OUT/ent.plist" 2>/dev/null || true
if [ -s "$OUT/ent.plist" ]; then codesign --force --sign - --entitlements "$OUT/ent.plist" --timestamp=none "$APP" >/dev/null 2>&1; else codesign --force --sign - --timestamp=none "$APP" >/dev/null 2>&1; fi
xcrun simctl terminate "$SIM" co.courtside.app >/dev/null 2>&1 || true
xcrun simctl install "$SIM" "$APP"
echo "installed $APP $(date +%T)"
