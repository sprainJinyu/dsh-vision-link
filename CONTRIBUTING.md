# Contributing

Thanks for helping improve `dsh-vision-link`.

## Development setup

```bash
npm ci
npm run validate
```

Node.js 20 and 22 are the supported development baselines.

## Pull requests

- Keep the original provider/model route unchanged.
- Do not introduce wrapper providers or browser-only mapping state.
- Add or update tests for behavior changes.
- Keep examples provider-neutral and never commit credentials or private deployment data.
- Update both English and Chinese user documentation when the workflow changes.
- Run `npm run validate` before opening a pull request.

## Bug reports

Include DSH and plugin versions, operating system, the sanitized mapping shape, reproduction steps, expected behavior, and actual behavior. Remove API keys, base URLs, local paths, conversation content, and screenshots containing private data.

## Design principles

1. The selected text model owns the final answer.
2. DSH Settings is the mapping source of truth.
3. Capability claims must be verified against the target model.
4. Failure should be explicit and should not call the text model with partial evidence.
5. New browser surfaces must respect DSH's transport and trust boundaries.
