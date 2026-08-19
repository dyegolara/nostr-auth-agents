# AGENTS.md — nostr-auth para agentes de código

## Qué hace esta herramienta

`nostr_auth.js` firma eventos de "Sign in with Nostr" (estilo NIP-07) para
agentes LLM. Recibe un challenge o un template de evento de un sitio/API,
firma un evento kind-22242 con una llave secp256k1 (schnorr BIP-340) derivada
de un secreto maestro local, y opcionalmente envía la firma al callback del
servicio — sin wallet, sin extensión de navegador y sin publicar nada.

## Cuándo ejecutarla

Ejecuta esta herramienta cuando:

- Un sitio presenta "Sign in with Nostr" (o pide `window.nostr.signEvent`)
- Una API entrega un `challenge` (string) o un template de evento para firmar
- La tarea requiere probar identidad Nostr, **no** publicar notas ni pagar

**NO ejecutar** para publicar kind-1, interactuar con relays para otra cosa
que el callback, o mover fondos. Esto es solo autenticación.

## Invocación rápida

```bash
node nostr_auth.js nip07 --challenge "<hex>" --domain <dominio> \
  --callback "<url-de-verificacion>"
```

Variantes según el caso:

| Caso | Comando |
|---|---|
| Challenge string clásico (kind-22242) | `nip07 --challenge "<hex>" --relay "<url>" --callback "<url>"` |
| Template de evento completo | `nip07 '{"kind":...,"tags":[...],"content":""}'` |
| Ver la identidad derivada (getPublicKey) | `nip07 pubkey --domain <dominio>` |
| Firmar sin enviar | añadir `--dry-run` |

## Flujo recomendado

1. Obtener el challenge o template desde la página/API (atributo, QR, HTML,
   respuesta JSON).
2. **Dry-run primero**: `nostr_auth.js nip07 --challenge "<hex>" --dry-run --json`
   para inspeccionar evento, pubkey y callback antes de enviar.
3. Enviar: `--callback <url>`. Salida JSON con el veredicto del servidor.

Con `--json` la salida es parseable (jq). Los logs de progreso van a
**stderr**.

## Códigos de salida

| Código | Significado |
|---|---|
| `0` | Servidor respondió `{"status":"OK"}` o la operación completó |
| `1` | Error del lado cliente (evento inválido, llave inválida, red) |
| `2` | Error de uso (sin argumentos, opción desconocida) |
| `3` | Servidor respondió `{"status":"ERROR","reason":"..."}` |
| `4` | Respuesta no-200 o no-JSON del callback |

## Gestión de llaves

- La primera ejecución genera un secreto maestro de 32 bytes en
  `~/.config/nostr-auth/master.key` (modo `0600`).
- Por dominio de servicio se deriva: `HMAC-SHA256(maestro, dominio)`.
  Mismo dominio → misma identidad; dominios distintos → identidades distintas
  (privacidad).
- La identidad sobrevive entre sesiones; es persistente.
- `--generate` **sobrescribe** el secreto maestro.
- `--single-key` comparte una sola identidad entre todos los servicios.
- `--key <hex>` usa esa llave como secreto maestro sin tocar el keyfile.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Invalid hex: odd length` | Challenge o llave mal formados | Re-extraer el challenge de la página |
| `Event template must include "kind"` | Template sin `kind` | El template debe ser `{"kind":N,"tags":[...],"content":""}` |
| `status: ERROR, reason: unknown or already-used challenge` | Challenge ya consumido | Pedir un challenge nuevo |
| `status: ERROR, reason: signature verification failed` | Llave distinta o evento alterado | Mantener la llave estable por dominio |
| `Callback returned non-JSON or HTTP <n>` | Callback caído o URL incorrecta | Verificar `--callback` |
| `nonce is zero` | Material de llave degenerado | Regenerar con `--generate` |

## Métodos futuros (roadmap)

- `nip98` — NIP-98 HTTP Auth (`Authorization: Nostr <evento>`): planeado.
- `nip42` — AUTH de relay por websocket: planeado.
- `nip05` — Resolución/verificación de identificadores nip05: planeado.

Hoy se implementa `nip07` (el más parecido a lnurl-auth); los demás llegarán
en versiones sucesivas. El estado de distribución por plataforma vive en
`PUBLISHING.md`.

## Self-test

```bash
npm ci
npm test
```

Todo offline y sin costo. La suite cubre vectores BIP-340, derivación de
llaves, sign/verify, rechazo de replay, dry-run, MCP y el artefacto de
publicación.