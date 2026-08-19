'use strict';
// NIP-07 "Sign in with Nostr" flow for agents. Emulates, without a browser
// or extension, what window.nostr offers a website:
//
//   getPublicKey() -> expose the derived identity (hex + npub)
//   signEvent()    -> sign an event template with the derived key
//   challenge flow -> build a kind-22242 AUTH event, sign it, POST it to the
//                     service callback and return the server verdict.
//
// Network egress is limited to the final callback POST (no intermediate
// fetch by default). Key derivation mirrors LNURL-auth: HMAC-SHA256(master,
// serviceDomain), persisted master at ~/.config/nostr-auth/master.key.
const http = require('http');
const https = require('https');
const { resolveMasterSecret, deriveLinkingKey, toNpub } = require('./keys');
const { signEvent } = require('./event');
const { getPublicKey } = require('./schnorr');

const VERSION = '1.0.0';
const USER_AGENT = `nostr-auth/${VERSION} (+https://github.com/dyegolara/nostr-auth-agents)`;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;

function hostOf(urlInput) {
  try {
    return new URL(String(urlInput)).hostname;
  } catch (e) {
    return null;
  }
}

// Normalize a service identity string (domain) for key derivation.
function normalizeDomain(input) {
  if (!input || !String(input).trim()) return null;
  const stripped = String(input).trim().toLowerCase().replace(/^[/.]+/, '').replace(/[/.:]+$/, '');
  return hostOf(stripped.includes('://') ? stripped : `https://${stripped}`) || stripped;
}

function parseEventSpec(input) {
  if (typeof input === 'object' && input !== null) return input;
  const text = String(input || '').trim();
  if (!text) throw new Error('Missing event: pass a JSON event template or --challenge');
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Event template must be a JSON object');
  if (parsed.kind == null) throw new Error('Event template must include "kind"');
  if (parsed.tags != null && !Array.isArray(parsed.tags)) throw new Error('Event "tags" must be an array');
  return parsed;
}

// Kind-22242 challenge event (the classic "sign this to prove your key" flow
// used by Sign in with Nostr sites).
function buildChallengeEvent({ challenge, relay, kind }) {
  if (!challenge) throw new Error('--challenge is required for the challenge flow');
  const tags = [['challenge', String(challenge)]];
  if (relay) tags.push(['relay', String(relay)]);
  return { kind: kind != null ? Number(kind) : 22242, tags, content: '' };
}

// Resolve the identity used for a service domain.
function identityFor({ domain, singleKey, key, keyfile, generate }) {
  const master = resolveMasterSecret({ key, keyfile, generate });
  const normalized = normalizeDomain(domain) || 'nostr';
  const priv = deriveLinkingKey(master, normalized, singleKey);
  const pub = getPublicKey(priv);
  return {
    domain: singleKey ? '<single-key>' : normalized,
    linkingPriv: priv,
    pubkeyCompressed: pub.compressedHex,
    pubkeyX: pub.xBytes.toString('hex'),
    npub: toNpub(priv),
    singleKey: !!singleKey,
  };
}

function signTemplate({ template, domain, singleKey, key, keyfile, generate, now }) {
  const identity = identityFor({ domain, singleKey, key, keyfile, generate });
  const event = signEvent(template, identity.linkingPriv, { now });
  return { ...identity, event };
}

function doRequest(urlInput, { body, headers = {}, redirects = 0 }) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlInput);
    } catch (e) {
      return reject(new Error(`Invalid callback URL: ${urlInput}`));
    }
    const mod = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
    if (!mod) return reject(new Error(`Unsupported callback protocol: ${url.protocol}`));
    const payload = Buffer.from(body, 'utf8');
    headers = {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers,
    };
    const req = mod.request(
      url,
      { method: 'POST', headers, timeout: DEFAULT_TIMEOUT },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            return reject(new Error(`Too many redirects (max ${MAX_REDIRECTS}) from ${urlInput}`));
          }
          return resolve(doRequest(new URL(res.headers.location, url).toString(), { body, headers, redirects: redirects + 1 }));
        }
        if (res.statusCode === 0) return reject(new Error('No HTTP status from callback server'));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

function parseServerResponse({ status, body }) {
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    /* non-JSON */
  }
  // A JSON body carrying a "status" field is always a verdict: OK -> exit 0,
  // ERROR -> exit 3 (even when the server uses HTTP 4xx for rejection).
  if (parsed && typeof parsed === 'object' && parsed.status) {
    return { httpStatus: status, response: parsed, ok: parsed.status === 'OK' };
  }
  if (status < 200 || status >= 300 || parsed === null) {
    const err = new Error(`Callback returned non-JSON or HTTP ${status}`);
    err.code = 4;
    err.httpStatus = status;
    err.body = body;
    throw err;
  }
  return { httpStatus: status, response: parsed, ok: false };
}

// Submit a signed event to the login callback and parse the verdict.
async function submitSignedEvent(callbackUrl, event) {
  const result = await doRequest(callbackUrl, { body: JSON.stringify({ event }) });
  return parseServerResponse(result);
}

module.exports = {
  VERSION,
  USER_AGENT,
  hostOf,
  normalizeDomain,
  parseEventSpec,
  buildChallengeEvent,
  identityFor,
  signTemplate,
  submitSignedEvent,
  parseServerResponse,
  doRequest,
};