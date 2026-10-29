# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

## [1.2.5] - 2026-10-26

Adapted for DeepSeek Harness **0.2.1-alpha.2** and later. See `docs/COMPATIBILITY.md`.

### Fixed

- Settings now come from the plugin `Config` schema. DSH 0.2.1-alpha.2 no longer provides `settings.register`, so the `vision-link` namespace never appeared and saved mappings could not load.
- Volatile `mappings`, `defaultTarget`, `autoFallback`, and `gracefulDegrade` are what the settings page reads and writes. Changes apply to the running plugin.
- The read-only model list stays on the direct `/vision-link-rpc` web route. `connection.rpc.handle` on this DSH build touches `webServer` from the connection plugin, which does not inject that service.
- An unmapped text model borrows the first image-capable model in the same provider group. `autoFallback` defaults to on for this host.
- The DSH 0.2.1-alpha.2 composer is contentEditable. Pasting an image no longer shows the missing-replay-hook warning; the page keeps the image and the toast names the same-group reader.
- Prevent recursive re-entrancy on internal `ctx.llm.stream` calls during image extraction and fallback.
- Quiet paste mode: eliminated redundant toast banner popups on image paste when visual mapping or fallback is already established.

## [1.2.4] - 2026-09-18

### Fixed

- **Vision Candidates Discovery in Web Settings**: Resolved issue where "图片理解模型" candidate dropdown was completely empty when mapping text models.
- **Direct WebServer RPC Route**: Registered `/vision-link-rpc` directly on `ctx.webServer`, resolving `TypeError: Cannot read properties of undefined (reading 'register')` caused by DSH `@deepseek-ai/dsh-client-connection` omitting `webServer` dependency.
- **Settings Multi-Modality Parsing**: Added client-side extraction of vision models from `settings.describe()` (`llm-pi-ai` and provider namespaces) so models with `input: [text, image]` (such as `doubao-seed-2.1-turbo`, `qwen3.8-max`, `gemini-3.5-flash`) are reliably detected and selectable.
- **Auto-Selection**: In settings mapping panel, automatically pre-select the highest priority vision model (same-group prioritized) when no mapping is selected.

## [1.2.3] - 2026-09-17

### Fixed

- **Latest DSH Compatibility**: Resolved fatal initialization error (`connection service unavailable`) caused by DSH moving remote RPC and settings APIs away from `connection.api`.
- Modernized client remote integration to use standard `ctx.remote.session.modelCatalog()`, `ctx.remote.settings.describe()`, and `ctx.remote.settings.mutate(ns, ops, revision)` with seamless legacy fallback.
- Updated `unwrap()` to support modern `RemoteResult` `{ ok, value, error }` envelopes alongside legacy `{ result: { ok, value } }`.
- Replaced obsolete `@deepseek-ai/dsh-client-runtime` entry in `package.json` `dsh.client.inject` with `@deepseek-ai/dsh-api-remotes`.
- Added `'remote'` to `client.js` `exports.inject` for declarative Cordis lifecycle binding.

## [1.2.2] - 2026-08-24

### Changed

- Native image intake now trusts Host `listModels().inputModalities` via a loopback catalog projection. Catalog image routes (official vision-exp, Doubao, GPT, …) keep DSH paste/drop; text-only routes still use the sidecar mapping flow.

## [1.2.1] - 2026-08-21

### Added

- Real-browser validation baseline, documented in README and `docs/TROUBLESHOOTING.md`.
- Regression checklist for writable settings, first-image mapping flow, native attachment replay, and route-preserving answer verification.

### Changed

- Evidence-cache identity now includes the effective user question context, preventing stale visual evidence reuse when the same image is asked about differently.
- Evidence-cache keys are hashed `vl1:` identities over a NUL-joined tuple (provider, model, focus, question, attachment), so anonymous attachments get a stable identity without putting unbounded JSON into the key.
- Client-side degradation now reports explicit configuration-assistant guidance when DSH Web integration hooks are unavailable instead of failing silently.
- Paste-fallback intake is a named replay mode with an explicit banner, instead of an unnamed textarea boolean.
- README and troubleshooting docs now reflect the current writable-host reality while still documenting fallback behavior for older or restricted deployments.

### Testing

- Added automated regression coverage for same-image same-question reuse and same-image different-question cache separation.
- Added coverage for hashed cache keys, history follow-up without a new image, `intakeReplayMode` ordering, and client-bundle string alignment.
- Verified the current local DSH host allows in-page `vision-link` settings writes and persists them into `settings.yaml`.
- Verified real-browser first-image flow, native attachment replay, visible route preservation, and image-fact entry into the final answer path.
- The `DSH_VISION_LINK_DEBUG_CACHE` env switch is present in code, but its runtime output was not confirmed in the live host log sink during this release pass, so it should not be treated as a proven 1.2.1 diagnostic capability yet.

## [1.2.0] - 2026-08-20

### Added

- Route-preserving multimodal sidecar flow for text-only models.
- Exact text-to-vision mappings sourced from DSH Settings.
- Image capability overlay only when a valid mapping resolves.
- Focus presets for automatic analysis, OCR, UI, charts, code, and custom instructions.
- Same-provider-first vision candidate ordering.
- Loopback-only, sanitized read-only mapping RPC.
- Read-only mapping page, live mapping cards, and YAML generator.
- Friendly unmapped, timeout, and provider-failure responses.

### Changed

- The selected text provider/model no longer switches or uses wrapper providers.
- Normal npm installations use a clear settings-file workflow and require no DSH source patch.

### Security

- Image content is explicitly treated as untrusted data.
- Mapping projection excludes credentials, endpoints, and unrelated Settings.
