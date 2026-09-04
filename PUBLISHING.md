# Pending publication — `nostr-auth` (NIP-07)

Updated: 2026-08-19

## Scope

This document is the publishing roadmap for `nostr-auth-agents`: it separates
what is already in place in the repository from the external actions the
maintainer must run manually, **step by step**, and ignores what is
deliberately not published. During this first commit no `publish`, login, or
marketplace submission was performed.

Structure mirrors the `lnurl-auth-agents` plan (same channels, same criteria),
with one difference: this project starts with **a single method** (NIP-07, the
closest to LNURL-auth) and will add methods in successive versions.
Publishability is reviewed and re-verified **little by little**: every
pluggable release in each channel below must repeat its evidence.

## Supported methods (version roadmap)

| Method | Status | Invocation | Target version |
|---|---|---|---|
| **NIP-07** sign-in (challenge event signing) | ✅ this commit | `nostr-auth nip07 [sign\|pubkey]` | 1.0.0 |
| NIP-98 HTTP Auth (`Authorization: Nostr <event>`) | 🔜 next | `nostr-auth nip98 <url>` | 1.1.0 |
| NIP-42 relay AUTH (websocket) | 🔜 | `nostr-auth nip42 <relay>` | 1.2.0 |
| NIP-05 identifier resolution | 🔜 | `nostr-auth nip05 <nip05>` | 1.3.0 |

Each new method = a new subcommand in the same binary/bundle + a version bump
+ re-running the evidence in the "Evidence executed" section and the
preflights of the affected channels.

## Changes made in this first commit

- `package.json` with `name: nostr-auth`, version `1.0.0`, a restrictive
  `files` list (11 files), `engines.node >= 20.19.0` and **zero runtime
  dependencies**.
- Pure cryptography in `lib/`: secp256k1 + BIP-340 schnorr in BigInt with
  `node:crypto` only for sha256/HMAC, NIP-01 events (serialize/id/sign),
  HMAC-SHA256 identity derivation per domain, and bech32 (npub/nsec).
- `nostr_auth.js`: CLI with per-method subcommands (`nip07` today; `nip98`,
  `nip42`, `nip05` "coming soon" — clear error output if invoked).
  Output/exit codes mirror lnurl-auth: logs to stderr, JSON to stdout,
  `0/1/2/3/4`.
- Zero-dependency MCP: `mcp/server.js` stdio JSON-RPC 2.0 with tools
  `nostr_nip07_sign` and `nostr_nip07_pubkey`. Boots from a clean clone with
  no `npm install` (the whole library is stdlib).
- `skills/nostr-auth/`: self-contained OpenClaw/ClawHub bundle with `SKILL.md`
  and `scripts/nostr_auth.js` (single-file portable helper, zero deps).
- `contrib/anthropics/skills/nostr-auth/SKILL.md`: educational variant with no
  executable scripts for `anthropics/skills`.
- Manifests: `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`,
  `.mcp.json`, `skills.sh.json` (up-to-date schema with `groupings`).
- `mock_server.js`: local "Sign in with Nostr" service (challenge → verify)
  for network-free, cost-free self-testing.
- CI (GitHub Actions): bundle syntax, MCP boot from a clean checkout,
  `npm pack --dry-run` and the full suite.
- Local suite: 8 files, 52 tests (official BIP-340 vectors + cross-check
  against `@noble/curves` as a devDependency).

## Evidence executed today

| Verification | Result |
|---|---|
| `npm install` (only devDeps) | OK |
| `npm audit --omit=dev` | OK — 0 runtime vulnerabilities |
| `npm test` | OK — 8 files, 52 tests |
| `npm pack --dry-run --json` | OK — `nostr-auth@1.0.0`, 11 intended files, `bundled: []` |
| `node --check` on CLI, MCP, portable bundle and `lib/` | OK |
| `npx skills@latest add . --list` | OK — discovers 1 skill: `nostr-auth` |
| Official BIP-340 vectors (vector 0) + `@noble/curves` cross-check | OK — in suite |
| `gh auth` / repo creation | OK — `dyegolara/nostr-auth-agents`, public |
| First push + CI | OK — `main`, CI green on the first run, topics set |
| `clawhub skill publish ... --dry-run` | OK — `would-publish`, 2 files, fingerprint `49edc3fe…` (2026-09-04) |
| `openclaw/agent-skills/scripts/validate-skills` | DISCARDED — PR rejected for lnurl-auth; this channel is ignored |
| `claude plugin validate . --strict` | DISCARDED — marketplace rejected for lnurl-auth; this channel is ignored |
| `clawhub skill publish` (real) | OK — uploaded, scan CLEAN, `pending.publication` (2026-09-04) |
| `npm login` / publish | OK — `nostr-auth@1.0.0` on the registry (2026-09-04) |

## 1. GitHub (base for everything)

**Status**: DONE — public repo `dyegolara/nostr-auth-agents`, default branch
`main`, first commit pushed, topics (`nostr`, `nip-07`, `authentication`,
`sign-in`, `agents`, `agent-skill`, `mcp`) and CI green on the first run.
Periodically check that CI stays green on future changes.

## 2. README + discoverability

**Status**: DONE — README with CI/MIT badges, per-platform installation, a
methods table with roadmap, self-test. No extra changes for now; it will be
reviewed per channel once each board (skills.sh, npm, ClawHub) is published to
add its real badges/links.

## 3. `openclaw/agent-skills` (PR)

Sources consulted:

- Repo: https://github.com/openclaw/agent-skills
- Rules: https://github.com/openclaw/agent-skills/blob/main/README.md
- Vision: https://github.com/openclaw/agent-skills/blob/main/VISION.md
- Validator: https://github.com/openclaw/agent-skills/blob/main/scripts/validate-skills

### Current requirements and status

| Requirement | Status | Evidence in this project |
|---|---|---|
| `skills/<name>/SKILL.md` | DONE | `skills/nostr-auth/SKILL.md` |
| YAML frontmatter with `name` and `description` | DONE | `name: nostr-auth` + valid description |
| Portable and reusable workflow | DONE | Single-file helper, zero npm deps |
| Explicit inputs, outputs, failures and limits | DONE | Sections of the bundle `SKILL.md` |
| MIT project license | DONE | `LICENSE` at the root |
| Helper in `scripts/` | DONE | `skills/nostr-auth/scripts/nostr_auth.js` |
| Fit with `VISION.md` | DONE | Generic protocol (NIPs), not tied to a product |
| Official `scripts/validate-skills` | PENDING | Run against a temporary checkout of the official repo |

### Manual action

1. Clone `openclaw/agent-skills` to a temporary checkout.
2. Copy `skills/nostr-auth/` from this repo.
3. Run `scripts/validate-skills` and the destination repo's tests.
4. Open the PR and respond to fit reviews against `VISION.md`.

## 4. skills.sh (Vercel Agent Skills Directory)

Sources consulted:

- Documentation: https://skills.sh/docs
- Schema: https://skills.sh/schemas/skills.sh.schema.json
- CLI: https://github.com/vercel-labs/skills

### Current requirements and status

| Requirement | Status | Evidence |
|---|---|---|
| `skills.sh.json` at the root | DONE | `$schema`, `notGrouped`, `groupings` |
| `groupings` with existing skill | DONE | Group `Nostr Authentication` includes `nostr-auth` |
| Skill with `name` and `description` | DONE | `npx skills@latest add . --list` discovers it |
| Public GitHub repo | DONE | `dyegolara/nostr-auth-agents` pushed to `main` |
| Remote page updated | PENDING EXTERNAL | Requires push + later install/telemetry |

### Manual action (after the push)

```bash
npx skills add dyegolara/nostr-auth-agents --skill nostr-auth --list
npx skills add dyegolara/nostr-auth-agents --skill nostr-auth
```

Verify the page after the cache update:

```text
https://skills.sh/dyegolara/nostr-auth-agents
```

## 5. `anthropics/skills` (PR)

Source: https://github.com/anthropics/skills (Agent Skills format,
https://agentskills.io).

### Requirements and status

| Requirement | Status | Evidence |
|---|---|---|
| `skills/<name>/SKILL.md` | DONE | `contrib/anthropics/skills/nostr-auth/SKILL.md` |
| Frontmatter with `name` and `description` | DONE | Verified in the publishing suite |
| Educational variant with no scripts | DONE | Markdown only, no `scripts/` or MCP |

### Manual action

1. Fork/branch of `anthropics/skills`.
2. Add `contrib/anthropics/skills/nostr-auth/SKILL.md` as
   `skills/nostr-auth/SKILL.md` in the destination.
3. PR describing the auth-only protocol and its limits.

## 6. Claude Community Marketplace

Sources: https://code.claude.com/docs/en/plugins and
https://platform.claude.com/plugins/submit.

| Requirement | Status | Evidence |
|---|---|---|
| `.claude-plugin/plugin.json` | DONE | Metadata, version `1.0.0`, MIT, MCP server |
| Compatible skill | DONE | Root `SKILL.md` (MCP is the main path) |
| `.mcp.json` | DONE | Stdio `node mcp/server.js`, no npm deps |
| Working MCP | DONE | `test/mcp.test.js` + clean-checkout boot in CI |
| Codex/Cursor manifests | DONE | `.codex-plugin/` and `.cursor-plugin/` |
| `claude plugin validate . --strict` | RUN MANUALLY | Claude Code binary not installed in this environment |

### Manual action

```bash
claude plugin validate . --strict   # from a real Claude Code install
```

Then individual submit at https://platform.claude.com/plugins/submit (or the
directory route for team/enterprise). The community catalog syncs on its own
after approval.

## 7. Codex / Cursor / OpenCode (manifests)

**Status**: DONE in the repo (`.codex-plugin/`, `.cursor-plugin/`, `.mcp.json`,
`SKILL.md`). No submit portals marked pending: distribution happens via
GitHub/npm for those who install from there. It will be reviewed if some host
adds an official directory; nothing is blocked.

## 8. HuggingFace — rejected

Not applicable (Hub/transformers/datasets ecosystem; same as lnurl-auth).

## 9. NVIDIA/skills — rejected

Same reason as lnurl-auth: NVIDIA internal governance, Apache/CC licenses,
DCO, IP review. MIT project, general-purpose skill, not a NVIDIA product.

## 10. npm

| Requirement | Status | Evidence |
|---|---|---|
| `name`, `version`, `description`, `license` | DONE | `package.json` |
| `repository` and `bin` | DONE | `bin: {"nostr-auth": "nostr_auth.js"}` |
| Restrictive `files` | DONE | 6 entries → 11 files in pack |
| Executable shebang | DONE | `nostr_auth.js` mode `755` |
| README and LICENSE included | DONE | Confirmed in `npm pack --dry-run` |
| **Zero runtime dependencies** | DONE | `dependencies: {}`, `bundled: []` |
| Buildable package | DONE | `nostr-auth@1.0.0`, 11 files |
| Name free in registry | DONE | `npm view nostr-auth` → 404 (not yet published) |
| `npm login` / publish | PENDING EXTERNAL | Not run |

### Manual action

```bash
npm login
npm publish
npm view nostr-auth version
npm i -g nostr-auth@1.0.0
nostr-auth nip07 pubkey --domain example.com
```

Note: the package deliberately excludes tests, CI, `PUBLISHING.md`,
`AGENTS.md`, marketplace manifests and the `skills/` bundle (those are
distributed from GitHub).

## 11. ClawHub

Sources: https://clawhub.ai · https://docs.openclaw.ai/clawhub/publishing

### Chosen surface

Same as lnurl-auth: published as a **ClawHub skill**, not as a native OpenClaw
plugin. `skills/nostr-auth/` contains a `SKILL.md` + a regular helper
(`scripts/`), `name` matches the directory, declares `node` and the optional
variable `NOSTR_AUTH_KEYFILE`. No `openclaw.plugin.json` (to avoid native
plugin detection).

### Requirements and status

| Requirement | Status | Evidence |
|---|---|---|
| Folder with `SKILL.md` | DONE | `skills/nostr-auth/SKILL.md` |
| `name` matches directory | DONE | Both `nostr-auth` |
| Regular support files | DONE | `scripts/nostr_auth.js` (single file) |
| Metadata `requires.bins` / `envVars` | DONE | `node` + `NOSTR_AUTH_KEYFILE` |
| Bundle within limits | DONE | 2 files |
| CLI preflight `--dry-run --json` | DONE | `would-publish`, version `1.0.0`, 2 files (2026-09-04) |
| ClawHub account/login | DONE | `clawhub whoami` → `dyegolara` |
| Publishing and remote scan | DONE | Uploaded 2026-09-04; scan CLEAN (`pending.publication`, engine v2.4.26) |

### Reproducible preflight (manual action, publishes nothing)

```bash
npx --yes clawhub skill publish ./skills/nostr-auth \
  --slug nostr-auth \
  --name "Nostr Auth" \
  --version 1.0.0 \
  --categories security \
  --topics nostr,nip-07,authentication \
  --dry-run --json
```

Requirement to check this row off: `would-publish` output, version `1.0.0`,
2 files. Then:

```bash
npm i -g clawhub && clawhub login && clawhub whoami
clawhub skill publish ./skills/nostr-auth --slug nostr-auth \
  --name "Nostr Auth" --version 1.0.0 --categories security \
  --topics nostr,nip-07,authentication
clawhub inspect @<publisher>/nostr-auth --files
```

## 12. Methods roadmap → re-publishing

Each new method does NOT restart the plan; it re-validates it:

1. `nostr_nip98_*` (MCP) + `nip98` subcommand + tests (mock HTTP 401/header).
2. `nip42` with websockets (possible dev dependency `ws` only in tests;
   runtime stays zero-dep via the global WebSocket of Node ≥22).
3. `nip05` resolve/verify.
4. For each one: synchronized version bump (package, manifests, MCP, SKILLs,
   bundle, `PUBLISHING.md`), re-run the evidence table and re-publish
   npm/ClawHub/skills.sh with the new version.

## Final checklist — step by step

### Done in this first commit

- [x] Public repo `dyegolara/nostr-auth-agents` created.
- [x] Functional `nip07` CLI (sign/pubkey/challenge) + MCP + portable bundle.
- [x] Zero runtime dependencies; MCP and bundle boot from a clean clone.
- [x] 52-test suite incl. BIP-340 vectors and roundtrip against a local mock.
- [x] CI, README, AGENTS.md, PRIVACY, CONTRIBUTING, LICENSE (MIT).
- [x] `npx skills@latest add . --list` discovers `nostr-auth`.

### Next publishing steps (in order)

- [x] **Step 1**: `git push -u origin main` + topics/description on GitHub.
- [x] **Step 2**: CI green on the first push (run 32295063969).
- [x] **Step 3**: skills.sh: `npx skills add dyegolara/nostr-auth-agents
      --skill nostr-auth --list` discovers 1 skill; real install OK
      (copied to `.agents/skills/nostr-auth`).
- [x] **Step 4**: `clawhub skill publish --dry-run --json` →
      `would-publish`, version `1.0.0`, 2 files, fingerprint
      `49edc3fe0be9…67c6a` (2026-09-04).
- [x] **Step 5**: `npm publish` (`dyegolara` account, same as `lnurl-auth`)
      → `nostr-auth@1.0.0` on the registry (2026-09-04 21:54 UTC).
      Verified with `npm i -g nostr-auth` + smoke test
      `nostr-auth nip07 pubkey --domain example.com` OK. Note: required
      `--min-release-age=0` to install a freshly published package (local
      `min-release-age=7` protection).
- [x] **Step 9**: real `clawhub skill publish` → `nostr-auth@1.0.0`
      uploaded; security scan CLEAN (`pending.publication`, engine
      v2.4.26, 2026-09-04), becomes visible when moderation completes.

### Steps 6-8 — discarded (maintainer decision, 2026-09-04)

The PRs to `openclaw/agent-skills` and `anthropics/skills` and the
Claude Community Marketplace submit were already attempted with
`lnurl-auth` and rejected. They are ignored for this project too:

- [~] **Step 6**: PR to `openclaw/agent-skills` — DISCARDED.
- [~] **Step 7**: PR to `anthropics/skills` — DISCARDED.
- [~] **Step 8**: `claude plugin validate` + community marketplace —
      DISCARDED.
- [ ] **After**: `nip98` method → bump 1.1.0 → repeat steps 3-5 and 9.

Each step is checked off here when its evidence is recorded. No additional
code changes are required in this first commit to run steps 1-5.