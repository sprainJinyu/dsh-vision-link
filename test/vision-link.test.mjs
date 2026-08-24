import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, buildEvidenceCacheKey, createReadOnlyMappingSnapshot, listNativeImageModels, modelKey, SettingsSchema, attachmentIdentity } from '../src/index.js'
import { intakeReplayMode } from '../src/intake-support.js'

function userMessage(id, content) {
  return { id, role: 'user', source: { kind: 'user' }, content }
}

function createHarness(initialMappings = {}) {
  let settings = SettingsSchema({ mappings: initialMappings })
  let settingsWatcher = null
  let streamListener = null
  const rawCalls = []
  const effects = []
  const rpcRegistrations = []

  const resolveNative = async (provider, model) => ({
    provider,
    id: model,
    name: model,
    inputModalities: /vision-|native-vision/.test(model) ? ['text', 'image'] : ['text'],
  })

  const ctx = {
    settings: {
      register(ns, schema, options) {
        assert.equal(ns, 'vision-link')
        assert.equal(schema, SettingsSchema)
        if (options?.base?.mappings && Object.keys(initialMappings).length === 0) {
          settings = SettingsSchema(options.base)
        }
        options?.validate?.(settings)
        return {
          get: () => settings,
          watch(callback) {
            settingsWatcher = callback
            return () => { settingsWatcher = null }
          },
        }
      },
    },
    llm: {
      resolveModelInfo: resolveNative,
      listProviders() {
        return [{ id: 'provider-a', name: 'A' }, { id: 'provider-b', name: 'B' }]
      },
      async listModels(provider) {
        if (provider === 'provider-a') {
          return [
            { provider, id: 'text-chat', name: 'text-chat', inputModalities: ['text'] },
            { provider, id: 'vision-chat', name: 'vision-chat', inputModalities: ['text', 'image'] },
          ]
        }
        if (provider === 'provider-b') {
          return [
            { provider, id: 'vision-ocr', name: 'vision-ocr', inputModalities: ['text', 'image'] },
          ]
        }
        return []
      },
      stream(options) {
        const downstream = () => rawStream(options)
        return streamListener ? streamListener(options, downstream) : downstream()
      },
    },
    on(name, listener) {
      assert.equal(name, 'llm/stream')
      streamListener = listener
      return () => { streamListener = null }
    },
    effect(factory) {
      effects.push(factory())
    },
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['connection'])
      callback({
        connection: {
          rpc: {
            handle(channel, handler, options) {
              rpcRegistrations.push({ channel, handler, options })
            },
          },
        },
      })
    },
  }

  function rawStream(options) {
    rawCalls.push(options)
    return (async function* () {
      if (/vision-|native-vision/.test(options.model)) {
        yield { type: 'text-delta', index: 0, text: '图片显示 500 Internal Server Error' }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      yield { type: 'text-delta', index: 0, text: '原文本模型回答完成' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }

  return {
    ctx,
    rawCalls,
    rpcRegistrations,
    updateMappings(next) {
      const previous = settings
      settings = SettingsSchema({ mappings: next })
      settingsWatcher?.(settings, previous)
    },
    dispose() {
      effects.reverse().forEach((effect) => effect?.())
    },
  }
}

async function drain(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('DSH Vision Link route-preserving sidecar', () => {
  it('uses an exact provider/model mapping key', () => {
    assert.equal(modelKey('provider-a', 'text-chat'), 'provider-a/text-chat')
  })

  it('advertises composite image admission only for mapped text models', async () => {
    const mapped = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'auto',
      },
    })
    apply(mapped.ctx, {})

    const enhanced = await mapped.ctx.llm.resolveModelInfo('provider-a', 'text-chat')
    assert.equal(enhanced.provider, 'provider-a')
    assert.equal(enhanced.id, 'text-chat')
    assert.deepEqual(enhanced.inputModalities, ['text', 'image'])

    const unmapped = await mapped.ctx.llm.resolveModelInfo('provider-b', 'text-chat')
    assert.deepEqual(unmapped.inputModalities, ['text'])
    mapped.dispose()
  })

  it('never changes the main provider/model while replacing image blocks with evidence', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Same-group Vision', focusPreset: 'ui',
      },
    })
    apply(bench.ctx, {})

    const chunks = await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('m1', [
        { type: 'text', text: '分析这个报错' },
        { type: 'image', attachment: { attachmentId: 'img-route-preserving' } },
      ])],
    }))

    assert.equal(bench.rawCalls.length, 2)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat']],
    )
    const mainContent = bench.rawCalls[1].messages[0].content
    assert.equal(mainContent.some((block) => block.type === 'image'), false)
    assert.match(mainContent[1].text, /视觉证据.*Same-group Vision/s)
    assert.match(chunks.map((chunk) => chunk.text || '').join(''), /原文本模型回答完成/)
  })

  it('passes native multimodal models through without sidecar recursion', async () => {
    const bench = createHarness()
    apply(bench.ctx, {})
    await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'vision-chat',
      messages: [userMessage('m2', [{ type: 'image', attachment: { attachmentId: 'native' } }])],
    }))
    assert.equal(bench.rawCalls.length, 1)
    assert.equal(bench.rawCalls[0].model, 'vision-chat')
    assert.equal(bench.rawCalls[0].messages[0].content[0].type, 'image')
  })

  it('applies Settings mapping updates live', async () => {
    const bench = createHarness()
    apply(bench.ctx, {})
    assert.deepEqual(
      (await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')).inputModalities,
      ['text'],
    )
    bench.updateMappings({
      'provider-a/text-chat': {
        provider: 'provider-b', model: 'vision-ocr', displayName: 'Vision OCR', focusPreset: 'ocr',
      },
    })
    assert.deepEqual(
      (await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')).inputModalities,
      ['text', 'image'],
    )
  })

  it('exposes only a loopback, read-only projection of live mappings', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'ui',
      },
    })
    apply(bench.ctx, {})
    assert.equal(bench.rpcRegistrations.length, 1)
    const registration = bench.rpcRegistrations[0]
    assert.equal(registration.channel, '/vision-link-rpc')
    assert.deepEqual(registration.options, { authority: 'loopback' })
    assert.deepEqual(await registration.handler('mappings.describe', {}), {
      ok: true,
      value: {
        mode: 'read-only',
        mappings: [{
          textModel: 'provider-a/text-chat',
          provider: 'provider-a',
          model: 'vision-chat',
          displayName: 'Vision',
          focusPreset: 'ui',
        }],
      },
    })

    bench.updateMappings({
      'other/text': {
        provider: 'vision', model: 'image', displayName: 'Vision', focusPreset: 'custom', customFocus: '只看错误码',
      },
    })
    const updated = await registration.handler('mappings.describe', {})
    assert.equal(updated.value.mappings[0].textModel, 'other/text')
    assert.equal(updated.value.mappings[0].customFocus, '只看错误码')
  })

  it('does not leak unrelated settings fields in the read-only snapshot', () => {
    const snapshot = createReadOnlyMappingSnapshot({
      apiKey: 'must-not-leak',
      mappings: {
        'text/model': {
          provider: 'vision', model: 'image', displayName: 'Vision', focusPreset: 'auto', apiKey: 'also-private',
        },
      },
    })
    assert.doesNotMatch(JSON.stringify(snapshot), /must-not-leak|also-private|apiKey/)
  })

  it('projects native image models from listModels, not overlayed resolveModelInfo', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'auto',
      },
    })
    apply(bench.ctx, {})
    assert.deepEqual(
      (await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')).inputModalities,
      ['text', 'image'],
    )
    const listed = await listNativeImageModels(bench.ctx.llm)
    assert.deepEqual(listed.map((entry) => `${entry.provider}/${entry.model}`), [
      'provider-a/vision-chat',
      'provider-b/vision-ocr',
    ])
    const registration = bench.rpcRegistrations[0]
    const rpc = await registration.handler('models.native-image', {})
    assert.equal(rpc.ok, true)
    assert.deepEqual(rpc.value.models.map((entry) => `${entry.provider}/${entry.model}`), [
      'provider-a/vision-chat',
      'provider-b/vision-ocr',
    ])
  })

  it('skips a provider whose listModels fails without dropping the rest', async () => {
    const llm = {
      listProviders() {
        return [{ id: 'broken' }, { id: 'provider-a' }]
      },
      async listModels(provider) {
        if (provider === 'broken') throw new Error('catalog down')
        return [{ provider, id: 'vision-chat', name: 'vision-chat', inputModalities: ['text', 'image'] }]
      },
    }
    const listed = await listNativeImageModels(llm)
    assert.deepEqual(listed, [{ provider: 'provider-a', model: 'vision-chat', name: 'vision-chat' }])
  })

  it('returns a friendly result and does not call the text adapter when no mapping exists', async () => {
    const bench = createHarness()
    apply(bench.ctx, {})
    const chunks = await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('m3', [{ type: 'image', attachment: { attachmentId: 'unmapped' } }])],
    }))
    assert.equal(bench.rawCalls.length, 0)
    assert.match(chunks.map((chunk) => chunk.text || '').join(''), /settings\.yaml.*vision-link\.mappings/)
  })

  it('reuses evidence for the same image when the question is unchanged', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'auto',
      },
    })
    apply(bench.ctx, {})

    const request = {
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('same-question', [
        { type: 'text', text: '这个报错是什么意思？' },
        { type: 'image', attachment: { attachmentId: 'img-cache-same' } },
      ])],
    }

    await drain(bench.ctx.llm.stream(request))
    await drain(bench.ctx.llm.stream(request))

    assert.equal(bench.rawCalls.length, 3)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat'], ['provider-a', 'text-chat']],
    )
    bench.dispose()
  })

  it('does not reuse cached evidence when the same image is asked about differently', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'auto',
      },
    })
    apply(bench.ctx, {})

    await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('question-1', [
        { type: 'text', text: '这个报错是什么？' },
        { type: 'image', attachment: { attachmentId: 'img-cache-different' } },
      ])],
    }))
    await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('question-2', [
        { type: 'text', text: '这个报错怎么修？' },
        { type: 'image', attachment: { attachmentId: 'img-cache-different' } },
      ])],
    }))

    assert.equal(bench.rawCalls.length, 4)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat'], ['provider-a', 'vision-chat'], ['provider-a', 'text-chat']],
    )
    bench.dispose()
  })

  it('reuses historical visual evidence when the follow-up has no image', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'auto',
      },
    })
    apply(bench.ctx, {})

    await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('image-turn', [
        { type: 'text', text: '先看看这张图里报错是什么？' },
        { type: 'image', attachment: { attachmentId: 'img-follow-up' } },
      ])],
    }))
    await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [
        userMessage('image-turn', [
          { type: 'text', text: '先看看这张图里报错是什么？' },
          { type: 'image', attachment: { attachmentId: 'img-follow-up' } },
        ]),
        userMessage('text-follow-up', [
          { type: 'text', text: '那具体该怎么修？' },
        ]),
      ],
    }))

    assert.equal(bench.rawCalls.length, 3)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat'], ['provider-a', 'text-chat']],
    )
    const secondMainRequest = bench.rawCalls[2]
    const secondMainText = secondMainRequest.messages
      .flatMap((message) => message.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    assert.match(secondMainText, /那具体该怎么修？/)
    assert.match(secondMainText, /\[视觉证据 图片#1；由 Vision 读取\]/)
    assert.match(secondMainText, /图片显示 500 Internal Server Error/)
    bench.dispose()
  })

  it('uses short hashed cache keys and stable anonymous attachment identities', () => {
    const target = { provider: 'provider-a', model: 'vision-chat', focusPreset: 'auto' }
    const left = {
      type: 'image',
      metadata: { b: 2, a: 1 },
      attachment: { mime: 'image/png' },
    }
    const right = {
      attachment: { mime: 'image/png' },
      metadata: { a: 1, b: 2 },
      type: 'image',
    }

    const leftIdentity = attachmentIdentity(left)
    const rightIdentity = attachmentIdentity(right)
    assert.match(leftIdentity, /^sha:[0-9a-f]{16}$/)
    assert.equal(leftIdentity, rightIdentity)

    const key = buildEvidenceCacheKey(left, target, '解释这个报错')
    assert.match(key, /^vl1:[0-9a-f]{16}$/)
    assert.doesNotMatch(key, /provider-a|vision-chat|解释这个报错|image\/png|\{/)
  })

  it('intake replay mode prefers native hooks, then paste fallback, then config assistant', () => {
    assert.equal(intakeReplayMode({ canInspectModel: true, hasAddImages: true, hasTextarea: true }), 'native-add-images')
    assert.equal(intakeReplayMode({ canInspectModel: true, hasAddImages: false, hasTextarea: true }), 'paste-fallback')
    assert.equal(intakeReplayMode({ canInspectModel: true, hasAddImages: false, hasTextarea: false }), 'config-assistant')
    assert.equal(intakeReplayMode({ canInspectModel: false, hasAddImages: true, hasTextarea: true }), 'config-assistant')
  })

  it('browser bundle keeps intake replay mode ordering aligned with src helper', () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    const normalized = source.replace(/\s+/g, ' ')
    assert.match(normalized, /if \(!canInspectModel\) return 'config-assistant'/)
    assert.match(normalized, /if \(hasAddImages\) return 'native-add-images'/)
    assert.match(normalized, /if \(hasTextarea\) return 'paste-fallback'/)
    const configIndex = source.indexOf("return 'config-assistant'")
    const nativeIndex = source.indexOf("return 'native-add-images'")
    const pasteIndex = source.indexOf("return 'paste-fallback'")
    assert.ok(configIndex >= 0 && nativeIndex >= 0 && pasteIndex >= 0)
    assert.ok(configIndex < nativeIndex)
    assert.ok(nativeIndex < pasteIndex)
  })

  it('browser bundle has mapping management and no model-selection mutation', () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    assert.match(source, /settings\.plugins\.tab/)
    assert.match(source, /models\.native-image/)
    assert.match(source, /nativeImageKeys/)
    assert.match(source, /inputModalities\.includes\('image'\)/)
    assert.match(source, /同分组优先/)
    assert.match(source, /api\.settings\.mutate/)
    assert.match(source, /配置文件模式/)
    assert.match(source, /vision-link-rpc/)
    assert.match(source, /复制当前生效 YAML/)
    assert.match(source, /vision-link-config-actions/)
    assert.match(source, /showBanner\(success\)/)
    assert.doesNotMatch(source, /setNotice\(success\)/)
    assert.match(source, /managementAvailable/)
    assert.match(source, /replayNativeIntake\(files\)/)
    assert.match(source, /nativeIntakeSupport/)
    assert.match(source, /配置助手模式/)
    assert.match(source, /paste-fallback/)
    assert.doesNotMatch(source, /\.select\s*\(/)
    assert.doesNotMatch(source, /selectModel/)
  })
})
