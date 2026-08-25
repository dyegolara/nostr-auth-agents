# Vendor @noble/curves for secp256k1 + BIP-340 schnorr

The signer's secp256k1 and BIP-340 schnorr code is vendored from `@noble/curves`
(MIT) into `lib/vendor/`, rather than shipping our own hand-written math. The
crypto is battle-tested third-party code, and the runtime still has zero npm
dependencies, so the CLI, MCP server, and portable bundle all boot from a clean
clone without `npm install`.

## Considered Options

- **Hand-written secp256k1 + schnorr** (the original `schnorr.js`): more code to
  audit, and "roll-your-own crypto" is a hard sell for an auth tool. Rejected.
- **Runtime npm dependency on `@noble/curves`**: breaks the clean-clone boot and
  complicates the portable bundle. Rejected.
- The original `schnorr.js` is kept only as a cross-check oracle in the tests.