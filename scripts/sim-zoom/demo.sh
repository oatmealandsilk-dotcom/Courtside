#!/bin/zsh
# demo.sh OUT.mp4: the owner's video of the check-in zoom (zoomV7) on the installed proof build: a fresh launch signed in to
# the demo (its player an admin), then one recording of the Community card at rest, a tap of Up to hit (the zoom), back to
# Community, Up to hit off and on again (a second zoom), and back. Prints the app's timing rows (one per zoom).
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
OUTV=${1:?usage: demo.sh OUT.mp4}
xcrun simctl terminate "$SIM" co.courtside.app >/dev/null 2>&1
# The app's Documents folder, looked up once (the commands and the log go through it).
D=$(xcrun simctl get_app_container "$SIM" co.courtside.app data)/Documents
mkdir -p "$D"; rm -f "$D/sim-cmd.txt" "$D/sim-log.txt"
cmd() { print -r -- "$1" >> "$D/sim-cmd.txt"; }
xcrun simctl launch "$SIM" co.courtside.app >/dev/null; sleep 8
cmd signin; sleep 7; cmd mapvis; sleep 14
xcrun simctl io "$SIM" recordVideo --codec=h264 --force "$OUTV" >/dev/null 2>&1 & REC=$!
sleep 2.5; cmd uth          # 1st zoom
sleep 5;   cmd back         # back to Community
sleep 3.5; cmd uth          # Up to hit off
sleep 3.5; cmd uth          # 2nd zoom
sleep 5;   cmd back         # back to Community
sleep 3
kill -INT $REC; wait $REC 2>/dev/null
cat "$D/sim-log.txt" 2>/dev/null
