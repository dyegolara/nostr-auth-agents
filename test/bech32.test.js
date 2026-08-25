import { describe, it, expect } from 'vitest';
import { encode, decode } from '../lib/bech32';

describe('bech32', () => {
  it('encodes and decodes roundtrip', () => {
    const bytes = Buffer.from('0123456789abcdef'.repeat(4), 'hex');
    const encoded = encode('npub', bytes);
    expect(encoded.startsWith('npub1')).toBe(true);
    const decoded = decode(encoded, 32);
    expect(decoded.prefix).toBe('npub');
    expect(Buffer.from(decoded.bytes).equals(bytes)).toBe(true);
  });

  it('is case-insensitive on decode', () => {
    const bytes = Buffer.alloc(32, 7);
    const encoded = encode('npub', bytes);
    expect(decode(encoded.toUpperCase(), 32).bytes).toEqual([...bytes]);
  });

  it('rejects mixed case', () => {
    const bytes = Buffer.alloc(32, 7);
    const encoded = encode('npub', bytes);
    const mixed = encoded.slice(0, 3) + encoded.slice(3).toUpperCase();
    expect(() => decode(mixed)).toThrow(/Mixed-case/);
  });

  it('rejects corrupted checksums and payloads', () => {
    const bytes = Buffer.alloc(32, 7);
    const encoded = encode('npub', bytes);
    const corrupted = encoded.slice(0, -1) + (encoded.endsWith('p') ? 'q' : 'p');
    expect(() => decode(corrupted, 32)).toThrow(/checksum/);
    expect(() => decode(encoded, 31)).toThrow(/Unexpected decoded length/);
  });

  it('matches the official BIP-173 vectors (encode + decode)', () => {
    const vectorBytes = Buffer.from('00443214c74254b635cf84653a56d7c675be77df', 'hex');
    expect(encode('abcdef', vectorBytes)).toBe('abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw');

    const valid = [
      ['A12UEL5L', 'a', ''],
      ['a12uel5l', 'a', ''],
      ['abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw', 'abcdef', '00443214c74254b635cf84653a56d7c675be77df'],
    ];
    for (const [str, prefix, hex] of valid) {
      const d = decode(str);
      expect(d.prefix).toBe(prefix);
      expect(Buffer.from(d.bytes).toString('hex')).toBe(hex);
    }

    const invalid = ['pzry9x0s0muk', '1pzry9x0s0muk', 'x1b4n0q5v', 'li1dgmt3', 'A1G7SGD8', '10a06t8', '1qzzfhee'];
    for (const str of invalid) {
      expect(() => decode(str)).toThrow();
    }
  });
});