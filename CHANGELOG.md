# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

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
