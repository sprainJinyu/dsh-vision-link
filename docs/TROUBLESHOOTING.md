# Troubleshooting / 排障

## The page is read-only / 页面只能查看不能保存

This is the normal npm installation mode, not a plugin failure. Select models on the page, copy the YAML, click **Open configuration file / 打开配置文件**, and merge it into `settings.yaml`.

If `vision-link:` already exists, add only the new entry below its existing `mappings:` block. A YAML document must not contain two top-level `vision-link:` keys.

## No vision model appears / 没有图片模型候选项

Check all of the following:

1. the model exists in `llm-pi-ai.providers.<provider>.models`;
2. its `input` includes `image`, or the provider's `defaultInput` includes `image`;
3. the configured provider and model ids exactly match the runtime catalog;
4. DSH was restarted after a configuration change when live reload is unavailable.

## Mapping is visible but image send is rejected / 映射可见但发送被拒绝

The mapped target must itself resolve as image-capable. Verify its `input` declaration and that the provider can list/resolve the model. Wrapper providers whose ids start with `vision-link-` or `modlens-` cannot be mapping targets.

## The wrong route is mapped / 映射没有命中

Use the exact full key shown by DSH:

```yaml
vision-link:
  mappings:
    provider-id/text-model-id:
      provider: provider-id
      model: vision-model-id
```

Display names are not ids. Copy ids exactly, including punctuation and letter case.

## YAML fails to load / YAML 无法加载

- use spaces, not tabs;
- keep one top-level `vision-link:` block;
- place model entries two spaces below `mappings:`;
- quote ids only when YAML syntax requires it;
- save as UTF-8 without BOM when an older loader rejects BOM-prefixed JSON/YAML.

Use [`../examples/settings.yaml`](../examples/settings.yaml) as the indentation reference.

## Vision read times out / 读图超时

The default timeout is 60 seconds. Confirm that the mapped model is reachable and its credentials are valid. Administrators can set `visionTimeoutMs` in the plugin profile configuration.

## The final text model was not called / 最终文本模型未调用

This is intentional when vision extraction fails. The plugin returns a friendly error and avoids charging or confusing the text model with incomplete evidence.

## Native multimodal models / 原生多模态模型

Models already declaring image input pass through unchanged and do not use a sidecar mapping.
