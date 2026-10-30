#!/bin/zsh
# log.sh [clear]: the demo build's sim-log.txt (timing rows, [zoom-timing] ...), or empties it.
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SIM=${SIM:-EE1A9E7A-3BE6-4F85-A2EA-D7D9429B9D50}
F=$(xcrun simctl get_app_container "$SIM" co.courtside.app data)/Documents/sim-log.txt
if [ "$1" = clear ]; then rm -f "$F"; else cat "$F" 2>/dev/null; fi
