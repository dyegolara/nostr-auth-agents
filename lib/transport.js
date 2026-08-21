'use strict';
// Injected-able HTTP transport for the sign-in callback POST.
//
// This is the single network egress seam (ADR-0004): a plain function that
// POSTs a body to a URL and resolves to { status, body } or rejects with an
// error. Tests inject a local server (redirects, timeouts, proxies) or a fake
// transport to keep the whole suite offline.
//
// The default implementation uses only node:http / node:https and routes the
// POST through an HTTP(S) forward proxy when HTTP_PROXY / HTTPS_PROXY (or
// their lowercase forms) are set — no external dependencies.
const http = require('http');
const https = require('https');
const tls = require('tls');

const VERSION = '1.0.0';
const USER_AGENT = `nostr-auth/${VERSION} (+https://github.com/dyegolara/nostr-auth-agents)`;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;

// Resolve the forward proxy for a target protocol from the environment.
// Returns a parsed http(s) URL, or null when unset / malformed / non-http(s).
function proxyFor(protocol) {
  const names =
    protocol === 'https:'
      ? ['HTTPS_PROXY', 'https_proxy']
      : ['HTTP_PROXY', 'http_proxy'];
  for (const name of names) {
    const raw = process.env[name];
    if (!raw) continue;
    let url;
    try {
      url = new URL(raw);
    } catch (e) {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    return url;
  }
  return null;
}

function proxyPort(proxyUrl) {
  if (proxyUrl.port) return Number(proxyUrl.port);
  return proxyUrl.protocol === 'https:' ? 443 : 80;
}

// POST to an http target through an http(s) forward proxy using the
// absolute-form request line (RFC 7230 section 5.3.2).
function requestViaAbsoluteForm(proxyUrl, targetUrl, headers, timeout, onResponse) {
  const mod = proxyUrl.protocol === 'https:' ? https : http;
  return mod.request(
    {
      protocol: proxyUrl.protocol,
      host: proxyUrl.hostname,
      port: proxyPort(proxyUrl),
      method: 'POST',
      path: targetUrl.href,
      headers: { ...headers, Host: targetUrl.host },
      timeout,
    },
    onResponse,
  );
}

// POST to an https target through an http(s) forward proxy using a CONNECT
// tunnel, then TLS to the origin (RFC 7231 section 4.3.6).
function requestViaConnect(proxyUrl, targetUrl, payload, headers, timeout, onResponse, reject) {
  const proxyMod = proxyUrl.protocol === 'https:' ? https : http;
  const targetPort = Number(targetUrl.port) || 443;
  const connectReq = proxyMod.request({
    host: proxyUrl.hostname,
    port: proxyPort(proxyUrl),
    method: 'CONNECT',
    path: `${targetUrl.hostname}:${targetPort}`,
    headers: { Host: `${targetUrl.hostname}:${targetPort}` },
    timeout,
  });
  connectReq.on('connect', (res, socket) => {
    if (res.statusCode !== 200) {
      socket.destroy();
      return reject(new Error(`Proxy CONNECT failed: HTTP ${res.statusCode}`));
    }
    const tlsSocket = tls.connect({ socket, servername: targetUrl.hostname }, () => {
      const req = https.request(
        {
          host: targetUrl.hostname,
          port: targetPort,
          path: targetUrl.pathname + targetUrl.search,
          method: 'POST',
          headers,
          timeout,
          createConnection: () => tlsSocket,
        },
        onResponse,
      );
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
      req.on('error', reject);
      req.end(payload);
    });
    tlsSocket.on('error', reject);
  });
  connectReq.on('timeout', () => connectReq.destroy(new Error('Request timed out')));
  connectReq.on('error', reject);
  connectReq.end();
}

function request(urlInput, { body, headers = {}, redirects = 0, timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlInput);
    } catch (e) {
      return reject(new Error(`Invalid callback URL: ${urlInput}`));
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return reject(new Error(`Unsupported callback protocol: ${url.protocol}`));
    }
    const payload = Buffer.from(body, 'utf8');
    headers = {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers,
    };

    const onResponse = (res) => {
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
    };

    const proxy = proxyFor(url.protocol);
    let req;
    if (proxy && url.protocol === 'http:') {
      req = requestViaAbsoluteForm(proxy, url, headers, timeout, onResponse);
    } else if (proxy && url.protocol === 'https:') {
      return requestViaConnect(proxy, url, payload, headers, timeout, onResponse, reject);
    } else {
      const mod = url.protocol === 'https:' ? https : http;
      req = mod.request(url, { method: 'POST', headers, timeout }, onResponse);
    }
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

module.exports = { request, proxyFor, VERSION, USER_AGENT, MAX_REDIRECTS, DEFAULT_TIMEOUT };