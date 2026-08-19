'use strict';
// Mock "Sign in with Nostr" service — local, cost-free self-testing only.
// Emulates the NIP-07-style flow a website performs:
//   GET  /challenge -> { challenge, template }  (event template to sign)
//   POST /verify    -> { event }  -> verifies kind-22242 sig over its id,
//                                    challenge freshness, and replies
//                                    {"status":"OK"} or {"status":"ERROR",...}
//
// No network egress, no relay, no wallet.
const http = require('http');
const crypto = require('crypto');
const { verifyEvent } = require('./lib/event');
const { getPublicKey } = require('./lib/schnorr');
const { toNpub } = require('./lib/keys');

function start(port = 8732) {
  const pendingChallenges = new Map();

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const relayUrl = `http://127.0.0.1:${port}`;

    try {
      if (u.pathname === '/challenge' && req.method === 'GET') {
        const challenge = crypto.randomBytes(16).toString('hex');
        pendingChallenges.set(challenge, Date.now());
        return send(200, {
          challenge,
          template: {
            kind: 22242,
            tags: [['relay', relayUrl], ['challenge', challenge]],
            content: '',
          },
        });
      }

      if (u.pathname === '/verify' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const event = parsed && parsed.event;
            if (!event || typeof event !== 'object') {
              return send(400, { status: 'ERROR', reason: 'missing event' });
            }
            verifyEvent(event); // throws -> caught below

            const challengeTag = (event.tags || []).find((t) => t && t[0] === 'challenge');
            const relayTag = (event.tags || []).find((t) => t && t[0] === 'relay');
            if (!challengeTag || !challengeTag[1]) {
              return send(400, { status: 'ERROR', reason: 'missing challenge tag' });
            }
            if (!pendingChallenges.delete(String(challengeTag[1]))) {
              return send(400, { status: 'ERROR', reason: 'unknown or already-used challenge' });
            }
            let hostOk = false;
            try {
              hostOk = new URL(String(relayTag && relayTag[1] || relayUrl)).hostname === new URL(relayUrl).hostname;
            } catch (e) { hostOk = false; }
            if (relayTag && relayTag[1] && !hostOk) {
              return send(400, { status: 'ERROR', reason: 'relay tag does not match this service' });
            }
            return send(200, { status: 'OK' });
          } catch (e) {
            return send(400, { status: 'ERROR', reason: e.message });
          }
        });
        return;
      }

      if (u.pathname === '/pubkey' && req.method === 'GET') {
        // Exposes the mock's own identity — useful to sanity-check cross
        // verification with the same lib (test-only).
        const key = crypto.randomBytes(32);
        return send(200, { pubkey: getPublicKey(key).xBytes.toString('hex'), npub: toNpub(key) });
      }

      send(404, { status: 'ERROR', reason: 'not found' });
    } catch (err) {
      console.error('[mock] handler error:', err);
      if (!res.headersSent) send(500, { status: 'ERROR', reason: 'server error' });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`[mock] nostr sign-in mock listening on http://127.0.0.1:${port}`);
  });
  return server;
}

if (require.main === module) {
  const port = parseInt(process.argv[2] || process.env.PORT || '8732', 10);
  start(port);
}

module.exports = { start };