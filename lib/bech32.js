'use strict';
// Minimal bech32 encode/decode (NIP-19 style: npub/nsec HRPs).
// Pure Node.js stdlib — no npm dependencies. Used to render the npub
// (and nsec) strings from/into raw 32-byte key material.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk;
}

function hrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function verifyChecksum(hrp, data) {
  return polymod([...hrpExpand(hrp), ...data]) === 1;
}

function createChecksum(hrp, data) {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const out = [];
  for (let p = 0; p < 6; p++) out.push((mod >>> (5 * (5 - p))) & 31);
  return out;
}

function convertBits(data, fromBits, toBits, pad = true) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >>> fromBits !== 0) throw new Error('Invalid value in convertBits');
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >>> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    throw new Error('Invalid padding in convertBits');
  }
  return ret;
}

// Encode bytes as bech32 with the given HRP.
function encode(hrp, bytes) {
  const data = convertBits([...bytes], 8, 5, true);
  const withChecksum = [...data, ...createChecksum(hrp, data)];
  return hrp + '1' + withChecksum.map((v) => CHARSET[v]).join('');
}

// Decode a bech32 string, returning { prefix, bytes }.
// `numbersExpected` optionally bounds the byte length (e.g. 32 for keys).
function decode(str, numbersExpected) {
  const raw = String(str || '').trim();
  if (raw.length < 8 || raw.length > 90) throw new Error('Invalid bech32 length');
  const hasLower = raw !== raw.toUpperCase();
  const hasUpper = raw !== raw.toLowerCase();
  if (hasLower && hasUpper) throw new Error('Mixed-case bech32 string');
  const s = raw.toLowerCase();

  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) throw new Error('Invalid bech32 separator position');
  const hrp = s.slice(0, pos);
  const data = [];
  for (let i = pos + 1; i < s.length; i++) {
    const idx = CHARSET.indexOf(s[i]);
    if (idx === -1) throw new Error(`Invalid bech32 character: "${s[i]}"`);
    data.push(idx);
  }
  if (!verifyChecksum(hrp, data)) throw new Error('Invalid bech32 checksum');
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  if (numbersExpected != null && bytes.length !== numbersExpected) {
    throw new Error(`Unexpected decoded length: ${bytes.length} bytes (expected ${numbersExpected})`);
  }
  return { prefix: hrp, bytes };
}

module.exports = { encode, decode, convertBits };