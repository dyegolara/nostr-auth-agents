# Per-service identity via HMAC-SHA256 of the master secret and service domain

Each service gets its own identity derived as
`HMAC-SHA256(master secret, service domain)`. The same service domain always
yields the same identity (returning users are recognized), while different
domains yield different identities, so no two services can correlate that the
same agent signed into both. When no service domain, relay, or callback is
given, the derivation falls back to the literal string `nostr` as an
intentional default.

## Considered Options

- **One global key for all services** (`--single-key`): simpler, but leaks a
  single identity across every service. Kept as an opt-in flag, not the default.
- **HD (BIP32) derivation**: more machinery than the privacy goal needs.
  Rejected.