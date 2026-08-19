#!/usr/bin/env node
'use strict';
// nostr-auth — Nostr sign-in for LLM coding agents.
//
// Auth-only: signs sign-in events with a secp256k1 (BIP-340) key derived from
// a local master secret. No wallet, no browser extension, no relay account.
//
// First method implemented: NIP-07-style "Sign in with Nostr" challenge flow
// (mirrors the LNURL-auth UX). More methods coming soon:
//   nip98  - NIP-98 HTTP Auth (Authorization: Nostr <event>)
//   nip42  - NIP-42 relay AUTH over websockets
//   nip05  - NIP-05 identifier resolution/verification
const {
  parseEventSpec,
  buildChallengeEvent,
  hostOf,
  signTemplate,
  submitSignedEvent,
  identityFor,
} = require('./lib/nip07');

const VERSION = '1.0.0';
const METHODS = ['nip07'];
const COMING_SOON = ['nip98', 'nip42', 'nip05'];

const USAGE = `Usage:
  nostr-auth nip07 [event-json] [options]          sign a NIP-07 sign-in event
  nostr-auth nip07 pubkey [options]                print the derived identity (hex + npub)
  nostr-auth nip07 --challenge <str> [options]     build a kind-22242 sign-in event

Methods available now: ${METHODS.join(', ')}
Coming soon: ${COMING_SOON.join(', ')}

Options:
  --event <json>      Event template JSON ({"kind":N,"tags":[[...]],"content":""})
  --challenge <str>   Sign-in challenge string (builds a kind-22242 event)
  --relay <url>       Relay tag for the challenge event / domain hint for derivation
  --domain <d>        Service domain used to derive the linking key
  --callback <url>    POST the signed event (JSON) to this URL and print the verdict
  --dry-run           Sign but do NOT submit to the callback
  --json              Machine-readable JSON output on stdout
  --key <hex>         64-char hex private key to use as master secret
  --keyfile <path>    Keyfile path (default ~/.config/nostr-auth/master.key)
  --keyout <path>     Where to persist a freshly generated master secret
  --generate          Force-generate a new master secret, overwriting the keyfile
  --single-key        Use one global identity for all services (less private)
  -v, --verbose       Verbose logging
  -q, --quiet         Suppress progress logs
  -h, --help          Show this help
  --version           Print version

Exit codes:
  0  login accepted ({"status":"OK"}) or operation completed
  1  client-side error (bad event, invalid key, network failure)
  2  usage error (no method/args, unknown option)
  3  server responded {"status":"ERROR","reason":"..."}
  4  server responded with non-200 HTTP or non-JSON body
`;

function parseArgs(argv) {
  const opts = {
    singleKey: false,
    dryRun: false,
    json: false,
    generate: false,
    verbose: false,
    quiet: false,
    _: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const pair = () => {
      const v = argv[++i];
      if (v === undefined) {
        const e = new Error(`Missing value for ${a}`);
        e.exitCode = 2;
        throw e;
      }
      return v;
    };
    switch (a) {
      case '--event': opts.event = pair(); break;
      case '--challenge': opts.challenge = pair(); break;
      case '--relay': opts.relay = pair(); break;
      case '--domain': opts.domain = pair(); break;
      case '--callback': opts.callback = pair(); break;
      case '--key': opts.key = pair(); break;
      case '--keyfile': opts.keyfile = pair(); break;
      case '--keyout': opts.keyout = pair(); break;
      case '--kind': opts.kind = pair(); break;
      case '--generate': opts.generate = true; break;
      case '--single-key': opts.singleKey = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--json': opts.json = true; break;
      case '-v': case '--verbose': opts.verbose = true; break;
      case '-q': case '--quiet': opts.quiet = true; break;
      case '-h': case '--help': opts.help = true; break;
      case '--version': opts.version = true; break;
      default:
        if (a.startsWith('-')) {
          const e = new Error(`Unknown option: ${a}`);
          e.exitCode = 2;
          throw e;
        }
        opts._.push(a);
    }
  }
  return opts;
}

function log(opts, message) {
  if (!opts.quiet) console.error(message);
}

async function runNip07(opts) {
  const action = opts._[0] === 'pubkey' ? 'pubkey' : 'sign';

  if (action === 'pubkey') {
    const identity = identityFor({
      domain: opts.domain || opts.relay,
      singleKey: opts.singleKey,
      key: opts.key,
      keyfile: opts.keyfile || opts.keyout,
      generate: opts.generate,
    });
    const out = {
      domain: identity.domain,
      pubkey: identity.pubkeyX,
      pubkeyCompressed: identity.pubkeyCompressed,
      npub: identity.npub,
      singleKey: identity.singleKey,
    };
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else console.log(`domain : ${out.domain}\npubkey : ${out.pubkey}\nnpub   : ${out.npub}`);
    return 0;
  }

  // sign action
  let template;
  if (opts.challenge) {
    template = buildChallengeEvent({ challenge: opts.challenge, relay: opts.relay });
  } else {
    template = parseEventSpec(opts.event !== undefined ? opts.event : opts._[0]);
  }

  const domain =
    opts.domain || opts.relay || (opts.callback ? hostOf(opts.callback) : null);
  const result = signTemplate({
    template,
    domain,
    singleKey: opts.singleKey,
    key: opts.key,
    keyfile: opts.keyfile || opts.keyout,
    generate: opts.generate,
  });
  log(opts, `domain   : ${result.domain}`);
  log(opts, `pubkey   : ${result.pubkeyX}`);
  log(opts, `npub     : ${result.npub}`);
  log(opts, `event id : ${result.event.id}`);

  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({ domain: result.domain, pubkey: result.pubkeyX, npub: result.npub, event: result.event, dryRun: true }, null, 2));
    } else {
      console.log(JSON.stringify({ domain: result.domain, pubkey: result.pubkeyX, npub: result.npub, eventId: result.event.id, dryRun: true }));
    }
    return 0;
  }

  if (!opts.callback) {
    if (opts.json) console.log(JSON.stringify({ domain: result.domain, pubkey: result.pubkeyX, npub: result.npub, event: { ...result.event } }, null, 2));
    else console.log(JSON.stringify(result.event));
    log(opts, 'No --callback given: signature not submitted.');
    return 0;
  }

  log(opts, `submitting signed event to ${opts.callback}`);
  const verdict = await submitSignedEvent(opts.callback, result.event);
  if (opts.json) {
    console.log(JSON.stringify({ domain: result.domain, pubkey: result.pubkeyX, eventId: result.event.id, httpStatus: verdict.httpStatus, response: verdict.response }, null, 2));
  } else {
    console.log(JSON.stringify(verdict.response));
  }
  return verdict.ok ? 0 : 3;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`nostr-auth: ${e.message}`);
    console.error('Run "nostr-auth --help" for usage.');
    process.exit(e.exitCode ?? 2);
  }

  if (opts.help || (!opts._.length && !opts.event && !opts.challenge)) {
    console.log(USAGE);
    return;
  }
  if (opts.version) {
    console.log(VERSION);
    return;
  }

  if (COMING_SOON.includes(opts._[0])) {
    console.error(`nostr-auth: method "${opts._[0]}" is planned but not implemented yet (first version ships NIP-07 only).`);
    process.exit(2);
  }

  if (opts._[0] === 'nip07') opts._.shift();

  try {
    const code = await runNip07(opts);
    if (code !== 0) process.exit(code);
  } catch (e) {
    console.error(`nostr-auth: ${e.message}`);
    process.exit(e.exitCode ?? e.code ?? 1);
  }
}

main();