# Privacy policy

This project does not collect data. All state lives on the machine where it
runs:

- **Master secret** (`~/.config/nostr-auth/master.key`, mode `0600`): the only
  thing persisted. It is never sent to anyone; only its derivatives are used
  (public keys and signatures).
- **Per-service derivation**: `HMAC-SHA256(master, domain)` generates a
  distinct identity per service, so unrelated services cannot correlate the
  user.

## What it does NOT do

- It does not send private keys or seeds to third parties.
- It does not collect telemetry, analytics, or metrics.
- It does not publish events to relays on its own.

## What does happen

- A single HTTP request to the callback of the service being authenticated,
  containing the public key and a signature (equivalent to what a NIP-07
  extension would expose).
- When using `--key` or `--single-key`, the identity sent is the one you
  specify; there is no transmission beyond that.

## Limitation

### Identity

The derived key is a local agent identity. It is not the identity of the
user's browser extension or wallet (those use the user's nsec/seed).
Replacing derivation with a real nsec (via `--key`) is the responsibility of
whoever configures it.