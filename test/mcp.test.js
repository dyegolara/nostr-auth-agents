import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { start } from '../mock_server';

const ROOT = path.join(__dirname, '..');
const MCP = path.join(ROOT, 'mcp', 'server.js');
const PORT = 8738;
const BASE = `http://127.0.0.1:${PORT}`;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

describe('MCP server', () => {
  let child;
  let server;
  let queue = [];
  let nextId = 1;
  let output = '';

  const send = (method, params, write = true) =>
    new Promise((resolve) => {
      const id = nextId++;
      queue.push({ id, resolve });
      if (write) {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      }
    });

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => server.once('listening', resolve));
    child = spawn(process.execPath, [MCP], { cwd: ROOT });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        output += line + '\n';
        try {
          const msg = JSON.parse(line);
          const pending = queue.find((q) => q.id === msg.id);
          if (pending) {
            queue = queue.filter((q) => q.id !== msg.id);
            pending.resolve(msg);
          }
        } catch (e) { /* keep scanning */ }
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  afterAll(() => {
    server.close();
    child.kill();
  });

  it('tools/list exposes the nostr tools', async () => {
    const msg = await send('tools/list', {});
    const names = msg.result.tools.map((t) => t.name);
    expect(names).toContain('nostr_nip07_sign');
    expect(names).toContain('nostr_nip07_pubkey');
  });

  it('nostr_nip07_pubkey returns an npub identity', async () => {
    const msg = await send('tools/call', {
      name: 'nostr_nip07_pubkey',
      arguments: { domain: 'example.com', key: 'ab'.repeat(32) },
    });
    const text = msg.result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.npub.startsWith('npub1')).toBe(true);
  });

  it('nostr_nip07_sign runs the full challenge -> callback flow', async () => {
    const challenge = await getJSON(`${BASE}/challenge`);
    const msg = await send('tools/call', {
      name: 'nostr_nip07_sign',
      arguments: {
        challenge: challenge.challenge,
        relay: BASE,
        callback: `${BASE}/verify`,
        key: 'cd'.repeat(32),
      },
    });
    const parsed = JSON.parse(msg.result.content[0].text);
    expect(parsed.response.status).toBe('OK');
    expect(parsed.ok).toBe(true);
  });

  it('unknown tools are rejected with an error', async () => {
    const msg = await send('tools/call', { name: 'nope', arguments: {} });
    expect(msg.result.error.message).toMatch(/Unknown tool/);
    expect(msg.result.content).toBeUndefined();
  });
});