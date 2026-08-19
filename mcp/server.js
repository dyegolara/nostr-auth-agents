#!/usr/bin/env node
'use strict';
// Zero-dependency MCP server (stdio, JSON-RPC 2.0) exposing the nostr-auth
// signing tools. Uses only node built-ins + the vendored lib/ — boots from a
// clean clone with no `npm install`.
const readline = require('readline');
const {
  parseEventSpec,
  buildChallengeEvent,
  identityFor,
  signTemplate,
  submitSignedEvent,
} = require('../lib/nip07');

const VERSION = '1.0.0';
const SERVER_NAME = 'nostr-auth';
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-06-18'];
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const KEY_OPTS_SCHEMA = {
  single_key: { type: 'boolean', description: 'Use one global identity for all services (less private).' },
  key: { type: 'string', description: '64-char hex private key to use as master secret.' },
};

const TOOLS = [
  {
    name: 'nostr_nip07_pubkey',
    description:
      'Returns the Nostr identity (hex pubkey + npub) derived from the local master secret for a service domain. Equivalent to window.nostr.getPublicKey() without a browser extension.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Service domain used to derive the linking key.' },
        ...KEY_OPTS_SCHEMA,
      },
    },
  },
  {
    name: 'nostr_nip07_sign',
    description:
      'Signs a Nostr sign-in event (NIP-07 style) and optionally submits it to a service callback. Provide either an event template (event) or a challenge string (challenge). Returns the signed event and, when callback is set, the server verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        event: { type: 'object', description: 'Event template { kind, tags, content, created_at? }.' },
        challenge: { type: 'string', description: 'Sign-in challenge string; builds a kind-22242 AUTH event.' },
        relay: { type: 'string', description: 'Relay URL tag for the challenge event / domain hint.' },
        domain: { type: 'string', description: 'Service domain used to derive the linking key.' },
        callback: { type: 'string', description: 'URL to POST the signed event to (JSON body { event }).' },
        dry_run: { type: 'boolean', description: 'Sign but do NOT submit to the callback.' },
        ...KEY_OPTS_SCHEMA,
      },
      required: [],
    },
  },
];

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error };
}

function publicView(result, dryRun, extra) {
  const out = { domain: result.domain, pubkey: result.pubkeyX, npub: result.npub };
  if (result.event) out.event = result.event;
  if (dryRun !== undefined) out.dryRun = dryRun;
  return { ...out, ...(extra || {}) };
}

async function handleToolsCall(params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};

  if (name === 'nostr_nip07_pubkey') {
    const identity = identityFor({
      domain: args.domain || args.relay,
      singleKey: !!args.single_key,
      key: args.key || undefined,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({
        domain: identity.domain,
        pubkey: identity.pubkeyX,
        pubkeyCompressed: identity.pubkeyCompressed,
        npub: identity.npub,
        singleKey: identity.singleKey,
      }, null, 2) }],
    };
  }

  if (name === 'nostr_nip07_sign') {
    try {
      let template;
      if (args.challenge) template = buildChallengeEvent({ challenge: args.challenge, relay: args.relay });
      else if (args.event != null) template = parseEventSpec(args.event);
      else return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide "event" (template) or "challenge"' }, null, 2) }], isError: true };

      const result = signTemplate({
        template,
        domain: args.domain || args.relay,
        singleKey: !!args.single_key,
        key: args.key || undefined,
      });

      if (args.dry_run) {
        return { content: [{ type: 'text', text: JSON.stringify(publicView(result, true), null, 2) }] };
      }
      if (!args.callback) {
        return { content: [{ type: 'text', text: JSON.stringify(publicView(result), null, 2) }] };
      }
      const verdict = await submitSignedEvent(args.callback, result.event);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(publicView(result, undefined, { httpStatus: verdict.httpStatus, response: verdict.response, ok: verdict.ok }), null, 2),
        }],
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: e.message }, null, 2) }],
        isError: true,
      };
    }
  }

  return rpcError(null, -32602, `Unknown tool: ${name}`);
}

async function handleRequest(msg) {
  if (msg == null || typeof msg !== 'object' || Array.isArray(msg)) return null;
  if (msg.jsonrpc !== '2.0') return null;
  const isNotification = msg.id === undefined;
  const method = msg.method;

  if (isNotification) return null;

  switch (method) {
    case 'initialize': {
      const requested =
        msg.params && typeof msg.params.protocolVersion === 'string'
          ? msg.params.protocolVersion
          : null;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: SERVER_NAME, version: VERSION },
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
      };
    case 'tools/call': {
      const result = await handleToolsCall(msg.params);
      return { jsonrpc: '2.0', id: msg.id, result };
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${method}`);
  }
}

async function processLine(raw, write) {
  const line = raw.trim();
  if (!line) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    write(JSON.stringify(rpcError(null, -32700, 'Parse error')) + '\n');
    return;
  }

  if (Array.isArray(msg)) {
    const responses = [];
    for (const item of msg) {
      const response = await handleRequest(item);
      if (response) responses.push(response);
    }
    if (responses.length) write(JSON.stringify(responses) + '\n');
    return;
  }

  if (msg == null || typeof msg !== 'object' || typeof msg.method !== 'string') {
    write(JSON.stringify(rpcError(msg && msg.id, -32600, 'Invalid Request')) + '\n');
    return;
  }

  const response = await handleRequest(msg);
  if (response) write(JSON.stringify(response) + '\n');
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (s) => process.stdout.write(s);
  rl.on('line', (line) => {
    processLine(line, write).catch((e) => {
      write(JSON.stringify(rpcError(null, -32603, `Internal error: ${e.message}`)) + '\n');
    });
  });
  console.error(`[nostr-auth-mcp] MCP server (${SERVER_NAME}@${VERSION}) running on stdio`);
}

main();