# Architecture

## Goal

`dsh-vision-link` gives a text-only DSH route image understanding without replacing that route. The selected provider/model remains the authority for the final answer.

## Request flow

```text
DSH user message with image
  ├─ native multimodal model → unchanged DSH flow
  └─ text-only model
       → resolve exact vision mapping
       → call mapped multimodal model with image + evidence prompt
       → replace image block with structured visual evidence
       → call the original provider/model with the text-only projection
```

The second call is intentionally made through `ctx.llm.stream()` with the original route. No wrapper provider is registered and no model-selection API is called.

## Host components

- `SettingsSchema` owns `vision-link.mappings` and applies updates live.
- `resolveModelInfo` is augmented only for mapped text routes so DSH admits image input.
- The `llm/stream` listener performs evidence extraction and route-preserving delegation.
- A bounded in-memory LRU cache avoids repeating identical image reads within the process.
- A loopback-only Connection RPC exposes a sanitized mapping snapshot for the Web page.

## Client components

- Image-capable candidates are joined from DSH's model catalog and `llm-pi-ai` Settings declarations.
- Same-provider candidates sort first.
- Normal installations render a read-only mapping view and YAML generator.
- If a future/modified DSH Host explicitly exposes the `vision-link` Settings namespace, the existing managed editor can create, update, and remove mappings.
- The paste/drop convenience path depends on current DSH Web client integration points; when those hooks are unavailable, the client degrades to explicit configuration guidance instead of silently switching models or mutating browser-local state.

No mapping is stored in LocalStorage, so browser state cannot diverge from the server configuration.

## Trust boundaries

- Image content is untrusted and is never treated as instructions.
- The read-only RPC returns only mapping keys, target ids, display names, and focus configuration.
- The RPC uses DSH Connection's `loopback` authority, including Host and Origin checks.
- API keys, base URLs, credentials, and unrelated Settings are not projected.

## Mapping precedence

1. live exact mappings from `settings.yaml`;
2. `visionTargetByModel` from plugin configuration;
3. `visionTargetByRoute` fallback from plugin configuration.

Exact mappings are recommended for end users because they are explicit and do not silently affect every model in a provider.
