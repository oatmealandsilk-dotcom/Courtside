#!/bin/zsh
# mapopen-run.sh DIR [MODE ...]: the full map's opening, measured (mapOpenSmooth, Nov 2). A fresh launch of the installed
# demo build (relbundle.sh), signed in, then one opening per MODE (default five), each by a REAL tap on the Community card
# (simtap.m, built here on first use) and recorded on its own: DIR/openN.mp4, DIR/recN.txt (the recorder's own "Recording
# started" wall clock), DIR/taps.txt (each touch-down's wall clock), DIR/modes.txt, DIR/sim-log.txt (the "[map-open] row"s).
# MODE: 1 / 0 / auto ("mapsmooth on=MODE" first: the new way, the old way, as the switch says), or - (nothing sent: a build
# without mapsmooth, e.g. main). Then: python3 scripts/sim-zoom/mapopen-video.py DIR. Check `uptime` first: other heavy
# work on the Mac shows up as slow opens.
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
HERE=$(cd "$(dirname "$0")" && pwd)
V=${1:?usage: mapopen-run.sh DIR [MODE ...]}; shift
(( $# )) || set -- - - - - -
mkdir -p "$V"; rm -f "$V"/*(N)
TAP=${SIMTAP:-$(dirname "$V")/simtap}
[ -x "$TAP" ] || clang -fobjc-arc -framework Foundation -framework CoreGraphics -o "$TAP" "$HERE/simtap.m" || exit 1
xcrun simctl terminate $SIM co.courtside.app >/dev/null 2>&1
D=$(xcrun simctl get_app_container $SIM co.courtside.app data)/Documents; mkdir -p "$D"
rm -f "$D/sim-cmd.txt" "$D/sim-log.txt"
seen() { grep -q "$1" "$D/sim-log.txt" 2>/dev/null; }
xcrun simctl launch $SIM co.courtside.app >/dev/null
"$HERE/cmd.sh" noop; for i in {1..60}; do seen '\[sim\] noop' && break; sleep 0.5; done
"$HERE/cmd.sh" signin; sleep 7; "$HERE/cmd.sh" mapvis
for i in {1..80}; do seen '\[v7\] layer ready' && break; sleep 0.5; done
sleep 4
n=0
for m in "$@"; do
  n=$((n+1))
  [ "$m" != "-" ] && { "$HERE/cmd.sh" "mapsmooth on=$m"; sleep 0.6; }
  echo "open$n mode=$m" >> "$V/modes.txt"
  ( xcrun simctl io $SIM recordVideo --codec=h264 --force "$V/open$n.mp4" 2>&1 | perl -MTime::HiRes=time -ne 'printf("%.3f %s", time(), $_)' >> "$V/rec$n.txt" ) & REC=$!
  sleep 1.5
  # The Community card's map, away from Up to hit and the city's name (iPhone 18 Pro, 402x874 points).
  "$TAP" $SIM ${TAPX:-131} ${TAPY:-546} 60 | sed "s/^/open$n /" >> "$V/taps.txt"
  sleep 5
  pkill -INT -f "recordVideo --codec=h264 --force $V/open$n.mp4"; wait $REC 2>/dev/null
  "$HERE/cmd.sh" back; sleep 3.5
done
cp "$D/sim-log.txt" "$V/sim-log.txt"
grep "map-open\] row" "$V/sim-log.txt"
