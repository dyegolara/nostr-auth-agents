---
name: nostr-auth
description: "Nostr sign-in (NIP-07) for LLM coding agents (Claude Code, OpenCode, OpenClaw, Codex, Cursor, ...). Auth-only: signs sign-in challenge events with a secp256k1 (BIP-340) key derived from a local master secret and submits them to the service callback. No wallet, no extension, no relay account. Use whenever a site or API asks for a signed Nostr event or a Sign in with Nostr challenge. More methods coming soon: NIP-98, NIP-42, NIP-05."
version: 1.0.0
homepage: https://github.com/dyegolara/nostr-auth-agents
metadata:
  author: dyegolara
  tags: [nostr, nip-07, auth, login, secp256k1, schnorr, signin]
  openclaw:
    requires:
      bins: [node]
    envVars:
      - name: NOSTR_AUTH_KEYFILE
        required: false
        description: Optional path for the persistent 32-byte master secret.
---

# nostr-auth (NIP-07)

Authenticate to a service using **Nostr sign-in** entirely client-side.
This is **auth-only**: the service hands you a challenge (string or event
template), you sign a kind-22242 AUTH event with a secp256k1 (BIP-340) key
and return the signature. No wallet, no browser extension, no publishing.

## When to use

- A site shows "Sign in with Nostr" / asks `window.nostr.signEvent(...)`.
- An API hands you a challenge string or event template to sign.
- You must NOT publish a real note to a relay; signing is local.

## Command

Run with Node (zero npm dependencies). The script lives at:

```
<skill_dir>/nostr_auth.js
```

```bash
# Sign a challenge (classic kind-22242 sign-in event):
node <skill_dir>/nostr_auth.js nip07 --challenge "<hex>" --domain example.com --callback https://example.com/verify

# Sign an arbitrary NIP-07-style event template:
node <skill_dir>/nostr_auth.js nip07 '{"kind":22242,"tags":[["challenge","<hex>"]],"content":""}'

# Print the identity a service would see:
node <skill_dir>/nostr_auth.js nip07 pubkey --domain example.com
```

## Options

| Option | Description |
|---|---|
| `--event <json>` | Event template JSON (`kind`, `tags`, `content`) |
| `--challenge <str>` | Sign-in challenge; builds a kind-22242 AUTH event |
| `--relay <url>` | Relay tag for the event / domain hint |
| `--domain <d>` | Service domain for key derivation |
| `--callback <url>` | POST the signed event (`{"event":...}`) and print the verdict |
| `--dry-run` | Sign but do **not** submit |
| `--json` | Machine-readable JSON output |
| `--key <hex>` | 64-char hex private key as master secret |
| `--keyfile <path>` | Keyfile (default `~/.config/nostr-auth/master.key`) |
| `--keyout <path>` | Where to persist a freshly generated master secret |
| `--generate` | Force a new master secret, **overwriting** the keyfile |
| `--single-key` | One global identity for all services (no per-domain derivation) |
| `-v`, `-q`, `-h`, `--version` | Verbose, quiet, help, version |

## Key management (default, privacy-preserving)

- On first use a 32-byte **master secret** is generated at
  `~/.config/nostr-auth/master.key` (mode `0600`).
- Per service, `linkingPriv = HMAC-SHA256(master, serviceDomain)`.
- Same service → same identity (returning user). Different services →
  different identities (no cross-service correlation).
- `--single-key` shares one identity everywhere (less private).

## Protocol flow

1. Service provides a challenge or event template (kind 22242 by default).
2. Event id: `sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))`.
3. Sign the raw 32-byte id with BIP-340 schnorr (secp256k1); `event.sig` hex.
4. POST `{"event": ...}` to the callback; server replies `{"status":"OK"}` or
   `{"status":"ERROR","reason":"..."}`.

References: https://github.com/nostr-protocol/nips/blob/master/07.md

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Login accepted (`{"status":"OK"}`) or operation completed |
| `1` | Client-side error (bad event, invalid key, network failure) |
| `2` | Usage error (no method/args, unknown option) |
| `3` | Server responded `{"status":"ERROR","reason":"..."}` |
| `4` | Non-200 HTTP status or non-JSON body from the callback |

## Examples

### Basic sign-in

```bash
node <skill_dir>/nostr_auth.js nip07 --challenge "012345..." --relay "wss://relay.example.com" --callback "https://site.example.com/verify"
```

### Dry-run first (inspect without submitting)

```bash
node <skill_dir>/nostr_auth.js nip07 --challenge "012345..." --dry-run --json
```

### Use a specific key

```bash
node <skill_dir>/nostr_auth.js nip07 '<template-json>' --key <64-char-hex-private-key>
```

## Dependencies

- **Node.js** v20.19+ (v22+ recommended).
- **Zero npm dependencies**: pure BigInt secp256k1/schnorr + `node:crypto`
  (sha256/HMAC). Boots from a clean clone, no `npm install` needed at runtime.

## Self-test (offline, cost-free)

```bash
cd <skill_dir>
npm test
```

A local mock "Sign in with Nostr" server validates the full
challenge → sign → submit → verify roundtrip, replay rejection, dry-run
safety and per-domain key stability.

## Limitations

- Signs challenges / events locally; account creation depends on the remote
  service recognizing the derived public key.
- The derived identity is an agent identity — not the same key a user's
  browser extension would produce.
- Method surface: NIP-07-style sign-in only in v1.0.0. NIP-98 (HTTP Auth),
  NIP-42 (relay AUTH) and NIP-05 are on the roadmap.