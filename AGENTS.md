# AGENTS.md — nostr-auth for coding agents

## What this tool does

`nostr_auth.js` signs "Sign in with Nostr" events (NIP-07 style) for LLM
agents. It takes a challenge or an event template from a site/API, signs a
kind-22242 event with a secp256k1 (BIP-340 schnorr) key derived from a local
master secret, and optionally sends the signature to the service callback —
no wallet, no browser extension, and nothing published.

## When to run it

Run this tool when:

- A site presents "Sign in with Nostr" (or asks for `window.nostr.signEvent`)
- An API hands back a `challenge` (string) or an event template to sign
- The task requires proving a Nostr identity, **not** publishing notes or paying

**Do NOT run** to publish kind-1, talk to relays for anything other than the
callback, or move funds. This is authentication only.

## Quick invocation

```bash
node nostr_auth.js nip07 --challenge "<hex>" --domain <domain> \
  --callback "<verification-url>"
```

Variants by case:

| Case | Command |
|---|---|
| Classic challenge string (kind-22242) | `nip07 --challenge "<hex>" --relay "<url>" --callback "<url>"` |
| Full event template | `nip07 '{"kind":...,"tags":[...],"content":""}'` |
| Inspect the derived identity (getPublicKey) | `nip07 pubkey --domain <domain>` |
| Sign without submitting | add `--dry-run` |

## Recommended flow

1. Obtain the challenge or template from the page/API (attribute, QR, HTML,
   JSON response).
2. **Dry-run first**: `nostr_auth.js nip07 --challenge "<hex>" --dry-run --json`
   to inspect the event, pubkey and callback before submitting.
3. Submit: `--callback <url>`. JSON output with the server verdict.

With `--json` the output is parseable (jq). Progress logs go to **stderr**.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Server responded `{"status":"OK"}` or the operation completed |
| `1` | Client-side error (invalid event, invalid key, network) |
| `2` | Usage error (no arguments, unknown option) |
| `3` | Server responded `{"status":"ERROR","reason":"..."}` |
| `4` | Non-200 or non-JSON callback response |

## Key management

- The first run generates a 32-byte master secret at
  `~/.config/nostr-auth/master.key` (mode `0600`).
- Per service domain it derives: `HMAC-SHA256(master, domain)`.
  Same domain → same identity; different domains → different identities
  (privacy).
- The identity survives between sessions; it is persistent.
- `--generate` **overwrites** the master secret.
- `--single-key` shares one identity across all services.
- `--key <hex>` uses that key as the master secret without touching the keyfile.

## Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| `Invalid hex: odd length` | Malformed challenge or key | Re-extract the challenge from the page |
| `Event template must include "kind"` | Template without `kind` | The template must be `{"kind":N,"tags":[...],"content":""}` |
| `status: ERROR, reason: unknown or already-used challenge` | Challenge already consumed | Request a fresh challenge |
| `status: ERROR, reason: signature verification failed` | Different key or altered event | Keep the key stable per domain |
| `Callback returned non-JSON or HTTP <n>` | Callback down or wrong URL | Check `--callback` |
| `nonce is zero` | Degenerate key material | Regenerate with `--generate` |

## Future methods (roadmap)

- `nip98` — NIP-98 HTTP Auth (`Authorization: Nostr <event>`): planned.
- `nip42` — Relay AUTH over websocket: planned.
- `nip05` — NIP-05 identifier resolution/verification: planned.

Today `nip07` is implemented (the closest to lnurl-auth); the rest arrive in
successive versions. Per-platform distribution status lives in
`PUBLISHING.md`.

## Self-test

```bash
npm ci
npm test
```

Fully offline and free. The suite covers BIP-340 vectors, key derivation,
sign/verify, replay rejection, dry-run, MCP and the publishing artifact.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `dyegolara/nostr-auth-agents`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage roles map to the labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See `docs/agents/domain.md`.