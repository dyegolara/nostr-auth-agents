'use strict';
// NIP-01 event helpers: canonical serialization, id (sha256), schnorr signing.
const { createHash } = require('crypto');
const { sign, verify, getPublicKey, bytesToHex } = require('./schnorr');

function serializeEvent(event) {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

function eventId(event) {
  return createHash('sha256').update(Buffer.from(serializeEvent(event), 'utf8')).digest('hex');
}

// Sign a template { kind, tags, content, created_at? }. Fills pubkey,
// created_at, id and sig. Returns the signed event (JSON-able).
function signEvent(template, privBytes, { now } = {}) {
  const createdAt = template.created_at != null ? Number(template.created_at) : Math.floor((now || Date.now()) / 1000);
  const event = {
    kind: Number(template.kind),
    tags: template.tags || [],
    content: String(template.content || ''),
    created_at: createdAt,
    pubkey: getPublicKey(privBytes).xBytes.toString('hex'),
  };
  const id = eventId(event);
  event.id = id;
  event.sig = Buffer.from(sign(Buffer.from(id, 'hex'), privBytes)).toString('hex');
  return event;
}

// Verify an event: id hash + schnorr signature over the id.
function verifyEvent(event) {
  if (event.id !== eventId(event)) throw new Error('Event id does not match content');
  if (!/^[0-9a-f]{128}$/i.test(String(event.sig || ''))) throw new Error('Invalid signature format');
  if (!/^[0-9a-f]{64}$/i.test(String(event.pubkey || ''))) throw new Error('Invalid pubkey format');
  const ok = verify(
    Buffer.from(String(event.id), 'hex'),
    Buffer.from(String(event.sig), 'hex'),
    Buffer.from(String(event.pubkey), 'hex'),
  );
  if (!ok) throw new Error('Signature verification failed');
  return true;
}

module.exports = { serializeEvent, eventId, signEvent, verifyEvent };