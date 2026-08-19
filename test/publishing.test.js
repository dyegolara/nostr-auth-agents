import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { start } from '../mock_server';

const ROOT = path.join(__dirname, '..');
const PORT = 8739;
const PORTABLE_HELPER = path.join(ROOT, 'skills', 'nostr-auth', 'scripts', 'nostr_auth.js');
const ROOT_CLI = path.join(ROOT, 'nostr_auth.js');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

function runNode(script, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('publishing artifacts', () => {
  let server;

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  afterAll(() => server.close());

  it('limits the npm artifact to runtime and distribution files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.engines.node).toBe('>=20.19.0');
    expect(pkg.files).toEqual(['nostr_auth.js', 'lib/', 'mcp/server.js', 'SKILL.md', 'README.md', 'LICENSE']);
    expect(pkg.dependencies).toEqual({});
    for (const file of pkg.files.filter((entry) => !entry.endsWith('/'))) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  it('ships valid skills.sh grouping metadata', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills.sh.json'), 'utf8'));
    expect(config.$schema).toBe('https://skills.sh/schemas/skills.sh.schema.json');
    expect(config.groupings).toEqual([expect.objectContaining({ skills: ['nostr-auth'] })]);
  });

  it('ships an OpenClaw/ClawHub skill bundle with matching metadata', () => {
    const skillPath = path.join(ROOT, 'skills', 'nostr-auth', 'SKILL.md');
    const helperPath = path.join(ROOT, 'skills', 'nostr-auth', 'scripts', 'nostr_auth.js');
    const content = fs.readFileSync(skillPath, 'utf8');
    expect(content).toMatch(/^---\nname: nostr-auth\n/);
    expect(content).toContain('description:');
    expect(content).toContain('version: 1.0.0');
    expect(fs.statSync(helperPath).mode & 0o111).toBeTruthy();
  });

  it('runs the portable bundle through a local sign-in roundtrip', async () => {
    const challenge = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
    const keyfile = path.join(os.tmpdir(), `nostr-auth-publishing-${Date.now()}.key`);
    try {
      const result = await runNode(
        PORTABLE_HELPER,
        ['--challenge', challenge.challenge, '--relay', `http://127.0.0.1:${PORT}`, '--callback', `http://127.0.0.1:${PORT}/verify`, '--json'],
        { NOSTR_AUTH_KEYFILE: keyfile },
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).status).toBe('OK');
      expect((fs.statSync(keyfile).mode & 0o777).toString(8)).toBe('600');
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });

  it('dry-run from the bundle leaves the challenge available', async () => {
    const challenge = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
    const keyfile = path.join(os.tmpdir(), `nostr-auth-publishing-dry-${Date.now()}.key`);
    try {
      const dry = await runNode(
        PORTABLE_HELPER,
        ['--challenge', challenge.challenge, '--relay', `http://127.0.0.1:${PORT}`, '--callback', `http://127.0.0.1:${PORT}/verify`, '--dry-run', '--json'],
        { NOSTR_AUTH_KEYFILE: keyfile },
      );
      expect(dry.status).toBe(0);
      expect(JSON.parse(dry.stdout).dryRun).toBe(true);
      const real = await runNode(
        PORTABLE_HELPER,
        ['--challenge', challenge.challenge, '--relay', `http://127.0.0.1:${PORT}`, '--callback', `http://127.0.0.1:${PORT}/verify`, '--json'],
        { NOSTR_AUTH_KEYFILE: keyfile },
      );
      expect(real.status).toBe(0);
      expect(JSON.parse(real.stdout).status).toBe('OK');
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });

  it('the portable bundle derives the same identity as the root CLI', async () => {
    const keyfile = path.join(os.tmpdir(), `nostr-auth-publishing-drift-${Date.now()}.key`);
    try {
      const env = { NOSTR_AUTH_KEYFILE: keyfile };
      const rootPub = await runNode(ROOT_CLI, ['nip07', 'pubkey', '--domain', 'example.com', '--json'], env);
      const bundlePub = await runNode(PORTABLE_HELPER, ['pubkey', '--domain', 'example.com', '--json'], env);
      expect(rootPub.status).toBe(0);
      expect(bundlePub.status).toBe(0);
      expect(JSON.parse(rootPub.stdout).npub).toBe(JSON.parse(bundlePub.stdout).npub);
      expect(JSON.parse(rootPub.stdout).pubkey).toBe(JSON.parse(bundlePub.stdout).pubkey);
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });
});