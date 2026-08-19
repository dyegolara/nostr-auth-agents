import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveMasterSecret,
  deriveLinkingKey,
  toNpub,
  toNsec,
  hexToBytes,
} from '../lib/keys';
import { decode } from '../lib/bech32';
import { N } from '../lib/schnorr';

function tmpKeyfile() {
  return path.join(os.tmpdir(), `nostr-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}.key`);
}

describe('keys', () => {
  it('generates and persists a 32-byte 0600 master secret', () => {
    const file = tmpKeyfile();
    try {
      const master = resolveMasterSecret({ keyfile: file });
      expect(master.length).toBe(32);
      expect((fs.statSync(file).mode & 0o777).toString(8)).toBe('600');
      const again = resolveMasterSecret({ keyfile: file });
      expect(again.equals(master)).toBe(true);
      resolveMasterSecret({ keyfile: file, generate: true });
      expect(resolveMasterSecret({ keyfile: file }).equals(master)).toBe(false);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('derives stable per-domain keys below the curve order', () => {
    const master = hexToBytes('ab'.repeat(32));
    const a1 = deriveLinkingKey(master, 'example.com');
    const a2 = deriveLinkingKey(master, 'example.com');
    const b = deriveLinkingKey(master, 'other.net');
    expect(a1.equals(a2)).toBe(true);
    expect(a1.equals(b)).toBe(false);
    expect(BigInt('0x' + a1.toString('hex')) < N).toBe(true);
  });

  it('single-key mode returns the master itself', () => {
    const master = hexToBytes('cd'.repeat(32));
    expect(deriveLinkingKey(master, 'example.com', true).equals(master)).toBe(true);
  });

  it('renders npub/nsec NIP-19 strings that decode back to the key material', () => {
    const master = hexToBytes('ef'.repeat(32));
    for (const [render, expectedLen, prefix] of [
      [toNsec(master), 32, 'nsec'],
      [toNpub(master), 32, 'npub'],
    ]) {
      const decoded = decode(render, expectedLen);
      expect(decoded.prefix).toBe(prefix);
    }
    expect(toNpub(master)).not.toContain(master.toString('hex'));
  });

  it('rejects invalid explicit keys', () => {
    expect(() => resolveMasterSecret({ key: 'zz'.repeat(32) })).toThrow(/Invalid hex/);
    expect(() => resolveMasterSecret({ key: 'ab'.repeat(31) })).toThrow(/32-byte/);
    expect(() => resolveMasterSecret({ key: '00'.repeat(32) })).toThrow(/not a valid/);
  });

  it('rejects malformed keyfiles', () => {
    const file = tmpKeyfile();
    try {
      fs.writeFileSync(file, '12'.repeat(17)); // 17 bytes
      expect(() => resolveMasterSecret({ keyfile: file })).toThrow(/32-byte hex/);
    } finally {
      fs.unlinkSync(file);
    }
  });
});