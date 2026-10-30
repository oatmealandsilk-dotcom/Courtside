#!/bin/zsh
# run.sh NAME [wait-after-tap-s] [settle-s]: a fresh launch of the installed proof build, signed in to the demo (its player an
# admin), "Who can see you" answered ahead, then a recording of one tap of Up to hit on the Community card. Prints the timing
# rows (sim-log.txt) and where the video went ($VIDS, default ${TMPDIR:-/tmp}/courtside-sim-zoom/vids).
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
HERE=$(cd "$(dirname "$0")" && pwd)
V=${VIDS:-${TMPDIR:-/tmp}/courtside-sim-zoom/vids}; mkdir -p "$V"
xcrun simctl terminate "$SIM" co.courtside.app >/dev/null 2>&1
"$HERE/log.sh" clear; D=$(xcrun simctl get_app_container "$SIM" co.courtside.app data)/Documents; rm -f "$D/sim-cmd.txt"
xcrun simctl launch "$SIM" co.courtside.app >/dev/null; sleep 8
"$HERE/cmd.sh" signin; sleep 7; "$HERE/cmd.sh" mapvis; sleep ${3:-12}
xcrun simctl io "$SIM" recordVideo --codec=h264 --force "$V/$1.mp4" >/dev/null 2>&1 & REC=$!
sleep 1.5; "$HERE/cmd.sh" uth; sleep ${2:-5}
kill -INT $REC; wait $REC 2>/dev/null
"$HERE/log.sh"
echo "video $V/$1.mp4"
