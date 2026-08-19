---
name: nostr-auth
description: "Explain and guide an auth-only Nostr sign-in (NIP-07 style) when a site asks for a signed event or a sign-in challenge."
---

# Nostr sign-in (NIP-07)

Use this skill when a service presents a Nostr sign-in challenge: a string or
event template the client must sign to prove ownership of a Nostr identity.
Nostr sign-in is an authentication handshake, not a payment or publishing
flow.

## Protocol

1. Receive the challenge from the service, either as a free-form string or as
   an event template (`kind`, `tags`, `content`).
2. Build or complete the event. The common shape is kind `22242` with a
   `["challenge", "<value>"]` tag and optionally a `["relay", "<url>"]` tag,
   empty content, `created_at` in unix seconds, and the signer's 32-byte hex
   `pubkey` (x coordinate of the secp256k1 point).
3. Compute the NIP-01 id: `sha256(JSON.stringify([0, pubkey, created_at,
   kind, tags, content]))` as lowercase hex.
4. Sign the raw 32-byte id with BIP-340 schnorr using the private key. Store
   the 64-byte signature as lowercase hex in `event.sig`.
5. Submit the signed event to the service (JSON `{"event": ...}` to the
   callback, or the shape the service specifies). Interpret `{"status":"OK"}`
   as accepted authentication and `{"status":"ERROR"}` as rejected; obtain a
   fresh challenge before retrying.

## Identity and safety

- The signing key stays local and is never shared with the service; only the
  public key and signature leave the machine.
- Prefer per-service derived keys so unrelated services cannot correlate the
  same identity across domains.
- Inspect the destination URL and the event being signed before submitting a
  signature.
- Beware requests to publish notes, follow relays, or "verify" by paying —
  those are outside the NIP-07 sign-in scope.
- A consumed challenge is one-time only; do not replay it after a timeout
  without checking whether the service already counted it.

## Failure handling

- A malformed challenge or event template is a client input error; request a
  fresh challenge from the service.
- Signature verification errors mean the wrong key or a tampered event; keep
  the key stable per domain so the service recognizes the returning user.

Reference: https://github.com/nostr-protocol/nips/blob/master/07.md