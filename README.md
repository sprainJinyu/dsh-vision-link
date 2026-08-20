# dsh-vision-link

[![CI](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml/badge.svg)](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

English | [简体中文](./README.zh-CN.md)

Give text-only DeepSeek Harness (DSH) models image understanding without changing the text model or provider selected by the user.

## Highlights

- **Route-preserving**: the vision model extracts evidence; the original text model still produces the final answer.
- **Reuses DSH models**: candidates come from models already configured in `settings.yaml` with image input support—no second API-key store.
- **Paste and ask**: presets cover screenshots, UI errors, OCR, charts, code, and terminals.
- **Same-provider first**: vision candidates in the current provider group are listed first.
- **No DSH source patch**: a normal npm installation only needs a small `settings.yaml` mapping.
- **Safe read-only UI**: the Web page can inspect mappings and generate YAML, while its loopback-only RPC never returns credentials.

## Important: the page is read-only by default

For a normal installation, `Settings → Plugins → Vision Mapping` is a **read-only configuration assistant**, not a save form. **This is expected, not a plugin failure.** It keeps the plugin independent of DSH source code and respects DSH's Settings permission boundary.

Configuration takes three steps:

1. select the text model, vision model, and focus preset;
2. click **Copy configuration YAML**;
3. click **Open configuration file** in the upper-right corner and merge the snippet into `settings.yaml`.

If `vision-link:` already exists, add only the new entry under its existing `mappings:` block. Do not create a second top-level `vision-link:` key. Changes normally apply live; restart DSH when they do not.

## Quick start

### 1. Install

Run from the directory in which you use DSH:

```bash
npx -y @deepseek-ai/dsh plugin --profile web add dsh-vision-link
```

Start or restart Web:

```bash
npx -y @deepseek-ai/dsh web
```

### 2. Declare image input on the vision model

The target model must explicitly advertise image input in DSH Settings:

```yaml
llm-pi-ai:
  providers:
    example-provider:
      # Keep your existing api, baseURL, and credential fields.
      models:
        - id: text-chat
          name: Text Chat

        - id: vision-chat
          name: Vision Chat
          input: [text, image]
```

A model without its own `input` may inherit the provider's `defaultInput`.

### 3. Map the models

Use `Settings → Plugins → Vision Mapping` to generate the YAML, or add it manually:

```yaml
vision-link:
  mappings:
    example-provider/text-chat:
      provider: example-provider
      model: vision-chat
      displayName: Example Provider · Vision Chat
      focusPreset: auto
```

The key is the exact text `provider/model`; the target uses real vision provider and model ids from DSH. See [`examples/settings.yaml`](./examples/settings.yaml) for a complete example.

### 4. Use it

Keep the original text model selected, paste an image into the composer, and ask your question. The page names the vision model used to read the image, but the model selector does not change.

## Focus presets

- `auto`: extract evidence relevant to the user's question;
- `ocr`: prioritize accurate text transcription;
- `ui`: UI state, controls, workflows, and errors;
- `chart`: tables, axes, legends, values, and trends;
- `code`: code, terminals, filenames, line numbers, and stacks;
- `custom`: use `customFocus` for a user-defined emphasis.

## How it works

```text
image + user question
  → mapped multimodal model extracts visual evidence
  → image is replaced by structured [visual evidence] text
  → original provider / text model produces the final answer
```

Native multimodal models pass through unchanged. The plugin registers no wrapper provider, never invokes model selection, and creates no extra temporary image file.

## Configuration precedence

1. exact `vision-link.mappings[provider/model]` entries from `settings.yaml`;
2. plugin `visionTargetByModel` configuration;
3. plugin `visionTargetByRoute[provider]` fallback.

Normal users only need the first option. The package ships no provider-specific mapping.

## Security and privacy

- Images are sent only through the mapped multimodal model and the current DSH request flow.
- Image content is treated as untrusted input; the vision prompt tells the model not to follow instructions found in images.
- The read-only page receives only model mappings, display names, and focus settings—never API keys, endpoints, or unrelated Settings.
- Its DSH Connection RPC uses Host/Origin checks and is loopback-only.

## Troubleshooting

If no vision candidates appear, confirm that the target model declares `input: [text, image]` and that its provider/model ids match DSH. If a saved mapping is not applied, check YAML indentation and duplicate top-level keys, then restart DSH.

See [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) for details.

## Development

```bash
npm ci
npm run validate
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Uninstall

```bash
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-vision-link
```

Uninstalling does not remove the `vision-link` block from `settings.yaml`; delete it manually if no longer needed.

## License

[MIT](./LICENSE)
