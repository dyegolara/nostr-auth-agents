import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import {
  parseEventSpec,
  buildChallengeEvent,
  signTemplate,
  submitSignedEvent,
  identityFor,
  normalizeDomain,
} from '../lib/nip07';
import { verifyEvent, eventId, serializeEvent } from '../lib/event';
import { verify } from '../lib/schnorr';
import { start } from '../mock_server';

const PORT = 8733;
const BASE = `http://127.0.0.1:${PORT}`;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

describe('nip07 flow', () => {
  let server;
  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
  });
  afterAll(() => server.close());

  it('normalizes domains for derivation', () => {
    expect(normalizeDomain('Example.com')).toBe('example.com');
    expect(normalizeDomain('https://Example.com/')).toBe('example.com');
    expect(normalizeDomain('wss://relay.example.com')).toBe('relay.example.com');
    expect(normalizeDomain('  ')).toBe(null);
  });

  it('parses event templates strictly', () => {
    const template = parseEventSpec('{"kind":22242,"tags":[["challenge","abc"]],"content":""}');
    expect(template.kind).toBe(22242);
    expect(template.tags).toEqual([['challenge', 'abc']]);
    expect(() => parseEventSpec('{"tags":[]}')).toThrow(/kind/);
    expect(() => parseEventSpec('')).toThrow(/Missing event/);
  });

  it('builds kind-22242 challenge events', () => {
    const ev = buildChallengeEvent({ challenge: 'cafe', relay: 'wss://r.example' });
    expect(ev.kind).toBe(22242);
    expect(ev.tags).toEqual([['challenge', 'cafe'], ['relay', 'wss://r.example']]);
  });

  it('signs templates with a valid schnorr signature over the NIP-01 id', () => {
    const template = { kind: 27235, tags: [['domain', 'example.com']], content: 'hi' };
    const result = signTemplate({ template, domain: 'example.com', key: 'ab'.repeat(32) });
    expect(result.npub.startsWith('npub1')).toBe(true);
    expect(result.event.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(result.event.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(result.event.id).toBe(eventId(result.event));
    expect(
      verify(
        Buffer.from(result.event.id, 'hex'),
        Buffer.from(result.event.sig, 'hex'),
        Buffer.from(result.event.pubkey, 'hex'),
      ),
    ).toBe(true);
    expect(() => verifyEvent(result.event)).not.toThrow();
  });

  it('derives the same identity for the same domain', () => {
    const a = identityFor({ domain: 'example.com', key: 'cd'.repeat(32) });
    const b = identityFor({ domain: 'example.com', key: 'cd'.repeat(32) });
    expect(a.npub).toBe(b.npub);
  });

  it('runs the full challenge -> sign -> submit -> OK roundtrip', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const template = challenge.template;
    const result = signTemplate({ template, domain: '127.0.0.1', key: 'ef'.repeat(32) });
    const verdict = await submitSignedEvent(`${BASE}/verify`, result.event);
    expect(verdict.httpStatus).toBe(200);
    expect(verdict.ok).toBe(true);
    expect(verdict.response.status).toBe('OK');
  });

  it('rejects a replay of the same challenge (ERROR verdict, not a crash)', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const signed = signTemplate({ template: challenge.template, domain: '127.0.0.1', key: 'ef'.repeat(32) });
    const first = await submitSignedEvent(`${BASE}/verify`, signed.event);
    expect(first.ok).toBe(true);
    const second = await submitSignedEvent(`${BASE}/verify`, signed.event);
    expect(second.ok).toBe(false);
    expect(second.response.status).toBe('ERROR');
    expect(second.response.reason).toMatch(/already-used/);
  });

  it('treats non-JSON callbacks as exit-code-4 errors', async () => {
    const badServer = http.createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('boom');
    });
    await new Promise((resolve) => badServer.listen(8734, '127.0.0.1', resolve));
    try {
      const signed = signTemplate({
        template: buildChallengeEvent({ challenge: 'abc', relay: '' }),
        domain: '127.0.0.1',
        key: 'ef'.repeat(32),
      });
      const err = await submitSignedEvent('http://127.0.0.1:8734/verify', signed.event).catch((e) => e);
      expect(err.code).toBe(4);
    } finally {
      badServer.close();
    }
  });
});