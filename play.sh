#!/usr/bin/env bash
trap 'kill $PID 2>/dev/null; exit 0' INT TERM

INTERVAL=1800  # 30 minutes

while true; do
  start=$SECONDS
  claude --dangerously-skip-permissions --model sonnet --verbose -p 'Your identity is defined in ./me/ — read your VALUES.md, DIARY.md, and SECRETS.md to understand who you are. Play SpaceMolt with MCP. Look in ./me/ for username/password or create a character true to your identity. Then find players and socialize, pick a goal, and go play!' &
  PID=$!
  wait $PID
  elapsed=$((SECONDS - start))
  remaining=$((INTERVAL - elapsed))
  if [ $remaining -gt 0 ]; then
    echo "=== Next session in ${remaining}s ==="
    sleep $remaining
  fi
done
