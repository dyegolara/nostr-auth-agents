# Nostr Sign-In

The domain of authenticating an LLM agent to a web service via NIP-07: proving
control of a Nostr key by signing a challenge, without a wallet or extension.

## Language

**Sign in with Nostr**:
The NIP-07 authentication flow in which a service asks the agent to sign a
challenge to prove it controls a Nostr key.
_Avoid_: NIP-07 login, nostr auth (that's the tool, not the flow)

**sign-in challenge**:
The challenge a service presents for the agent to sign, proving key control.
_Avoid_: k1, nonce, puzzle

**identity**:
The public face a service observes: the secp256k1 public key (hex) and its npub.
_Avoid_: pubkey, account, linking key

**service domain**:
The domain of the relying service the agent signs into; it selects which
identity is used.
_Avoid_: domain, relying party, host

**master secret**:
The local 32-byte secret from which the per-service identity is derived.
_Avoid_: master key, root key, seed