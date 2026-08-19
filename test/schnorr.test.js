import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { schnorr } from '@noble/curves/secp256k1';
import {
  sign,
  verify,
  getPublicKey,
  liftX,
  taggedHash,
  decompressPubkey,
} from '../lib/schnorr';

const hex = (s) => Buffer.from(s, 'hex');
const hx = (b) => Buffer.from(b).toString('hex');

// Official BIP-340 test vector #0 (deterministic, aux = zeros).
const BIP340_VECTOR_0 = {
  priv: '0000000000000000000000000000000000000000000000000000000000000003',
  pub: 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
  msg: '0000000000000000000000000000000000000000000000000000000000000000',
  sig: 'e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca8215' +
    '25f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0',
};

describe('schnorr BIP-340', () => {
  it('matches the official BIP-340 vector (sign)', () => {
    const sig = sign(hex(BIP340_VECTOR_0.msg), hex(BIP340_VECTOR_0.priv), Buffer.alloc(32));
    expect(hx(sig)).toBe(BIP340_VECTOR_0.sig);
  });

  it('matches the official BIP-340 vector (verify)', () => {
    expect(verify(hex(BIP340_VECTOR_0.msg), hex(BIP340_VECTOR_0.sig), hex(BIP340_VECTOR_0.pub))).toBe(true);
  });

  it('rejects tampered messages and signatures', () => {
    const msg = hex(BIP340_VECTOR_0.msg);
    const sig = hex(BIP340_VECTOR_0.sig);
    const pub = hex(BIP340_VECTOR_0.pub);
    const tamperedMsg = Buffer.from(msg);
    tamperedMsg[0] ^= 1;
    expect(verify(tamperedMsg, sig, pub)).toBe(false);
    const tamperedSig = Buffer.from(sig);
    tamperedSig[63] ^= 1;
    expect(verify(msg, tamperedSig, pub)).toBe(false);
    const tamperedPub = Buffer.from(pub);
    tamperedPub[0] ^= 1;
    expect(verify(msg, sig, tamperedPub)).toBe(false);
  });

  it('rejects out-of-range r and s', () => {
    const msg = hex(BIP340_VECTOR_0.msg);
    const pub = hex(BIP340_VECTOR_0.pub);
    const bigR = Buffer.concat([Buffer.from('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex'), Buffer.alloc(32)]);
    expect(verify(msg, bigR, pub)).toBe(false);
    const bigS = Buffer.concat([Buffer.alloc(32), Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'hex')]);
    expect(verify(msg, bigS, pub)).toBe(false);
  });

  it('cross-checks sign/verify against @noble/curves over random keys', () => {
    for (let i = 0; i < 8; i++) {
      const priv = Buffer.from(schnorr.utils.randomPrivateKey());
      const msg = Buffer.from(randomBytes(32));
      const pub32 = Buffer.from(getPublicKey(priv).xBytes);
      expect(hx(pub32)).toBe(hx(Buffer.from(schnorr.getPublicKey(priv))));

      const ourSig = sign(msg, priv);
      expect(schnorr.verify(ourSig, msg, pub32)).toBe(true);
      expect(verify(msg, ourSig, pub32)).toBe(true);

      const nobleSig = schnorr.sign(msg, priv);
      expect(verify(msg, Buffer.from(nobleSig), pub32)).toBe(true);
    }
  });

  it('derives the same public key as @noble/curves', () => {
    const priv = Buffer.from('0000000000000000000000000000000000000000000000000000000000000007', 'hex');
    const our = getPublicKey(priv);
    expect(hx(our.xBytes)).toBe(hx(Buffer.from(schnorr.getPublicKey(priv))));
    expect(our.evenY).toBe(true);
  });

  it('liftX recovers the even-Y point', () => {
    const pt = liftX(BigInt('0x' + BIP340_VECTOR_0.pub));
    expect(pt.y % 2n).toBe(0n);
    expect(pt.x.toString(16).padStart(64, '0')).toBe(BIP340_VECTOR_0.pub);
  });

  it('taggedHash matches the BIP-340 spec shape', () => {
    const h = taggedHash('BIP0340/challenge', Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32));
    expect(h.length).toBe(32);
  });

  it('decompressPubkey roundtrips compressed keys', () => {
    const priv = Buffer.from(randomBytes(32));
    const privBig = BigInt('0x' + hx(priv));
    if (privBig === 0n) return; // astronomically unlikely
    const compressed = Buffer.from(getPublicKey(priv).compressedHex, 'hex');
    const pt = decompressPubkey(compressed);
    expect(Buffer.from(pt.x.toString(16).padStart(64, '0'), 'hex')).toEqual(getPublicKey(priv).xBytes);
  });

  it('rejects invalid private keys', () => {
    expect(() => sign(Buffer.alloc(32), Buffer.alloc(31))).toThrow(/32 bytes/);
    expect(() => getPublicKey(Buffer.alloc(32))).toThrow(/out of range/);
  });
});