# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

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
