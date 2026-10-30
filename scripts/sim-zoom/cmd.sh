#!/bin/zsh
# cmd.sh "action a=1&b=2" ...: commands for the demo build's sim driver (src/lib/simDriver.ts), read every 150 ms.
#   signin · mapvis · uth (tap the Community card's Up to hit) · back · go to=/path
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
D=$(xcrun simctl get_app_container "$SIM" co.courtside.app data)/Documents
mkdir -p "$D"
for c in "$@"; do print -r -- "$c" >> "$D/sim-cmd.txt"; done
