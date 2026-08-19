# Publicación pendiente — `nostr-auth` (NIP-07)

Actualizado: 2026-08-19

## Alcance

Este documento es la hoja de ruta de publicación de `nostr-auth-agents`:
separa lo que ya está preparado en el repositorio de las acciones externas
que el mantenedor debe ejecutar manualmente, **paso a paso**, e ignora lo que
deliberadamente no se publica. Durante este primer commit no se hizo ningún
`publish`, login ni envío a marketplace.

Estructura espejo del plan de `lnurl-auth-agents` (mismos canales, mismo
criterio), con una diferencia: este proyecto arranca con **un solo método**
(NIP-07, el más parecido a LNURL-auth) e irá sumando métodos en versiones
sucesivas. La publishability se revisa y se re-verifica **poco a poco**: cada
release pluggable en cada canal de abajo debe repetir su evidencia.

## Métodos soportados (roadmap de versiones)

| Método | Estado | Invocación | Versión objetivo |
|---|---|---|---|
| **NIP-07** sign-in (challenge event signing) | ✅ este commit | `nostr-auth nip07 [sign\|pubkey]` | 1.0.0 |
| NIP-98 HTTP Auth (`Authorization: Nostr <event>`) | 🔜 siguiente | `nostr-auth nip98 <url>` | 1.1.0 |
| NIP-42 relay AUTH (websocket) | 🔜 | `nostr-auth nip42 <relay>` | 1.2.0 |
| NIP-05 identifier resolution | 🔜 | `nostr-auth nip05 <nip05>` | 1.3.0 |

Cada método nuevo = subcomando nuevo en el mismo binario/bundle + bump de
versión + re-ejecutar las evidencias de la sección "Evidencia ejecutada" y
los preflights de los canales afectados.

## Cambios realizados en este primer commit

- `package.json` con `name: nostr-auth`, versión `1.0.0`, `files` restrictivo
  (11 archivos), `engines.node >= 20.19.0` y **cero dependencias runtime**.
- Criptografía pura en `lib/`: secp256k1 + BIP-340 schnorr en BigInt con
  `node:crypto` solo para sha256/HMAC, NIP-01 eventos (serialize/id/sign),
  derivación de identidad HMAC-SHA256 por dominio, y bech32 (npub/nsec).
- `nostr_auth.js`: CLI con subcomandos por método (`nip07` hoy; `nip98`,
  `nip42`, `nip05` "coming soon" — salida de error clara si se invocan).
  Salidas/exit codes espejo de lnurl-auth: logs a stderr, JSON a stdout,
  `0/1/2/3/4`.
- MCP cero dependencias: `mcp/server.js` stdio JSON-RPC 2.0 con tools
  `nostr_nip07_sign` y `nostr_nip07_pubkey`. Arranca desde un clon limpio sin
  `npm install` (la lib completa es stdlib).
- `skills/nostr-auth/`: bundle autónomo OpenClaw/ClawHub con `SKILL.md` y
  `scripts/nostr_auth.js` (helper portable en un solo archivo, cero deps).
- `contrib/anthropics/skills/nostr-auth/SKILL.md`: variante educativa sin
  scripts ejecutables para `anthropics/skills`.
- Manifests: `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`,
  `.mcp.json`, `skills.sh.json` (schema actual con `groupings`).
- `mock_server.js`: servicio local "Sign in with Nostr" (challenge → verify)
  para self-test sin red ni costo.
- CI (GitHub Actions): sintaxis del bundle, boot del MCP desde checkout
  limpio, `npm pack --dry-run` y suite completa.
- Suite local: 8 archivos, 52 tests (vectores oficiales BIP-340 + cross-check
  contra `@noble/curves` como devDependency).

## Evidencia ejecutada hoy

| Verificación | Resultado |
|---|---|
| `npm install` (solo devDeps) | OK |
| `npm audit --omit=dev` | OK — 0 vulnerabilidades runtime |
| `npm test` | OK — 8 archivos, 52 tests |
| `npm pack --dry-run --json` | OK — `nostr-auth@1.0.0`, 11 archivos intencionados, `bundled: []` |
| `node --check` sobre CLI, MCP, bundle portable y `lib/` | OK |
| `npx skills@latest add . --list` | OK — descubre 1 skill: `nostr-auth` |
| Vectores oficiales BIP-340 (vector 0) + cross-check `@noble/curves` | OK — en suite |
| `gh auth` / creación del repo | OK — `dyegolara/nostr-auth-agents`, público |
| `clawhub skill publish ... --dry-run` | PENDIENTE — preflight en acción manual (sección 11) |
| `openclaw/agent-skills/scripts/validate-skills` | PENDIENTE — acción manual (sección 3) |
| `claude plugin validate . --strict` | PENDIENTE — requiere instalación real de Claude Code (sección 6) |

## 1. GitHub (base de todo)

**Estado**: LISTO parcialmente — el repo público existe y este commit es la
base. Falta el primer push.

Acción (única, una vez):

```bash
git push -u origin main
gh repo edit dyegolara/nostr-auth-agents \
  --description "Nostr sign-in (NIP-07) for LLM coding agents — no wallet, no extension, auth-only" \
  --add-topic nostr --add-topic nip-07 --add-topic authentication \
  --add-topic sign-in --add-topic agents --add-topic agent-skill --add-topic mcp
```

Después del push:

```bash
gh repo view dyegolara/nostr-auth-agents --web   # verificar topics/about/CI badge
```

CI queda activa sola (workflow en `.github/workflows/ci.yml`); verificar que
el primer push la dispare en verde.

## 2. README + descubribilidad

**Estado**: LISTO — README con badges de CI/MIT, instalación por plataforma,
tabla de métodos con roadmap, self-test. Sin cambios extras por ahora; se
revisará por canal cuando cada letrero (skills.sh, npm, ClawHub) quede
publicado para añadir sus badges/links reales.

## 3. `openclaw/agent-skills` (PR)

Fuentes consultadas:

- Repo: https://github.com/openclaw/agent-skills
- Reglas: https://github.com/openclaw/agent-skills/blob/main/README.md
- Visión: https://github.com/openclaw/agent-skills/blob/main/VISION.md
- Validador: https://github.com/openclaw/agent-skills/blob/main/scripts/validate-skills

### Requisitos actuales y estado

| Requisito | Estado | Evidencia en este proyecto |
|---|---|---|
| `skills/<name>/SKILL.md` | LISTO | `skills/nostr-auth/SKILL.md` |
| Frontmatter YAML con `name` y `description` | LISTO | `name: nostr-auth` + description válida |
| Workflow portable y reutilizable | LISTO | Helper en un solo archivo, cero deps npm |
| Inputs, outputs, fallos y límites explícitos | LISTO | Secciones del `SKILL.md` del bundle |
| Licencia del proyecto MIT | LISTO | `LICENSE` en la raíz |
| Helper en `scripts/` | LISTO | `skills/nostr-auth/scripts/nostr_auth.js` |
| Encaje con `VISION.md` | LISTO | Protocolo genérico (NIPs), no atado a un producto |
| `scripts/validate-skills` oficial | PENDIENTE | Ejecutar contra checkout temporal del repo oficial |

### Acción manual

1. Clonar `openclaw/agent-skills` a un checkout temporal.
2. Copiar `skills/nostr-auth/` desde este repo.
3. Ejecutar `scripts/validate-skills` y las pruebas del repo destino.
4. Abrir el PR y responder revisiones de encaje con `VISION.md`.

## 4. skills.sh (Vercel Agent Skills Directory)

Fuentes consultadas:

- Documentación: https://skills.sh/docs
- Schema: https://skills.sh/schemas/skills.sh.schema.json
- CLI: https://github.com/vercel-labs/skills

### Requisitos actuales y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `skills.sh.json` en la raíz | LISTO | `$schema`, `notGrouped`, `groupings` |
| `groupings` con skill existente | LISTO | Grupo `Nostr Authentication` incluye `nostr-auth` |
| Skill con `name` y `description` | LISTO | `npx skills@latest add . --list` lo descubre |
| Repo público en GitHub | LISTO | `dyegolara/nostr-auth-agents` creado (push pendiente) |
| Página remota actualizada | PENDIENTE EXTERNO | Requiere push + instalación/telemetría posterior |

### Acción manual (después del push)

```bash
npx skills add dyegolara/nostr-auth-agents --skill nostr-auth --list
npx skills add dyegolara/nostr-auth-agents --skill nostr-auth
```

Verificar la página tras la actualización de caché:

```text
https://skills.sh/dyegolara/nostr-auth-agents
```

## 5. `anthropics/skills` (PR)

Fuente: https://github.com/anthropics/skills (formato Agent Skills,
https://agentskills.io).

### Requisitos y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `skills/<name>/SKILL.md` | LISTO | `contrib/anthropics/skills/nostr-auth/SKILL.md` |
| Frontmatter con `name` y `description` | LISTO | Verificado en suite de publishing |
| Variante educativa sin scripts | LISTO | Solo markdown, sin `scripts/` ni MCP |

### Acción manual

1. Fork/branch de `anthropics/skills`.
2. Agregar `contrib/anthropics/skills/nostr-auth/SKILL.md` como
   `skills/nostr-auth/SKILL.md` en el destino.
3. PR describiendo el protocolo auth-only y sus límites.

## 6. Claude Community Marketplace

Fuentes: https://code.claude.com/docs/en/plugins y
https://platform.claude.com/plugins/submit.

| Requisito | Estado | Evidencia |
|---|---|---|
| `.claude-plugin/plugin.json` | LISTO | Metadata, versión `1.0.0`, MIT, MCP server |
| Skill compatible | LISTO | `SKILL.md` raíz (el MCP es el camino principal) |
| `.mcp.json` | LISTO | Stdio `node mcp/server.js`, sin deps npm |
| MCP funcional | LISTO | `test/mcp.test.js` + boot desde checkout limpio en CI |
| Manifests Codex/Cursor | LISTO | `.codex-plugin/` y `.cursor-plugin/` |
| `claude plugin validate . --strict` | EJECUTAR MANUALMENTE | Binario de Claude Code no instalado en este entorno |

### Acción manual

```bash
claude plugin validate . --strict   # desde una instalación real de Claude Code
```

Luego submit individual en https://platform.claude.com/plugins/submit (o ruta
de directorio para team/enterprise). El catálogo community se sincroniza solo
tras la aprobación.

## 7. Codex / Cursor / OpenCode (manifests)

**Estado**: LISTO en el repo (`.codex-plugin/`, `.cursor-plugin/`,
`.mcp.json`, `SKILL.md`). No hay portales de submit marcados pendientes: la
distribución ocurre vía GitHub/npm para quienes instalen desde ahí. Se
revisará si algún host agrega directorio oficial; no bloquea nada.

## 8. HuggingFace — descartado

No aplica (ecosistema Hub/transformers/datasets; igual que en lnurl-auth).

## 9. NVIDIA/skills — descartado

Misma razón que lnurl-auth: gobernanza interna NVIDIA, licencias Apache/CC,
DCO, IP review. Proyecto MIT, skill de propósito general, no de un producto
NVIDIA.

## 10. npm

| Requisito | Estado | Evidencia |
|---|---|---|
| `name`, `version`, `description`, `license` | LISTO | `package.json` |
| `repository` y `bin` | LISTO | `bin: {"nostr-auth": "nostr_auth.js"}` |
| `files` restrictivo | LISTO | 6 entradas → 11 archivos en pack |
| Shebang ejecutable | LISTO | `nostr_auth.js` mode `755` |
| README y LICENSE incluidos | LISTO | Confirmados en `npm pack --dry-run` |
| **Cero dependencias runtime** | LISTO | `dependencies: {}`, `bundled: []` |
| Paquete construible | LISTO | `nostr-auth@1.0.0`, 11 archivos |
| Nombre libre en registry | LISTO | `npm view nostr-auth` → 404 (aún no publicado) |
| `npm login` / publish | PENDIENTE EXTERNO | No ejecutado |

### Acción manual

```bash
npm login
npm publish
npm view nostr-auth version
npm i -g nostr-auth@1.0.0
nostr-auth nip07 pubkey --domain example.com
```

Nota: el paquete excluye deliberadamente tests, CI, `PUBLISHING.md`,
`AGENTS.md`, manifests de marketplaces y el bundle `skills/` (esos se
distribuyen desde GitHub).

## 11. ClawHub

Fuentes: https://clawhub.ai · https://docs.openclaw.ai/clawhub/publishing

### Superficie elegida

Igual que lnurl-auth: publicación como **skill de ClawHub**, no como plugin
nativo OpenClaw. `skills/nostr-auth/` contiene un `SKILL.md` + un helper
regular (`scripts/`), `name` coincide con el directorio, declara `node` y la
variable opcional `NOSTR_AUTH_KEYFILE`. Sin `openclaw.plugin.json` (evitar la
detección a plugin nativo).

### Requisitos y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| Carpeta con `SKILL.md` | LISTO | `skills/nostr-auth/SKILL.md` |
| `name` coincide con directorio | LISTO | Ambos `nostr-auth` |
| Archivos de soporte regulares | LISTO | `scripts/nostr_auth.js` (un archivo) |
| Metadata `requires.bins` / `envVars` | LISTO | `node` + `NOSTR_AUTH_KEYFILE` |
| Bundle dentro de límites | LISTO | 2 archivos |
| Preflight CLI `--dry-run --json` | PENDIENTE | Ejecutar y pegar salida en este doc |
| Cuenta/login ClawHub | PENDIENTE EXTERNO | `clawhub login` no ejecutado |
| Publicación y scan remoto | PENDIENTE EXTERNO | No se hizo upload |

### Preflight reproducible (acción manual, no publica nada)

```bash
npx --yes clawhub skill publish ./skills/nostr-auth \
  --slug nostr-auth \
  --name "Nostr Auth" \
  --version 1.0.0 \
  --categories security \
  --topics nostr,nip-07,authentication \
  --dry-run --json
```

Requisito para tachar esta fila: salida `would-publish`, versión `1.0.0`,
2 archivos. Luego:

```bash
npm i -g clawhub && clawhub login && clawhub whoami
clawhub skill publish ./skills/nostr-auth --slug nostr-auth \
  --name "Nostr Auth" --version 1.0.0 --categories security \
  --topics nostr,nip-07,authentication
clawhub inspect @<publisher>/nostr-auth --files
```

## 12. Roadmap de métodos → re-publicación

Cada método nuevo NO reinicia el plan; lo re-valida:

1. `nostr_nip98_*` (MCP) + subcomando `nip98` + tests (mock HTTP 401/header).
2. `nip42` con websockets (posible dependencia dev `ws` solo en tests;
   runtime seguirá zero-dep vía WebSocket global de Node ≥22).
3. `nip05` resolve/verify.
4. Por cada uno: bump de versión sincronizado (package, manifests, MCP,
   SKILLs, bundle, `PUBLISHING.md`), re-ejecutar la tabla de evidencia y
   re-publicar npm/ClawHub/skills.sh con la versión nueva.

## Checklist final — paso a paso

### Hecho en este primer commit

- [x] Repo público `dyegolara/nostr-auth-agents` creado.
- [x] CLI `nip07` funcional (sign/pubkey/challenge) + MCP + bundle portable.
- [x] Cero dependencias runtime; MCP y bundle arrancan desde clon limpio.
- [x] Suite de 52 tests incl. vectores BIP-340 y roundtrip contra mock local.
- [x] CI, README, AGENTS.md, PRIVACY, CONTRIBUTING, LICENSE (MIT).
- [x] `npx skills@latest add . --list` descubre `nostr-auth`.

### Siguientes pasos de publicación (en orden)

- [ ] **Paso 1**: `git push -u origin main` + topics/description en GitHub.
- [ ] **Paso 2**: verificar CI verde en el primer push.
- [ ] **Paso 3**: skills.sh: `npx skills add dyegolara/nostr-auth-agents ...`
      y verificar https://skills.sh/dyegolara/nostr-auth-agents.
- [ ] **Paso 4**: `clawhub skill publish --dry-run --json` (preflight) y
      pegar la evidencia en la sección 11.
- [ ] **Paso 5**: `npm login` + `npm publish` + `npm i -g nostr-auth`.
- [ ] **Paso 6**: PR a `openclaw/agent-skills` (validar con
      `scripts/validate-skills` primero).
- [ ] **Paso 7**: PR a `anthropics/skills`.
- [ ] **Paso 8**: `claude plugin validate . --strict` desde Claude Code
      instalado + submit al marketplace community.
- [ ] **Paso 9**: `clawhub login` + publish real + verificación con
      `clawhub inspect`.
- [ ] **Después**: método `nip98` → bump 1.1.0 → repetir pasos 3-5 y 9.

Cada paso se tacha aquí cuando su evidencia queda registrada. No se requiere
ningún cambio adicional de código en este primer commit para ejecutar los
pasos 1-5.