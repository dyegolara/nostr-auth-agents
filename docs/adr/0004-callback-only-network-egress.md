# Network egress limited to the single callback POST

The tool's only network request is the final signed-event POST to the service
callback. The challenge itself is supplied by the caller (extracted from the
page, response, or template); the tool never performs intermediate fetches to
discover or poll for a challenge.

## Consequence

Auditing "does this tool leak anything" reduces to inspecting one
well-defined request. The trade-off is that the caller is responsible for
obtaining the challenge before invoking the tool.