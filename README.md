# nostr-auth-agents

**Nostr sign-in for LLM coding agents** — auth-only, no wallet, no browser
extension, no relay account.

An agent (Claude Code, OpenCode, OpenClaw, Codex, Cursor, ...) is handed a
"Sign in with Nostr" challenge or event template. This repo signs it with a
secp256k1 (BIP-340 schnorr) key derived from a local master secret, and
optionally submits the signature to the service callback.

Zero npm runtime dependencies: pure BigInt secp256k1/schnorr + `node:crypto`.
Boots from a clean clone.

## Methods

| Method | Status | Notes |
|---|---|---|
| **NIP-07** sign-in (challenge event signing) | ✅ v1.0.0 | Mirrors the LNURL-auth UX |
| NIP-98 HTTP Auth (`Authorization: Nostr <event>`) | 🔜 planned | next |
| NIP-42 relay AUTH (websocket) | 🔜 planned | |
| NIP-05 identifier resolution | 🔜 planned | |

## Usage

```bash
# Sign a classic kind-22242 sign-in challenge and submit it
node nostr_auth.js nip07 --challenge "<hex>" \
  --relay "wss://relay.example.com" \
  --domain example.com \
  --callback "https://site.example.com/verify"

# Dry-run: sign but don't submit (inspect first)
node nostr_auth.js nip07 --challenge "<hex>" --dry-run --json

# Sign an arbitrary event template (what window.nostr.signEvent would do)
node nostr_auth.js nip07 '{"kind":22242,"tags":[["challenge","<hex>"]],"content":""}'

# Print the derived identity (hex pubkey + npub)
node nostr_auth.js nip07 pubkey --domain example.com
```

Progress logs go to **stderr**; results (JSON) go to **stdout**. Exit codes:
`0` accepted, `1` client error, `2` usage, `3` server `ERROR`, `4` non-JSON
callback response.

## Key management

- First run generates a 32-byte master secret at
  `~/.config/nostr-auth/master.key` (mode `0600`).
- Per-service identity: `linkingPriv = HMAC-SHA256(master, serviceDomain)`.
  Same domain → same npub; different domains → different npubs (privacy).
- `--single-key` shares one identity across all services.
- `--generate` overwrites the master secret. Override path with
  `--keyfile`/`--keyout` or the `NOSTR_AUTH_KEYFILE` env var.

## Protocol (NIP-07 style)

1. Challenge → event (kind `22242` by default) with `challenge` and optional
   `relay` tags.
2. NIP-01 id: `sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))`.
3. BIP-340 schnorr sign the raw 32-byte id → 64-byte hex `sig`.
4. POST `{"event": {...}}` to the callback → `{"status":"OK"}` /
   `{"status":"ERROR","reason":"..."}`.

See [SKILL.md](SKILL.md) for the full agent-facing docs.

## MCP server

Zero-dependency stdio MCP server (`mcp/server.js`) exposing
`nostr_nip07_sign` / `nostr_nip07_pubkey` tools:

```json
{
  "mcpServers": {
    "nostr-auth": { "command": "node", "args": ["mcp/server.js"] }
  }
}
```

Plugin manifests for Claude Code (`.claude-plugin/`), Codex, Cursor, and
skills.sh discoverability (`skills.sh.json`) are included. See
[PUBLISHING.md](PUBLISHING.md) for distribution status per platform.

## Install as an agent skill (per platform)

- **Claude Code / any MCP client**: drop the repo in your skills dir, use
  `SKILL.md` + `.mcp.json`.
- **OpenClaw / ClawHub**: `skills/nostr-auth/` is an autonomous bundle
  (`SKILL.md` + `scripts/nostr_auth.js`, zero npm deps).
- **skills.sh (Vercel)**: `npx skills add dyegolara/nostr-auth-agents`
- **npm**: `npm i -g nostr-auth` → `nostr-auth nip07 ...`

## Self-test (offline, cost-free)

```bash
npm ci
npm test
```

A local mock "Sign in with Nostr" service (`mock_server.js`) validates the
challenge → sign → submit → verify roundtrip, replay rejection, dry-run
safety, per-domain identity stability, and the portable skill bundle.

## Project layout

```
nostr_auth.js        CLI (bin "nostr-auth")
lib/                 key mgmt, BIP-340 schnorr, NIP-01 events, NIP-07 flow
mcp/server.js        zero-dep MCP server (stdio)
mock_server.js       local sign-in mock for tests
skills/nostr-auth/   portable OpenClaw/ClawHub skill bundle
contrib/anthropics/  educational skill variant for anthropics/skills
test/                vitest suite
```

## License

MIT — see [LICENSE](LICENSE). Auth-only: this project never holds funds,
never publishes notes, and never connects to a relay on its own.