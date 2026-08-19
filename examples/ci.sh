#!/usr/bin/env bash
# Example: CI/CD workflow using nostr-auth --json for scripting.
#
# Usage:
#   ./ci.sh "<challenge>" "https://site.example.com/verify" [domain]
#
# Shows how to parse machine-readable JSON output for automation.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHALLENGE="${1:-}"
CALLBACK="${2:-}"
DOMAIN="${3:-$(echo "$CALLBACK" | sed -E 's#https?://([^/:]+).*#\1#')}"

if [[ -z "$CHALLENGE" || -z "$CALLBACK" ]]; then
  echo "Usage: $0 \"<challenge>\" \"<callback-url>\" [domain]" >&2
  exit 2
fi

echo "== Signing challenge (dry-run inspection) =="

DRY_RUN=$(node "$SKILL_DIR/nostr_auth.js" nip07 --challenge "$CHALLENGE" \
  --domain "$DOMAIN" --callback "$CALLBACK" --dry-run --json)

echo "Domain:   $(echo "$DRY_RUN" | jq -r .domain)"
echo "Pubkey:   $(echo "$DRY_RUN" | jq -r .pubkey)"
echo "npub:     $(echo "$DRY_RUN" | jq -r .npub)"
echo "Event id: $(echo "$DRY_RUN" | jq -r .event.id)"

echo
echo "== Submitting login =="

RESPONSE=$(node "$SKILL_DIR/nostr_auth.js" nip07 --challenge "$CHALLENGE" \
  --domain "$DOMAIN" --callback "$CALLBACK" --json)
STATUS=$(echo "$RESPONSE" | jq -r '.response.status // "ERROR"')

echo "Login status: $STATUS"

if [ "$STATUS" = "OK" ]; then
  echo "Authentication successful!"
  exit 0
else
  REASON=$(echo "$RESPONSE" | jq -r '.response.reason // "unknown"')
  echo "Authentication failed: $REASON"
  exit 3
fi