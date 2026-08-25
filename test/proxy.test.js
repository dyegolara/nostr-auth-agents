import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { signTemplate, buildChallengeEvent, submitSignedEvent } from '../lib/nip07';
import { proxyFor } from '../lib/transport';

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCb+/H21z5PKZdb
Bzxx1mDK3lyxwBlrsiAcp9DkSC7K6OwlQ455xBRBpAGrQ4DWGy0aS44wTUnpMkix
yNVqh2+qO5cJcJLLuHx2b6OdmKjladR9p8mPpJZ6rdtojiy7/tX3WX7x0gwHmrXE
/kMUYcgEMeBOADNgWyIpTJkx0yE1IvbLg0B4Gyz2XNZDCnLZgQFk7ExP1TMs5Xdc
mrfpBPGbqdp8TnUTrdsPqWOC5LZSJ5SJgXfOydJ3VuK1X9EvYaQHFqz8m7ph1Qzo
P4Z3b/tLrCUaqE9dW/Mdm5Bz0OwAb+PfehCBUMao7KiCJLJm1AZTqjcvNx3wT6qX
55dZ0QUjAgMBAAECggEAFH+hFivGK/gOxG8ogdtG4BIlw1Q34v/HGYzyNjXINHE0
q1b778OVV+T6NSwLT9fFbxmzx2Q4zNUHWZnHdhbzVT88g4iQOgZ2EMhuC4Vm2LM2
MgctRVu/TMLxPQXGGjSMoNNZi+TrIMqzjX5OiWyqMObvD8EV/1kqnZvL3BDfYdCQ
MCevsuRsb8q6k74EDCXw/+j97u1Dp6PCg/W0PrCWPkVZgxX5jSCkiEG/Nfnd+3ED
B9Cih5dc5QeSykiOR89uZv6gjSBTpUVkgQsXEY1stsV7n0fXK9/xP9QIXVjvhe91
Uf32gDxY4UwpyMtRZs7NUGNNpg4++3M0Vf2xv1slGQKBgQDcjjIgb1CxL3LLSFLu
sQVupkPFtu73W7uy1AiEFXrwqytfbiRYkFNcqwPmslmZd2wJI1moNiTE7lruECrc
HGPPwdo3mTuyWtfOwVr/bhSkuqmXAqQyuIg5R5c39rlp27n2b+4Tfpll+MScwjkD
0cn6s1B40X8WBQL1GOUKEIROOQKBgQC1DT3eQJRnxCUb3RQ7fgtUgbGzSkIMpcSv
kkUApPOKpCUEZeksuYFaeXHyWj0We/jOmIh+XjmV1rqY73o6TlCXCm0GznXXQwQl
PrLxsp8lZY/pbbZPZD9tkgd9niavurbuNcT0fRxCIJZKaN7Czkg1xQqpRB1Ue6KP
FivzX2ruOwKBgQCnNTJxfpLJUbSQwusExLXeljRpL2/pneUmBTPTl0lWLh66wZDS
h9B7P7e8bVgaTfxczS0KpsmndyD+vMkRiIBvIIMkhYpJhC96MwKfBcCmxlEOCFWd
kmLMMidFqUoWJBvO5jqzEtaPBVNhmKmK6MBczRbkEcdsVS5RzKbPw4famQKBgQCt
GSXnkhLRSsS36Rzo7E9k0kLVSc/wS6TKv6vdO9fk257Qn6bZrdowaCA7N29kSc7N
pyQIvYmM6qmogn13tVxzq/IlKcucrWQPP+zSDJb/qCR5Zv2A1jWWSqGCxmvyYy92
fE37+onD52gJaE5iLdr4HZVd09O+7B21c9s9aiLP9QKBgQC7EHpaynmP32PXkRje
2roOL8NbisgnHV6EwhDqdCA2q3/SdJ+7EGM7AwLTsOmWjqmKW2FwIKdNWMbjtJaI
/JkyL75YIToK59s1wz4eAWlpgtGYlS1ujXITfG+R8nXxFl7A89CoPbrZB7xOjZtW
avdwKIeZ6FQKVCyaTIEmLXTnwg==
-----END PRIVATE KEY-----
`;

const CERT = `-----BEGIN CERTIFICATE-----
MIIDCzCCAfOgAwIBAgIULghxtUZ1/hrBU8x0HwL7nqEOc3swDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDgyMTE2MjU0MloYDzIxMjYw
NzI4MTYyNTQyWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCb+/H21z5PKZdbBzxx1mDK3lyxwBlrsiAcp9DkSC7K
6OwlQ455xBRBpAGrQ4DWGy0aS44wTUnpMkixyNVqh2+qO5cJcJLLuHx2b6OdmKjl
adR9p8mPpJZ6rdtojiy7/tX3WX7x0gwHmrXE/kMUYcgEMeBOADNgWyIpTJkx0yE1
IvbLg0B4Gyz2XNZDCnLZgQFk7ExP1TMs5XdcmrfpBPGbqdp8TnUTrdsPqWOC5LZS
J5SJgXfOydJ3VuK1X9EvYaQHFqz8m7ph1QzoP4Z3b/tLrCUaqE9dW/Mdm5Bz0OwA
b+PfehCBUMao7KiCJLJm1AZTqjcvNx3wT6qX55dZ0QUjAgMBAAGjUzBRMB0GA1Ud
DgQWBBRH3qmeFT8fXLHCil+tvyBHrLKg+zAfBgNVHSMEGDAWgBRH3qmeFT8fXLHC
il+tvyBHrLKg+zAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB7
xr+KOOYt+JBwHDlRYfLZX2wJUXFHvxwKM7oXGWJzJ2udu1wAcNg4x4YR6U8fMgOu
ZJTEILRYZ7E6qxcSPr0wlR4CgjH9EpS45tsfamQ+coOqSn4OqFuTZKmeqyx6yao3
Ep+ZVlumI1ZItrzoG106gEp9iP8pMCHrsDnHqQ92+5zNqg3m7BM7sDGO8xcYtBfF
FBzLeHcYNhtSjTqjPpulRch3qxbwGRSDH3iyhAR1+pssadGRAHoO/oiWF2AZ6MVt
qNLknLU+xT1byR7+hxJNLmR1WCWXpkctASxaPqxS/u2wiYua4HWAz630tnnm3PIu
KHDGpZ2JC5dZVBTITiL1
-----END CERTIFICATE-----
`;

const PROXY_ENV = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED'];

function signedEvent() {
  return signTemplate({
    template: buildChallengeEvent({ challenge: 'proxy-challenge', relay: '' }),
    domain: '127.0.0.1',
    key: 'ab'.repeat(32),
  }).event;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function startHttpOrigin() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK' }));
    });
  });
  return { server, requests };
}

function startHttpsOrigin() {
  const requests = [];
  const server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK' }));
    });
  });
  return { server, requests };
}

function startProxy() {
  const requests = [];
  const server = http.createServer();
  server.on('connect', (req, clientSocket, head) => {
    requests.push({ method: 'CONNECT', target: req.url });
    const [host, port] = req.url.split(':');
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  server.on('request', (req, res) => {
    requests.push({ method: req.method, target: req.url });
    const target = new URL(req.url);
    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method: req.method,
        headers: { ...req.headers, Host: target.host },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  return { server, requests };
}

describe('callback proxy routing', () => {
  let httpOrigin;
  let httpsOrigin;
  let proxy;

  beforeAll(async () => {
    httpOrigin = startHttpOrigin();
    httpsOrigin = startHttpsOrigin();
    proxy = startProxy();
    await Promise.all([listen(httpOrigin.server), listen(httpsOrigin.server), listen(proxy.server)]);
  });

  afterAll(() => {
    httpOrigin.server.close();
    httpsOrigin.server.close();
    proxy.server.close();
  });

  afterEach(() => {
    for (const name of PROXY_ENV) delete process.env[name];
    httpOrigin.requests.length = 0;
    httpsOrigin.requests.length = 0;
    proxy.requests.length = 0;
  });

  it('resolves the proxy for a protocol from env, with lowercase fallback', () => {
    process.env.HTTP_PROXY = 'http://a.example:1';
    process.env.http_proxy = 'http://b.example:2';
    expect(proxyFor('http:').hostname).toBe('a.example');
    delete process.env.HTTP_PROXY;
    expect(proxyFor('http:').hostname).toBe('b.example');

    process.env.HTTPS_PROXY = 'http://c.example:3';
    expect(proxyFor('https:').hostname).toBe('c.example');
  });

  it('ignores non-http(s) proxy schemes and unset variables', () => {
    expect(proxyFor('http:')).toBe(null);
    process.env.HTTP_PROXY = 'socks5://127.0.0.1:1080';
    expect(proxyFor('http:')).toBe(null);
    process.env.HTTP_PROXY = 'not a url';
    expect(proxyFor('http:')).toBe(null);
  });

  it('routes an http callback through HTTP_PROXY (absolute-form)', async () => {
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.server.address().port}`;
    const verdict = await submitSignedEvent(`http://127.0.0.1:${httpOrigin.server.address().port}/verify`, signedEvent());
    expect(verdict.ok).toBe(true);
    expect(verdict.response.status).toBe('OK');
    expect(httpOrigin.requests).toHaveLength(1);
    expect(proxy.requests.some((r) => r.method === 'POST')).toBe(true);
  });

  it('routes an http callback through lowercase http_proxy', async () => {
    process.env.http_proxy = `http://127.0.0.1:${proxy.server.address().port}`;
    const verdict = await submitSignedEvent(`http://127.0.0.1:${httpOrigin.server.address().port}/verify`, signedEvent());
    expect(verdict.ok).toBe(true);
    expect(proxy.requests.some((r) => r.method === 'POST')).toBe(true);
  });

  it('routes an https callback through HTTPS_PROXY (CONNECT tunnel)', async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.server.address().port}`;
    const verdict = await submitSignedEvent(`https://localhost:${httpsOrigin.server.address().port}/verify`, signedEvent());
    expect(verdict.ok).toBe(true);
    expect(verdict.response.status).toBe('OK');
    expect(httpsOrigin.requests).toHaveLength(1);
    expect(proxy.requests.some((r) => r.method === 'CONNECT')).toBe(true);
  });

  it('routes an https callback through lowercase https_proxy', async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.env.https_proxy = `http://127.0.0.1:${proxy.server.address().port}`;
    const verdict = await submitSignedEvent(`https://localhost:${httpsOrigin.server.address().port}/verify`, signedEvent());
    expect(verdict.ok).toBe(true);
    expect(proxy.requests.some((r) => r.method === 'CONNECT')).toBe(true);
  });

  it('leaves a direct connection unchanged when the proxy scheme is unsupported', async () => {
    process.env.HTTP_PROXY = 'socks5://127.0.0.1:1';
    const verdict = await submitSignedEvent(`http://127.0.0.1:${httpOrigin.server.address().port}/verify`, signedEvent());
    expect(verdict.ok).toBe(true);
    expect(httpOrigin.requests).toHaveLength(1);
    expect(proxy.requests).toHaveLength(0);
  });
});
