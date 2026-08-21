import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { signTemplate, buildChallengeEvent, submitSignedEvent } from '../lib/nip07';

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'nostr_auth.js');

function signedEvent() {
  return signTemplate({
    template: buildChallengeEvent({ challenge: 'network-boundary', relay: '' }),
    domain: '127.0.0.1',
    key: 'ab'.repeat(32),
  }).event;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: ROOT, env: { ...process.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('callback network boundary', () => {
  let redirectServer;
  let loopServer;
  let hangingServer;
  let mixedServer;

  beforeAll(async () => {
    redirectServer = http.createServer((req, res) => {
      if (req.url === '/a') {
        res.writeHead(302, { Location: '/b' });
        return res.end();
      }
      if (req.url === '/b') {
        res.writeHead(302, { Location: '/c' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK' }));
    });
    loopServer = http.createServer((req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    });
    hangingServer = http.createServer(() => {});
    mixedServer = http.createServer((req, res) => {
      if (req.url === '/plain') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('not json');
      }
      if (req.url === '/reject') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ERROR', reason: 'nope' }));
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('gone');
    });
    await Promise.all([listen(redirectServer), listen(loopServer), listen(hangingServer), listen(mixedServer)]);
  });

  afterAll(() => {
    redirectServer.close();
    loopServer.close();
    hangingServer.close();
    mixedServer.close();
  });

  it('follows redirects up to the limit', async () => {
    const verdict = await submitSignedEvent(
      `http://127.0.0.1:${redirectServer.address().port}/a`,
      signedEvent(),
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.response.status).toBe('OK');
  });

  it('fails once the redirect limit is exceeded', async () => {
    await expect(
      submitSignedEvent(`http://127.0.0.1:${loopServer.address().port}/loop`, signedEvent()),
    ).rejects.toThrow(/Too many redirects/);
  });

  it('fails cleanly on unsupported protocols', async () => {
    await expect(submitSignedEvent('ftp://example.com/verify', signedEvent())).rejects.toThrow(
      /Unsupported callback protocol: ftp:/,
    );
  });

  it('fails cleanly on invalid URLs', async () => {
    await expect(submitSignedEvent('not a url', signedEvent())).rejects.toThrow(/Invalid callback URL/);
  });

  it('surfaces a timeout as a callback error', async () => {
    await expect(
      submitSignedEvent(`http://127.0.0.1:${hangingServer.address().port}/verify`, signedEvent(), { timeout: 200 }),
    ).rejects.toThrow(/Request timed out/);
  });

  it('treats non-JSON 2xx as exit-code-4', async () => {
    const err = await submitSignedEvent(
      `http://127.0.0.1:${mixedServer.address().port}/plain`,
      signedEvent(),
    ).catch((e) => e);
    expect(err.code).toBe(4);
    expect(err.message).toMatch(/non-JSON or HTTP 200/);
  });

  it('treats HTTP 4xx with a status ERROR verdict as exit-code-3 (ok:false)', async () => {
    const verdict = await submitSignedEvent(
      `http://127.0.0.1:${mixedServer.address().port}/reject`,
      signedEvent(),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.response.status).toBe('ERROR');
  });

  it('maps non-JSON 2xx to CLI exit 4 and 4xx ERROR to CLI exit 3', async () => {
    const port = mixedServer.address().port;
    const plain = await runCli(['nip07', '--challenge', 'abc', '--relay', `http://127.0.0.1:${port}`, '--callback', `http://127.0.0.1:${port}/plain`, '--key', 'ab'.repeat(32), '--json']);
    expect(plain.status).toBe(4);
    expect(plain.stderr).toMatch(/non-JSON or HTTP 200/);

    const reject = await runCli(['nip07', '--challenge', 'abc', '--relay', `http://127.0.0.1:${port}`, '--callback', `http://127.0.0.1:${port}/reject`, '--key', 'ab'.repeat(32), '--json']);
    expect(reject.status).toBe(3);
    expect(JSON.parse(reject.stdout).response.status).toBe('ERROR');
  });
});
