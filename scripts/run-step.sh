#!/bin/bash
set -euo pipefail

# run-step.sh <player-name> [extra claude flags...]
#
# In-container runner script that invokes Claude with --add-dir isolation.
# Receives prompt on stdin.
#
# CWD is set to /work/players/<name> so Claude's default scope is the
# player's own directory. --add-dir grants access to shared resources
# and the sm CLI.

PLAYER_NAME="${1:?Usage: run-step.sh <player-name> [claude flags...]}"
shift

PLAYER_DIR="/work/players/${PLAYER_NAME}"
if [ ! -d "$PLAYER_DIR" ]; then
  echo "ERROR: Player directory $PLAYER_DIR does not exist" >&2
  exit 1
fi

cd "$PLAYER_DIR"

exec claude -p \
  --add-dir /work/shared \
  --add-dir /work/sm \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  "$@"
