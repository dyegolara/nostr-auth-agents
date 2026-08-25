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
const { resolveMasterSecret, deriveLinkingKey, toNpub } = require('./keys');
const { signEvent } = require('./event');
const { getPublicKey } = require('./schnorr');
const { request: defaultRequest, VERSION, USER_AGENT } = require('./transport');

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

function doRequest(urlInput, options) {
  return defaultRequest(urlInput, options);
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
// `options.transport` injects the HTTP seam (a function with the same
// signature as lib/transport.request) so tests and proxy routing stay
// offline; `options.timeout` overrides the callback timeout.
async function submitSignedEvent(callbackUrl, event, options = {}) {
  const transport = options.transport || defaultRequest;
  const result = await transport(callbackUrl, {
    body: JSON.stringify({ event }),
    ...(options.timeout ? { timeout: options.timeout } : {}),
  });
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