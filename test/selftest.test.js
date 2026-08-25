import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { start } from '../mock_server';

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'nostr_auth.js');
const PORT = 8740;
const BASE = `http://127.0.0.1:${PORT}`;

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
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

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request(
      u,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

function tmpKeyfile() {
  return path.join(os.tmpdir(), `nostr-auth-selftest-${Date.now()}-${Math.random().toString(36).slice(2)}.key`);
}

describe('self-test e2e', () => {
  let server;
  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
  });
  afterAll(() => server.close());

  it('--generate overwrites an existing keyfile', async () => {
    const keyfile = tmpKeyfile();
    try {
      fs.writeFileSync(keyfile, 'aa'.repeat(32));
      const out = await run(['nip07', 'pubkey', '--keyfile', keyfile, '--generate', '--json']);
      expect(out.status).toBe(0);
      const content = fs.readFileSync(keyfile, 'utf8').trim();
      expect(content).toMatch(/^[0-9a-f]{64}$/);
      expect(content).not.toBe('aa'.repeat(32));
      expect(JSON.parse(out.stdout).pubkey).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });

  it('rejects odd-length hex with a client error (exit 1)', async () => {
    const out = await run(['nip07', 'pubkey', '--key', 'abc', '--json']);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/odd length/i);
  });

  it('a tampered sign-in challenge fails verification', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const signed = await run([
      'nip07', '--challenge', challenge.challenge, '--relay', BASE,
      '--key', 'ab'.repeat(32), '--dry-run', '--json',
    ]);
    expect(signed.status).toBe(0);
    const event = JSON.parse(signed.stdout).event;
    event.sig = 'ff'.repeat(64);
    const res = await postJSON(`${BASE}/verify`, { event });
    expect(res.body.status).toBe('ERROR');
  });

  it('--dry-run signs but does not authenticate', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const dry = await run([
      'nip07', '--challenge', challenge.challenge, '--relay', BASE,
      '--callback', `${BASE}/verify`, '--key', 'cd'.repeat(32), '--dry-run', '--json',
    ]);
    expect(dry.status).toBe(0);
    const parsed = JSON.parse(dry.stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.httpStatus).toBeUndefined();
    expect(parsed.response).toBeUndefined();

    const real = await run([
      'nip07', '--challenge', challenge.challenge, '--relay', BASE,
      '--callback', `${BASE}/verify`, '--key', 'cd'.repeat(32), '--json',
    ]);
    expect(real.status).toBe(0);
    expect(JSON.parse(real.stdout).response.status).toBe('OK');
  });

  it('derives a deterministic identity per service domain', async () => {
    const keyfile = tmpKeyfile();
    try {
      const a = await run(['nip07', 'pubkey', '--domain', 'example.com', '--keyfile', keyfile, '--json']);
      const b = await run(['nip07', 'pubkey', '--domain', 'example.com', '--keyfile', keyfile, '--json']);
      const c = await run(['nip07', 'pubkey', '--domain', 'other.net', '--keyfile', keyfile, '--json']);
      expect(a.status).toBe(0);
      expect(JSON.parse(a.stdout).npub).toBe(JSON.parse(b.stdout).npub);
      expect(JSON.parse(a.stdout).npub).not.toBe(JSON.parse(c.stdout).npub);
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });

  it('rejects a replayed challenge (exit 3)', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const args = [
      'nip07', '--challenge', challenge.challenge, '--relay', BASE,
      '--callback', `${BASE}/verify`, '--key', 'ef'.repeat(32), '--json',
    ];
    const first = await run(args);
    expect(first.status).toBe(0);
    const replay = await run(args);
    expect(replay.status).toBe(3);
    expect(JSON.parse(replay.stdout).response.status).toBe('ERROR');
  });
});
