import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { start } from '../mock_server';
import { signTemplate, buildChallengeEvent } from '../lib/nip07';
import { verifyEvent } from '../lib/event';

const PORT = 8736;
const BASE = `http://127.0.0.1:${PORT}`;

function request(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, BASE);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      u,
      {
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signedEvent(key = 'ab'.repeat(32)) {
  return signTemplate({
    template: buildChallengeEvent({ challenge: 'mockchallenge', relay: BASE }),
    domain: '127.0.0.1',
    key,
  }).event;
}

describe('mock server', () => {
  let server;
  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
  });
  afterAll(() => server.close());

  it('issues challenges with a relay + challenge tag template', async () => {
    const res = await request(`${BASE}/challenge`);
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.template.kind).toBe(22242);
    expect(res.body.template.tags).toEqual([
      ['relay', BASE],
      ['challenge', res.body.challenge],
    ]);
  });

  it('accepts a freshly signed kind-22242 event with matching tags', async () => {
    const ch = await request(`${BASE}/challenge`);
    const event = signTemplate({
      template: buildChallengeEvent({ challenge: ch.body.challenge, relay: BASE }),
      domain: '127.0.0.1',
    }).event;
    const res = await request(`${BASE}/verify`, { method: 'POST', body: { event } });
    expect(res.body.status).toBe('OK');
  });

  it('rejects replays', async () => {
    const ch = await request(`${BASE}/challenge`);
    const event = signTemplate({
      template: buildChallengeEvent({ challenge: ch.body.challenge, relay: BASE }),
      domain: '127.0.0.1',
    }).event;
    await request(`${BASE}/verify`, { method: 'POST', body: { event } });
    const replay = await request(`${BASE}/verify`, { method: 'POST', body: { event } });
    expect(replay.body.status).toBe('ERROR');
    expect(replay.body.reason).toMatch(/already-used/);
  });

  it('rejects unknown challenges', async () => {
    const res = await request(`${BASE}/verify`, { method: 'POST', body: { event: signedEvent() } });
    expect(res.body.status).toBe('ERROR');
    expect(res.body.reason).toMatch(/unknown or already-used/);
  });

  it('rejects tampered signatures', async () => {
    const ch = await request(`${BASE}/challenge`);
    const event = signTemplate({
      template: buildChallengeEvent({ challenge: ch.body.challenge, relay: BASE }),
      domain: '127.0.0.1',
    }).event;
    event.sig = 'ff'.repeat(64);
    const res = await request(`${BASE}/verify`, { method: 'POST', body: { event } });
    expect(res.body.status).toBe('ERROR');
    expect(res.body.reason).toMatch(/verification|signature/i);
    expect(() => verifyEvent(event)).toThrow();
  });

  it('rejects events with a foreign relay tag', async () => {
    const ch = await request(`${BASE}/challenge`);
    const event = signTemplate({
      template: buildChallengeEvent({ challenge: ch.body.challenge, relay: 'wss://other.example.com' }),
      domain: '127.0.0.1',
    }).event;
    const res = await request(`${BASE}/verify`, { method: 'POST', body: { event } });
    expect(res.body.status).toBe('ERROR');
    expect(res.body.reason).toMatch(/relay tag/);
  });
});