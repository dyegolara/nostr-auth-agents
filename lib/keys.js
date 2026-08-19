'use strict';
// Identity and key management, mirroring the LNURL-auth design.
//
// A 32-byte master secret persists at ~/.config/nostr-auth/master.key (mode
// 0600). For each service a deterministic linking key is derived:
//
//   linkingPriv = HMAC-SHA256(master, domain)        (re-hashed if >= n)
//
// Same domain -> same key (returning user). Different domains -> different
// keys (privacy, like LNURL's LUD-05/13 spirit). --single-key shares one key.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHmac, webcrypto } = require('crypto');
const { getPublicKey, N, bigFromBuffer } = require('./schnorr');
const { encode } = require('./bech32');

const DEFAULT_KEYFILE =
  process.env.NOSTR_AUTH_KEYFILE || path.join(os.homedir(), '.config', 'nostr-auth', 'master.key');

function hexToBytes(hex) {
  const h = String(hex).trim().replace(/^0x/i, '');
  if (h.length % 2) throw new Error('Invalid hex: odd length (' + h.length + ' chars)');
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error('Invalid hex');
  return Buffer.from(h, 'hex');
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function randomBytes(n) {
  const array = new Uint8Array(n);
  webcrypto.getRandomValues(array);
  return Buffer.from(array);
}

function readKeyFile(file) {
  try {
    return hexToBytes(fs.readFileSync(file, 'utf8').trim());
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeKeyFile(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, bytesToHex(bytes) + '\n', { mode: 0o600, flag: 'w' });
}

// Resolve the master secret from --key / --keyfile or persistence.
//  --generate forces a fresh secret, overwriting any persisted keyfile.
function resolveMasterSecret(opts = {}) {
  if (opts.key) {
    const bytes = hexToBytes(opts.key);
    if (bytes.length !== 32) throw new Error('--key must be a 32-byte (64-char) hex private key');
    const d = bigFromBuffer(bytes);
    if (d === 0n || d >= N) throw new Error('--key is not a valid secp256k1 private key');
    return bytes;
  }
  const keyfile = opts.keyfile || DEFAULT_KEYFILE;
  const existing = readKeyFile(keyfile);
  if (existing && !opts.generate) {
    if (existing.length !== 32) throw new Error('Key file must hold a 32-byte hex secret');
    return existing;
  }
  const fresh = randomBytes(32);
  if (!opts.ephemeral) writeKeyFile(keyfile, fresh);
  return fresh;
}

// Per-service deterministic linking key (HMAC-SHA256 of the master with the
// normalized service domain). `singleKey` returns the master itself.
function deriveLinkingKey(masterSecret, domain, singleKey = false) {
  if (singleKey) return Buffer.from(masterSecret);
  const text = Buffer.from(String(domain), 'utf8');
  let candidate = createHmac('sha256', masterSecret).update(text).digest();
  while (bigFromBuffer(candidate) >= N) {
    candidate = createHmac('sha256', masterSecret).update(candidate).digest();
  }
  return candidate;
}

// NIP-19 rendering of a 32-byte secret: nsec (private) and npub (public).
function toNsec(privBytes) {
  return encode('nsec', privBytes);
}

function toNpub(privBytes) {
  return encode('npub', getPublicKey(privBytes).xBytes);
}

module.exports = {
  DEFAULT_KEYFILE,
  hexToBytes,
  bytesToHex,
  randomBytes,
  resolveMasterSecret,
  deriveLinkingKey,
  toNsec,
  toNpub,
};