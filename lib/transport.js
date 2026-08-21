'use strict';
// Injected-able HTTP transport for the sign-in callback POST.
//
// This is the single network egress seam (ADR-0004): a plain function that
// POSTs a body to a URL and resolves to { status, body } or rejects with an
// error. Tests inject a local server (redirects, timeouts, proxies) or a fake
// transport to keep the whole suite offline.
//
// The default implementation uses only node:http / node:https. Proxy routing
// (HTTP_PROXY / HTTPS_PROXY) is layered on top without changing this seam.
const http = require('http');
const https = require('https');

const VERSION = '1.0.0';
const USER_AGENT = `nostr-auth/${VERSION} (+https://github.com/dyegolara/nostr-auth-agents)`;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;

function request(urlInput, { body, headers = {}, redirects = 0, timeout = DEFAULT_TIMEOUT } = {}) {
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
      { method: 'POST', headers, timeout },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            return reject(new Error(`Too many redirects (max ${MAX_REDIRECTS}) from ${urlInput}`));
          }
          return resolve(request(new URL(res.headers.location, url).toString(), { body, headers, redirects: redirects + 1, timeout }));
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

module.exports = { request, VERSION, USER_AGENT, MAX_REDIRECTS, DEFAULT_TIMEOUT };