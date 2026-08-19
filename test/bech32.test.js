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
});