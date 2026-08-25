# Auth-only scope: sign-in events, no publishing or relay interaction

The tool only signs sign-in events (kind-22242). It never publishes normal
notes (kind-1), never moves funds, and never talks to relays except through the
service callback. Its purpose is proving identity to a service, not being a
Nostr client.

## Considered Options

- **General-purpose Nostr signer**: more surface, more risk, and outside what
  an agent needs to "sign in with Nostr". Rejected.