import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { start } from '../mock_server';
import { eventId, verifyEvent } from '../lib/event';

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'nostr_auth.js');
const PORT = 8737;
const BASE = `http://127.0.0.1:${PORT}`;

function run(args, envExtra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...envExtra },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

describe('CLI', () => {
  let server;
  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
  });
  afterAll(() => server.close());

  it('shows help and exit 0', async () => {
    const out = await run(['--help']);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('nip07');
    expect(out.stdout).toContain('nip98');
  });

  it('exits 2 on unknown options', async () => {
    const out = await run(['--nope']);
    expect(out.status).toBe(2);
  });

  it('exits 2 for not-yet-implemented methods', async () => {
    const out = await run(['nip98', 'https://example.com']);
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/planned but not implemented/i);
  });

  it('prints a stable npub identity for a keyfile + domain', async () => {
    const keyfile = path.join(os.tmpdir(), `na-cli-${Date.now()}.key`);
    try {
      const a = await run(['nip07', 'pubkey', '--domain', 'example.com', '--keyfile', keyfile, '--json']);
      const b = await run(['nip07', 'pubkey', '--domain', 'example.com', '--keyfile', keyfile, '--json']);
      const ja = JSON.parse(a.stdout);
      const jb = JSON.parse(b.stdout);
      expect(a.status).toBe(0);
      expect(ja.npub).toBe(jb.npub);
      expect(ja.npub.startsWith('npub1')).toBe(true);
      expect(ja.pubkey).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.unlinkSync(keyfile);
    }
  });

  it('signs an event template without a callback', async () => {
    const out = await run([
      'nip07',
      '{"kind":22242,"tags":[["challenge","abc123"]],"content":""}',
      '--key',
      'ab'.repeat(32),
      '--json',
    ]);
    expect(out.status).toBe(0);
    const parsed = JSON.parse(out.stdout);
    expect(parsed.event.kind).toBe(22242);
    expect(parsed.event.id).toBe(eventId(parsed.event));
    expect(() => verifyEvent(parsed.event)).not.toThrow();
  });

  it('completes the challenge -> callback flow with exit 0', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const out = await run([
      'nip07',
      '--challenge',
      challenge.challenge,
      '--relay',
      BASE,
      '--callback',
      `${BASE}/verify`,
      '--key',
      'cd'.repeat(32),
      '--json',
    ]);
    expect(out.status).toBe(0);
    const parsed = JSON.parse(out.stdout);
    expect(parsed.response.status).toBe('OK');
  });

  it('exits 3 when the server rejects with status ERROR', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const args = [
      'nip07',
      '--challenge',
      challenge.challenge,
      '--relay',
      BASE,
      '--callback',
      `${BASE}/verify`,
      '--key',
      'ef'.repeat(32),
      '--json',
    ];
    await run(args);
    const replay = await run(args);
    expect(replay.status).toBe(3);
    expect(JSON.parse(replay.stdout).response.status).toBe('ERROR');
  });

  it('dry-run signs but leaves the challenge usable', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const dry = await run([
      'nip07',
      '--challenge',
      challenge.challenge,
      '--relay',
      BASE,
      '--callback',
      `${BASE}/verify`,
      '--key',
      '12'.repeat(32),
      '--dry-run',
      '--json',
    ]);
    expect(dry.status).toBe(0);
    expect(JSON.parse(dry.stdout).dryRun).toBe(true);

    const real = await run([
      'nip07',
      '--challenge',
      challenge.challenge,
      '--relay',
      BASE,
      '--callback',
      `${BASE}/verify`,
      '--key',
      '12'.repeat(32),
      '--json',
    ]);
    expect(real.status).toBe(0);
    expect(JSON.parse(real.stdout).response.status).toBe('OK');
  });
});