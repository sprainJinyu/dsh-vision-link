# dsh-vision-link

[![CI](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml/badge.svg)](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

English | [简体中文](./README.zh-CN.md)

**Let a multimodal model see the image while the text model you selected stays in control of reasoning and the final answer.**

`dsh-vision-link` is a focused, lightweight vision router for DeepSeek Harness (DSH). It solves one problem: when a text-only model receives an image, a multimodal model already configured in DSH extracts the visual evidence and returns it to the original text model.

![The selected text model remains in control after an image is pasted](https://raw.githubusercontent.com/sprainJinyu/dsh-vision-link/main/docs/assets/route-preserving-chat.png)

*The UI example uses generic model names and contains no real providers, models, or credentials.*

## Why this plugin

- **The selected model stays selected**: no wrapper provider and no model-selector switch. The vision model supplies evidence; the original text model reasons and answers.
- **Reuses DSH directly**: vision candidates come from existing Settings—no second API-key store, model catalog, or external proxy service.
- **Lightweight by design**: a normal npm install patches no DSH source; the current package is about 24 KB with one runtime dependency, no separate process, and no extra temporary image files.
- **Explicit, auditable routing**: each text model maps to one vision model, same-provider candidates come first, and the conversation names the model that read the image.
- **Focused on paste-and-ask workflows**: UI errors, OCR, charts, code, and terminals—without trying to become a heavyweight vision toolbox.

## How it works

```text
image + user question
  → mapped multimodal model extracts visual evidence
  → image is replaced by structured [visual evidence] text
  → original provider / text model produces the final answer
```

Native multimodal models pass through unchanged. Images go only to the vision model explicitly mapped by the user, never to a public shared vision service.

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

![Vision model mapping assistant](https://raw.githubusercontent.com/sprainJinyu/dsh-vision-link/main/docs/assets/vision-mapping.png)

### Why is the configuration page read-only?

With a normal npm installation, `Settings → Plugins → Vision Mapping` is a configuration assistant and does not write Settings directly. This avoids patching DSH source code or bypassing its permission boundary:

1. choose the text model, vision model, and focus preset;
2. click **Copy new mapping YAML**;
3. click **Open configuration file** in the upper-right corner and merge it into `settings.yaml`.

If `vision-link:` already exists, add the new entry under its existing `mappings:` block instead of creating another top-level key. Restart DSH if the saved change is not picked up automatically.

### 4. Use it

Keep the original text model selected, paste an image into the composer, and ask your question. The page names the vision model used to read the image, but the model selector does not change.

## Focus presets

- `auto`: extract evidence relevant to the user's question;
- `ocr`: prioritize accurate text transcription;
- `ui`: UI state, controls, workflows, and errors;
- `chart`: tables, axes, legends, values, and trends;
- `code`: code, terminals, filenames, line numbers, and stacks;
- `custom`: use `customFocus` for a user-defined emphasis.

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
