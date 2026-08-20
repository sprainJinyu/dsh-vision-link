import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, createReadOnlyMappingSnapshot, modelKey, SettingsSchema } from '../src/index.js'

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

  it('browser bundle has mapping management and no model-selection mutation', () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    assert.match(source, /settings\.plugins\.tab/)
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
    assert.doesNotMatch(source, /\.select\s*\(/)
    assert.doesNotMatch(source, /selectModel/)
  })
})
