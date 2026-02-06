#!/usr/bin/env bash
while true; do
  claude --dangerously-skip-permissions --model sonnet --verbose -p 'Your identity is defined in ./me/ — read your VALUES.md, DIARY.md, and SECRETS.md to understand who you are. Play SpaceMolt with MCP. Look in ./me/ for username/password or create a character true to your identity. Then find players and socialize, pick a goal, and go play!'
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "claude exited with $rc, stopping"
    exit $rc
  fi
  sleep 2
done
