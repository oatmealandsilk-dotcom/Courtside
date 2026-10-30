#!/bin/zsh
# demo.sh OUT.mp4: the owner's video of the check-in zoom (zoomV7) on the installed proof build: a fresh launch signed in to
# the demo (its player an admin), then one recording of the Community card at rest, a tap of Up to hit (the zoom), back to
# Community, Up to hit off and on again (a second zoom), and back. Prints the app's timing rows (one per zoom).
# Waits for the app itself (its commands read, the zoom layer drawn) rather than fixed times. Record on a Mac on its own
# charger: on battery saver or a small charger the map's frames stall (Oct 30: an 8 W charger at 7% battery).
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
OUTV=${1:?usage: demo.sh OUT.mp4}
xcrun simctl terminate "$SIM" co.courtside.app >/dev/null 2>&1
# The app's Documents folder, looked up once (the commands and the log go through it).
D=$(xcrun simctl get_app_container "$SIM" co.courtside.app data)/Documents
mkdir -p "$D"; rm -f "$D/sim-cmd.txt" "$D/sim-log.txt"
cmd() { print -r -- "$1" >> "$D/sim-cmd.txt"; }
seen() { grep -q "$1" "$D/sim-log.txt" 2>/dev/null; }
xcrun simctl launch "$SIM" co.courtside.app >/dev/null
cmd noop; for i in {1..60}; do seen '\[sim\] noop' && break; sleep 0.5; done
cmd signin; sleep 6; cmd mapvis
# The zoom layer drawn ahead (ZoomLayer logs it), then a moment more.
for i in {1..80}; do seen '\[v7\] layer ready' && break; sleep 0.5; done
sleep 3
xcrun simctl io "$SIM" recordVideo --codec=h264 --force "$OUTV" >/dev/null 2>&1 & REC=$!
sleep 2.5; cmd uth          # 1st zoom
sleep 5;   cmd back         # back to Community
sleep 3.5; cmd uth          # Up to hit off
sleep 3.5; cmd uth          # 2nd zoom
sleep 5;   cmd back         # back to Community
sleep 3
kill -INT $REC; wait $REC 2>/dev/null
grep -v "zoom-frames\|\[page " "$D/sim-log.txt" 2>/dev/null
