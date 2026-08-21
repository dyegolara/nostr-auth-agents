'use strict';
// secp256k1 + BIP-340 schnorr signatures, reimplemented over the vendored
// @noble/curves code in lib/vendor/ (ADR-0001). The public surface below is
// the seam callers rely on (sign/verify/getPublicKey/decompressPubkey/liftX)
// and is unchanged; only the implementation underneath is now battle-tested
// third-party code. The former hand-written math lives on only as a test
// oracle at test/oracle/schnorr-oracle.js.
const { secp256k1, schnorr } = require('./vendor/noble-secp256k1.cjs');

const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function bigFromBuffer(buf) {
  return BigInt('0x' + (buf.length ? Buffer.from(buf).toString('hex') : '0'));
}

function buffer32(big, label) {
  if (big < 0n) throw new Error(`${label || 'value'} must be non-negative`);
  const hex = big.toString(16).padStart(64, '0');
  if (hex.length > 64) throw new Error(`${label || 'value'} overflows 32 bytes`);
  return Buffer.from(hex, 'hex');
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function assertPrivateKey(priv) {
  if (priv.length !== 32) throw new Error('private key must be 32 bytes');
  const d = bigFromBuffer(priv);
  if (d === 0n || d >= N) throw new Error('private key out of range');
  return d;
}

function isEvenY(pt) {
  return (BigInt(pt.y) % 2n === 0n);
}

// BIP-340 tagged hash: sha256(sha256(tag) || sha256(tag) || msg).
function taggedHash(tag, ...chunks) {
  return Buffer.from(schnorr.utils.taggedHash(tag, ...chunks));
}

// Public key of a 32-byte secret: 32-byte x and 33-byte compressed hex.
function getPublicKey(priv) {
  assertPrivateKey(priv);
  const compressed = Buffer.from(secp256k1.getPublicKey(priv, true));
  return {
    xBytes: compressed.subarray(1),
    compressedHex: compressed.toString('hex'),
    evenY: compressed[0] === 2,
  };
}

// BIP-340 sign. msg: 32 bytes, priv: 32 bytes, aux: 32 bytes or null (zeros).
function sign(msg, priv, aux = null) {
  if (msg.length !== 32) throw new Error('message must be 32 bytes');
  assertPrivateKey(priv);
  const auxBytes = aux && aux.length === 32 ? aux : Buffer.alloc(32);
  return Buffer.from(schnorr.sign(msg, priv, auxBytes));
}

// BIP-340 verify. msg: 32 bytes, sig: 64 bytes, pub: 32-byte x coordinate.
// Returns false for any invalid input (bad point, out-of-range values).
function verify(msg, sig, pub) {
  if (msg.length !== 32) throw new Error('message must be 32 bytes');
  if (sig.length !== 64) throw new Error('signature must be 64 bytes');
  if (pub.length !== 32) throw new Error('public key must be 32 bytes');
  return schnorr.verify(sig, msg, pub);
}

// BIP-340 lift_x: recover the point with even Y for a given x coordinate.
function liftX(x) {
  if (x < 0n || x >= P) throw new Error('x coordinate out of field range');
  try {
    return schnorr.utils.lift_x(x).toAffine();
  } catch (e) {
    throw new Error('point is not on the curve');
  }
}

// Restore the affine point of a 02/03-prefixed 33-byte compressed pubkey.
function decompressPubkey(compressedBytes) {
  if (compressedBytes.length !== 33) throw new Error('compressed pubkey must be 33 bytes');
  const prefix = compressedBytes[0];
  if (prefix !== 2 && prefix !== 3) throw new Error('invalid compressed pubkey prefix');
  try {
    return secp256k1.Point.fromHex(Buffer.from(compressedBytes).toString('hex')).toAffine();
  } catch (e) {
    throw new Error('point is not on the curve');
  }
}

module.exports = {
  P,
  N,
  GX,
  GY,
  liftX,
  sign,
  verify,
  getPublicKey,
  decompressPubkey,
  taggedHash,
  isEvenY,
  buffer32,
  bigFromBuffer,
  bytesToHex,
};
