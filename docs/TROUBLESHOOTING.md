# Troubleshooting / 排障

## The page is read-only / 页面只能查看不能保存

This is the normal npm installation mode, not a plugin failure. Select models on the page, copy the YAML, click **Open configuration file / 打开配置文件**, and merge it into `settings.yaml`.

If `vision-link:` already exists, add only the new entry below its existing `mappings:` block. A YAML document must not contain two top-level `vision-link:` keys.

Writable in-page saving is available only when the current DSH host explicitly exposes the `vision-link` Settings namespace as writable.

## Browser hook fallback / 浏览器挂钩降级

The convenience paste/drop path depends on current DSH Web client integration points. If the page cannot inspect the selected model or replay images back into the composer, `vision-link` falls back to a configuration-assistant mode and will show a banner telling you to verify `settings.yaml` mappings first.

In that state:

- route-preserving server behavior is still intact;
- the in-browser auto-assist path is unavailable;
- refreshing or restarting DSH may restore the hook path after a frontend update.

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

## Multi-image waiting time / 多图等待时间

Multiple images are currently read **serially**, not through a concurrency pool. Each image can take up to 60 seconds before timing out, so pasting 5 large images may leave the session waiting for several minutes.

This is the current contract for 1.2.1: do not assume parallel image reads, and do not add a concurrency pool without real 429 / upstream-limit evidence.

## Vision read times out / 读图超时

The default timeout is 60 seconds. Confirm that the mapped model is reachable and its credentials are valid. Administrators can set `visionTimeoutMs` in the plugin profile configuration.

## The final text model was not called / 最终文本模型未调用

This is intentional when vision extraction fails. The plugin returns a friendly error and avoids charging or confusing the text model with incomplete evidence.

## Native multimodal models / 原生多模态模型

Models already declaring image input pass through unchanged and do not use a sidecar mapping.

## Regression baseline / 回归测试基线

Treat the following as the current high-value regression line for future changes. If these scenarios still pass, the plugin remains on its main supported path:

1. **Writable Settings page**
   - Open `设置 → 插件 → 视觉映射` in DSH Web.
   - Confirm the page shows editable selects plus **保存映射 / 编辑 / 删除** instead of read-only YAML-only guidance.
   - Save a mapping and verify it is written into the DSH workspace `settings.yaml` under `vision-link.mappings`.

2. **First-image mapping flow**
   - In a text-only model session, paste one image.
   - Confirm the browser shows the mapping dialog, allows choosing a vision target, and `保存并加入图片` inserts the native attachment chip back into the composer.
   - Confirm the selected main model in the UI does not switch to a wrapper model.

3. **Route-preserving answer flow**
   - Send the message with one pasted image.
   - Confirm the final conversation still reports the original text model as the active model.
   - Confirm the response includes facts visible only in the image, proving the image was actually read.

4. **Same-image repeated question baseline**
   - Reuse the same image in the same session with a different question **while the new message still carries that image**.
   - Expected result after this repair pass: future forensic logging should show a cache miss for the changed question, not stale evidence reuse.
   - Pure text follow-up questions that do not carry the image are a different contract: they reuse the earlier visual evidence already in history instead of re-reading the image.
   - If additional debug logging is temporarily enabled, record cache key, question summary, and hit/miss as the strongest regression evidence.

### Current completion status / 本次完成情况

Verified in the current local DSH environment:

- ✅ Plugin settings are writable from the Web page on the current DSH build.
- ✅ Saving from the page writes the mapping into the DSH workspace `settings.yaml`.
- ✅ Pasting an image in a text-model session triggers the first-image mapping flow.
- ✅ `保存并加入图片` replays the image into the composer as a native attachment.
- ✅ The visible selected model remains the original text model (route-preserving behavior holds).
- ✅ A real fresh-session run showed the assistant reading image-only facts from the uploaded screenshot.
- ⚠️ Same-image / different-question cache behavior has been fixed in code and covered by unit tests, but the strongest real-browser hit/miss forensic proof is still recommended as a next validation step.
