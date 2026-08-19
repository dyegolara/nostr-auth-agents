# Política de privacidad

Este proyecto no recopila datos. Todo el estado vive en la máquina donde se
ejecuta:

- **Secreto maestro** (`~/.config/nostr-auth/master.key`, modo `0600`): lo
  único persistido. Nunca se envía a nadie; solo se usan sus derivados
  (llaves públicas y firmas).
- **Derivación por dominio**: `HMAC-SHA256(maestro, dominio)` genera una
  identidad distinta por servicio, de modo que servicios no relacionados no
  pueden correlacionar al usuario.

## Qué NO hace

- No envía llaves privadas ni seeds a terceros.
- No recolecta telemetría, analytics ni métricas.
- No publica eventos a relays por su cuenta.

## Qué sí ocurre

- Un request HTTP al callback del servicio que se está autenticando, que
  contiene la llave pública y una firma (equivalentes a lo que una extensión
  NIP-07 expondría).
- Si se usa `--key` o `--single-key`, la identidad enviada es la que se
  especifique; no hay más transmisión que la indicada.

## Limitación

### Identidad

La llave derivada es una identidad de agente local. No es la identidad de una
extensión de navegador o wallet del usuario (esas usan la nsec/seed del
usuario). Reemplazar derivación por una nsec real (con `--key`) queda bajo
responsabilidad de quien la configure.