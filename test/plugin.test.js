import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PKG = readJSON('package.json');
const PLUGIN_MANIFESTS = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.cursor-plugin/plugin.json'];

function bootMcpAndListTools() {
  return new Promise((resolve, reject) => {
    const mcpJson = readJSON('.mcp.json');
    const entry = mcpJson.mcpServers['nostr-auth'];
    const child = spawn(entry.command, entry.args, { cwd: ROOT });
    let buffer = '';
    let tools = [];

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.result && Array.isArray(msg.result.tools)) tools = msg.result.tools.map((t) => t.name);
        } catch (e) { /* ignore */ }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);

    const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
    child.stdin.on('error', () => {});
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), 200);

    setTimeout(() => {
      child.kill();
      resolve(tools);
    }, 1500);
  });
}

describe('plugin manifests', () => {
  it('validates the Claude, Codex, and Cursor plugin manifests', () => {
    for (const rel of PLUGIN_MANIFESTS) {
      const manifest = readJSON(rel);
      expect(manifest.name).toBe('nostr-auth');
      expect(manifest.displayName).toBe('Nostr Auth');
      expect(manifest.version).toBe(PKG.version);
      expect(typeof manifest.description).toBe('string');
      expect(manifest.description.length).toBeGreaterThan(0);
      expect(manifest.license).toBe('MIT');
    }
  });

  it('validates the ClawHub manifest and its configSchema', () => {
    const manifest = readJSON('openclaw.plugin.json');
    expect(manifest.id).toBe(PKG.name);
    expect(manifest.name).toBe('Nostr Auth');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.version).toBe(PKG.version);
    expect(manifest.configSchema).toEqual({ type: 'object', additionalProperties: false, properties: {} });
  });

  it('keeps versions in sync with package.json across all manifests', () => {
    for (const rel of PLUGIN_MANIFESTS) {
      expect(readJSON(rel).version).toBe(PKG.version);
    }
    expect(readJSON('openclaw.plugin.json').version).toBe(PKG.version);

    const skill = readText('skills/nostr-auth/SKILL.md');
    expect(skill).toContain(`version: ${PKG.version}`);
    expect(skill).toMatch(/^---\nname: nostr-auth\n/);
    expect(skill).toContain('description:');
  });

  it('validates the skills.sh grouping metadata', () => {
    const config = readJSON('skills.sh.json');
    expect(config.$schema).toBe('https://skills.sh/schemas/skills.sh.schema.json');
    expect(Array.isArray(config.groupings)).toBe(true);
    expect(config.groupings.some((g) => (g.skills || []).includes('nostr-auth'))).toBe(true);
  });

  it('boots the MCP server from .mcp.json and lists the sign-in tools', async () => {
    const mcpJson = readJSON('.mcp.json');
    expect(mcpJson.mcpServers['nostr-auth'].command).toBe('node');
    expect(mcpJson.mcpServers['nostr-auth'].args).toEqual(['mcp/server.js']);

    const tools = await bootMcpAndListTools();
    expect(tools).toContain('nostr_nip07_sign');
    expect(tools).toContain('nostr_nip07_pubkey');
  });
});
