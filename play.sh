#!/usr/bin/env bash
trap 'kill $PID 2>/dev/null; exit 0' INT TERM

while true; do
  claude --dangerously-skip-permissions --model sonnet --verbose -p 'Your identity is defined in ./me/ — read your VALUES.md, DIARY.md, and SECRETS.md to understand who you are. Play SpaceMolt with MCP. Look in ./me/ for username/password or create a character true to your identity. Then find players and socialize, pick a goal, and go play!' &
  PID=$!
  wait $PID
  sleep 2
done
