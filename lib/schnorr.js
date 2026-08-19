'use strict';
// Pure-JS secp256k1 + BIP-340 schnorr signatures (sign/verify) built on
// BigInt math and node:crypto sha256. Zero npm dependencies — the whole
// repo (CLI, MCP server, portable skill bundle) runs from a clean clone.
//
// Jacobian coordinates for scalar multiplication (one inversion per call),
// affine otherwise. Validated against the official BIP-340 test vectors and
// cross-checked against @noble/curves in the test suite.
const { createHash } = require('crypto');

const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const INFINITY = { x: 0n, y: 0n, z: 0n };

function mod(a, m) {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function powMod(base, exp, m) {
  let result = 1n;
  base = mod(base, m);
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

function inverse(a, m) {
  return powMod(a, m - 2n, m);
}

function bigFromBuffer(buf) {
  return BigInt('0x' + (buf.length ? Buffer.from(buf).toString('hex') : '0'));
}

function buffer32(big, label) {
  if (big < 0n) throw new Error(`${label || 'value'} must be non-negative`);
  const hex = big.toString(16).padStart(64, '0');
  if (hex.length > 64) throw new Error(`${label || 'value'} overflows 32 bytes`);
  return Buffer.from(hex, 'hex');
}

function sha256(...chunks) {
  const h = createHash('sha256');
  for (const chunk of chunks) h.update(chunk);
  return h.digest();
}

// BIP-340 tagged hash: sha256(sha256(tag) || sha256(tag) || msg).
function taggedHash(tag, ...chunks) {
  const tagHash = sha256(Buffer.from(tag, 'utf8'));
  return sha256(tagHash, tagHash, ...chunks);
}

// --- Jacobian point arithmetic (secp256k1, a = 0) ---------------------------

function jacFromAffine(pt) {
  return { x: pt.x, y: pt.y, z: 1n };
}

function jacToAffine(j) {
  if (j.z === 0n) return null;
  const zInv = inverse(j.z, P);
  const zInv2 = mod(zInv * zInv, P);
  return { x: mod(j.x * zInv2, P), y: mod(j.y * zInv2 * zInv, P) };
}

function jacDouble(j) {
  if (j.z === 0n || j.y === 0n) return INFINITY;
  const s = mod(4n * j.x * j.y * j.y, P);
  const m = mod(3n * j.x * j.x, P);
  const y4 = mod(j.y * j.y, P);
  return {
    x: mod(m * m - 2n * s, P),
    y: mod(m * (s - mod(m * m - 2n * s, P)) - 8n * y4 * y4, P),
    z: mod(2n * j.y * j.z, P),
  };
}

function jacAdd(a, b) {
  if (a.z === 0n) return b;
  if (b.z === 0n) return a;
  const z1z1 = mod(a.z * a.z, P);
  const z2z2 = mod(b.z * b.z, P);
  const u1 = mod(a.x * z2z2, P);
  const u2 = mod(b.x * z1z1, P);
  const s1 = mod(a.y * b.z * z2z2, P);
  const s2 = mod(b.y * a.z * z1z1, P);
  const h = mod(u2 - u1, P);
  if (h === 0n) return s1 === s2 ? jacDouble(a) : INFINITY;
  const i = mod(4n * h * h, P);
  const jac = mod(h * i, P);
  const r = mod(2n * (s2 - s1), P);
  const v = mod(u1 * i, P);
  return {
    x: mod(r * r - jac - 2n * v, P),
    y: mod(r * (v - mod(r * r - jac - 2n * v, P)) - 2n * s1 * jac, P),
    z: mod((mod((a.z + b.z) * (a.z + b.z), P) - z1z1 - z2z2) * h, P),
  };
}

function scalarMul(k, affinePoint) {
  let result = INFINITY;
  let addend = jacFromAffine(affinePoint);
  let n = k;
  while (n > 0n) {
    if (n & 1n) result = jacAdd(result, addend);
    addend = jacDouble(addend);
    n >>= 1n;
  }
  return jacToAffine(result);
}

function onCurve(pt) {
  return mod(pt.y * pt.y - pt.x * pt.x * pt.x - 7n, P) === 0n;
}

// BIP-340 lift_x: recover the point with even Y for a given x coordinate.
function liftX(x) {
  if (x < 0n || x >= P) throw new Error('x coordinate out of field range');
  const c = mod(x * x * x + 7n, P);
  let y = powMod(c, (P + 1n) / 4n, P);
  if (mod(y * y, P) !== c) throw new Error('point is not on the curve');
  if (y & 1n) y = P - y;
  return { x, y };
}

function isEvenY(pt) {
  return mod(pt.y, 2n) === 0n;
}

// --- BIP-340 schnorr core ---------------------------------------------------

const G = { x: GX, y: GY };

function assertPrivateKey(priv) {
  if (priv.length !== 32) throw new Error('private key must be 32 bytes');
  const d = bigFromBuffer(priv);
  if (d === 0n || d >= N) throw new Error('private key out of range');
  return d;
}

// Public key of a 32-byte secret: 32-byte x and 33-byte compressed hex.
function getPublicKey(priv) {
  const d = assertPrivateKey(priv);
  const pt = scalarMul(d, G);
  return {
    xBytes: buffer32(pt.x, 'pubkey x'),
    compressedHex: Buffer.from([isEvenY(pt) ? 2 : 3, ...buffer32(pt.x, 'pubkey x')]).toString('hex'),
    evenY: isEvenY(pt),
  };
}

// BIP-340 sign. msg: 32 bytes, priv: 32 bytes, aux: 32 bytes or null (zeros).
function sign(msg, priv, aux = null) {
  if (msg.length !== 32) throw new Error('message must be 32 bytes');
  const d0 = assertPrivateKey(priv);
  const pubPoint = scalarMul(d0, G);
  const d = isEvenY(pubPoint) ? d0 : N - d0;

  const auxBytes = aux && aux.length === 32 ? aux : Buffer.alloc(32);
  const t = d ^ bigFromBuffer(taggedHash('BIP0340/aux', auxBytes));
  const rand = taggedHash(
    'BIP0340/nonce',
    buffer32(t, 'nonce t'),
    buffer32(pubPoint.x, 'pubkey x'),
    msg,
  );
  const kp = bigFromBuffer(rand) % N;
  if (kp === 0n) throw new Error('nonce is zero — retry with different aux randomness');
  const rPoint = scalarMul(kp, G);
  const k = isEvenY(rPoint) ? kp : N - kp;

  const e = bigFromBuffer(
    taggedHash('BIP0340/challenge', buffer32(rPoint.x, 'R x'), buffer32(pubPoint.x, 'pubkey x'), msg),
  ) % N;
  const s = mod(k + e * d, N);

  return Buffer.concat([buffer32(rPoint.x, 'R x'), buffer32(s, 's')]);
}

// BIP-340 verify. msg: 32 bytes, sig: 64 bytes, pub: 32-byte x coordinate.
// Returns false for any invalid input (bad point, out-of-range values).
function verify(msg, sig, pub) {
  if (msg.length !== 32) throw new Error('message must be 32 bytes');
  if (sig.length !== 64) throw new Error('signature must be 64 bytes');
  if (pub.length !== 32) throw new Error('public key must be 32 bytes');
  let pt;
  try {
    pt = liftX(bigFromBuffer(pub));
  } catch (e) {
    return false;
  }
  const r = bigFromBuffer(sig.subarray(0, 32));
  const s = bigFromBuffer(sig.subarray(32, 64));
  if (r >= P || s >= N) return false;
  const e = bigFromBuffer(taggedHash('BIP0340/challenge', sig.subarray(0, 32), pub, msg)) % N;
  const rPrime = scalarMul(s, G);
  const eP = scalarMul(N - e, pt);
  if (rPrime === null || eP === null) return false;
  const rSum = jacToAffine(jacAdd(jacFromAffine(rPrime), jacFromAffine(eP)));
  if (rSum === null) return false;
  if (!isEvenY(rSum)) return false;
  return rSum.x === r;
}

// Restore the affine point of a 02/03-prefixed 33-byte compressed pubkey.
function decompressPubkey(compressedBytes) {
  if (compressedBytes.length !== 33) throw new Error('compressed pubkey must be 33 bytes');
  const prefix = compressedBytes[0];
  if (prefix !== 2 && prefix !== 3) throw new Error('invalid compressed pubkey prefix');
  const x = bigFromBuffer(compressedBytes.subarray(1));
  const c = mod(x * x * x + 7n, P);
  let y = powMod(c, (P + 1n) / 4n, P);
  if (mod(y * y, P) !== c) throw new Error('point is not on the curve');
  const wantsEven = prefix === 2;
  if (isEvenY({ x, y }) !== wantsEven) y = P - y;
  if (!onCurve({ x, y })) throw new Error('invalid point');
  return { x, y };
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
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