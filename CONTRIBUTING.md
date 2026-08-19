# Contributing

## Development

```bash
npm ci        # install dev-only deps (vitest, @noble/curves cross-check)
npm test      # full suite (offline, cost-free: unit + mock service + bundle)
node --check nostr_auth.js mcp/server.js skills/nostr-auth/scripts/nostr_auth.js
```

The runtime is **zero-dependency**: `lib/` uses only `node:crypto` and BigInt
math. `@noble/curves` is a devDependency used exclusively to cross-check the
BIP-340 schnorr implementation in tests.

## Adding a new method (NIP-98, NIP-42, NIP-05)

1. Add `lib/nipXX.js` importing from `lib/keys`, `lib/event`, `lib/schnorr`.
2. Add the subcommand to `nostr_auth.js` and move it out of `COMING_SOON`.
3. Mirror the flow in the portable bundle
   `skills/nostr-auth/scripts/nostr_auth.js` (single file, zero deps).
4. Add tests — unit plus a mock service, update `test/publishing.test.js`.
5. Bump `version` in `package.json`, `package-lock.json`, `nostr_auth.js`,
   `mcp/server.js`, both `SKILL.md`, plugin manifests, bundle helper, and
   reflect the bump in `PUBLISHING.md`.

## Goals

- Keep the auth-only scope: no publishing, no payments, no relay connections
  beyond the service callback.
- Node `>=20.19`, CommonJS, no transpile step. Everything runs from a clean
  clone (no install).

License: MIT. See the distribution status per platform in
[PUBLISHING.md](PUBLISHING.md).