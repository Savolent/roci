#!/bin/bash
set -euo pipefail

# gather-context.sh — Collect game state via the sm CLI (no LLM tokens)
# Usage: bash gather-context.sh <credentials-file>
# Outputs a markdown briefing to stdout.

CRED_FILE="${1:?Usage: gather-context.sh <credentials-file>}"
SM="${SM:-sm}"

# Login (creates session, saves to /tmp/sm-session)
$SM login "$CRED_FILE" >&2

echo "# Session Briefing — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

echo "## Status"
$SM status
echo

echo "## Top Skills"
$SM skills
echo

echo "## Captain's Log (recent)"
$SM log --brief
echo

echo "## Nearby Players"
$SM nearby
