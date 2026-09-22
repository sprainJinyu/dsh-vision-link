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
  const webRoutes = []

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
      if (dependencies.includes('webServer')) {
        callback({
          webServer: {
            register(route) {
              webRoutes.push(route)
              return () => {
                const idx = webRoutes.indexOf(route)
                if (idx !== -1) webRoutes.splice(idx, 1)
              }
            },
          },
          effect(factory) {
            effects.push(factory())
          },
        })
      }
      if (dependencies.includes('connection')) {
        callback({
          connection: {
            rpc: {
              handle(channel, handler, options) {
                rpcRegistrations.push({ channel, handler, options })
              },
            },
          },
        })
      }
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
    webRoutes,
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

  it('browser bundle initializes successfully on modern DSH context without connection.api', () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    let factory = null
    const origWindow = globalThis.window
    const origDoc = globalThis.document
    try {
      globalThis.window = {
        __ModuleLoader__: {
          load({ factory: f }) { factory = f },
        },
      }
      globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      // eslint-disable-next-line no-eval
      eval(source)
      assert.ok(typeof factory === 'function')
      const plugin = factory((id) => {
        if (id === 'react') return { createElement: () => {} }
        throw new Error(`unknown module ${id}`)
      })
      assert.equal(plugin.name, 'dsh-vision-link')
      assert.deepEqual(plugin.inject, ['slots', 'connection', 'remote', 'remote.session', 'remote.settings'])

      let registered = null
      const modernRemote = {
        session: {
          modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
        },
        settings: {
          describe: async () => ({ ok: true, value: { writable: true, namespaces: [] } }),
          mutate: async () => ({ ok: true, value: {} }),
        },
      }
      const modernCtx = {
        remote: modernRemote,
        get(name) {
          if (name === 'connection') {
            return {
              isLoopback: true,
              rpc: { call: async () => ({ ok: true, value: {} }) },
            }
          }
          if (name === 'remote') return modernRemote
          if (name === 'remote.session') return modernRemote.session
          if (name === 'remote.settings') return modernRemote.settings
          return undefined
        },
        slots: {
          inject: (_name, cb) => cb(),
          register: (meta, component) => { registered = { meta, component } },
        },
      }

      const cleanup = plugin.apply(modernCtx)
      assert.ok(registered)
      assert.equal(registered.meta.id, 'vision-link')
      assert.equal(registered.meta.label, '视觉映射')
      assert.equal(typeof cleanup, 'function')
      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('browser bundle initializes successfully with legacy connection.api fallback', () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    let factory = null
    const origWindow = globalThis.window
    const origDoc = globalThis.document
    try {
      globalThis.window = {
        __ModuleLoader__: {
          load({ factory: f }) { factory = f },
        },
      }
      globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      // eslint-disable-next-line no-eval
      eval(source)
      const plugin = factory((id) => {
        if (id === 'react') return { createElement: () => {} }
        throw new Error(`unknown module ${id}`)
      })

      let registered = null
      const legacyCtx = {
        get(name) {
          if (name === 'connection') {
            return {
              api: {
                llm: { models: async () => ({ result: { ok: true, value: { groups: [] } } }) },
                settings: { describe: async () => ({ result: { ok: true, value: { writable: true, namespaces: [] } } }) },
              },
              rpc: { call: async () => ({ ok: true, value: {} }) },
            }
          }
          return undefined
        },
        slots: {
          inject: (_name, cb) => cb(),
          register: (meta, component) => { registered = { meta, component } },
        },
      }

      const cleanup = plugin.apply(legacyCtx)
      assert.ok(registered)
      assert.equal(registered.meta.id, 'vision-link')
      assert.equal(typeof cleanup, 'function')
      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('registers direct webServer route and serves native image models and mappings', async () => {
    const bench = createHarness({
      'provider-a/text-chat': {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Vision', focusPreset: 'ocr',
      },
    })
    apply(bench.ctx, {})
    assert.equal(bench.webRoutes.length, 1)
    const route = bench.webRoutes[0]
    assert.equal(route.kind, 'prefix')
    assert.equal(route.path, '/vision-link-rpc')

    // Helper to simulate request/response
    const mockRequest = (endpoint, payload) => {
      const req = (async function* () {
        yield Buffer.from(JSON.stringify({
          type: 'client-request',
          rpcId: 'test-rpc-1',
          method: endpoint,
          payload,
        }))
      })()
      req.method = 'POST'
      req.url = `/vision-link-rpc/${endpoint}`

      let statusCode = 0
      let headers = {}
      let body = ''
      const res = {
        writeHead(code, h) { statusCode = code; headers = h },
        end(data) { if (data) body += data },
      }
      return { req, res, getResult: () => ({ statusCode, headers, body: JSON.parse(body || '{}') }) }
    }

    // Test models.native-image endpoint
    const { req: req1, res: res1, getResult: getResult1 } = mockRequest('models.native-image', {})
    await route.handler(req1, res1)
    const out1 = getResult1()
    assert.equal(out1.statusCode, 200)
    assert.equal(out1.body.type, 'server-response')
    assert.equal(out1.body.rpcId, 'test-rpc-1')
    assert.ok(out1.body.result?.ok)
    assert.deepEqual(out1.body.result.value.models, [
      { provider: 'provider-a', model: 'vision-chat', name: 'vision-chat' },
      { provider: 'provider-b', model: 'vision-ocr', name: 'vision-ocr' },
    ])

    // Test mappings.describe endpoint
    const { req: req2, res: res2, getResult: getResult2 } = mockRequest('mappings.describe', {})
    await route.handler(req2, res2)
    const out2 = getResult2()
    assert.equal(out2.statusCode, 200)
    assert.ok(out2.body.result?.ok)
    assert.equal(out2.body.result.value.mappings[0]?.model, 'vision-chat')
  })

  it('browser bundle discovers candidate vision models from settings namespaces', async () => {
    const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    let factory = null
    const origWindow = globalThis.window
    const origDoc = globalThis.document
    try {
      globalThis.window = {
        __ModuleLoader__: { load({ factory: f }) { factory = f } },
      }
      globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
        head: { appendChild: () => {} },
        body: { appendChild: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      // eslint-disable-next-line no-eval
      eval(source)
      let componentFn = null
      let mockReactState = []
      let stateIndex = 0
      const mockReact = {
        createElement: () => ({}),
        useState(initial) {
          const idx = stateIndex++
          if (mockReactState[idx] === undefined) {
            mockReactState[idx] = typeof initial === 'function' ? initial() : initial
          }
          return [mockReactState[idx], (updater) => {
            mockReactState[idx] = typeof updater === 'function' ? updater(mockReactState[idx]) : updater
          }]
        },
        useCallback: (fn) => fn,
        useEffect: (cb) => { cb() },
      }
      const plugin = factory((id) => {
        if (id === 'react') return mockReact
        throw new Error(`unknown module ${id}`)
      })

      const testSettings = {
        writable: true,
        namespaces: [
          {
            ns: 'llm-pi-ai',
            value: {
              providers: {
                'top-zjy': {
                  displayName: 'Top ZJY',
                  models: [
                    { id: 'ds-v4-flash', name: 'ds-v4-flash', input: ['text'] },
                    { id: 'qwen3.8-max', name: 'qwen3.8-max-top', input: ['text', 'image'] },
                  ],
                },
                'gemini-free': {
                  displayName: 'Google Gemini',
                  models: [
                    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', input: ['text', 'image'] },
                  ],
                },
              },
            },
          },
        ],
      }

      const testCatalog = {
        groups: [
          {
            id: 'top-zjy',
            name: 'Top ZJY',
            models: [
              { id: 'ds-v4-flash', name: 'ds-v4-flash' },
              { id: 'qwen3.8-max', name: 'qwen3.8-max-top' },
            ],
          },
          {
            id: 'gemini-free',
            name: 'Google Gemini',
            models: [
              { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
            ],
          },
        ],
      }

      const mockCtx = {
        remote: {
          session: { modelCatalog: async () => ({ ok: true, value: testCatalog }) },
          settings: {
            describe: async () => ({ ok: true, value: testSettings }),
            mutate: async () => ({ ok: true, value: {} }),
          },
        },
        get(name) {
          if (name === 'connection') {
            return {
              isLoopback: true,
              rpc: { call: async () => ({ ok: true, value: { models: [] } }) }, // simulated empty RPC
            }
          }
          if (name === 'remote') return this.remote
          if (name === 'remote.session') return this.remote.session
          if (name === 'remote.settings') return this.remote.settings
          return undefined
        },
        slots: {
          inject: (_name, cb) => cb(),
          register: (_meta, comp) => { componentFn = comp },
        },
      }

      plugin.apply(mockCtx)
      assert.ok(componentFn)

      // Verify the component renders and calls load
      stateIndex = 0
      componentFn()
      // Let load callback complete
      await new Promise((r) => setTimeout(r, 20))
      // Check that state.data has visionModels populated from settings
      const stateObj = mockReactState[0]
      assert.equal(stateObj.status, 'ready')
      assert.equal(stateObj.data.visionModels.length, 2)
      assert.ok(stateObj.data.visionModels.some((m) => m.model === 'qwen3.8-max'))
      assert.ok(stateObj.data.visionModels.some((m) => m.model === 'gemini-3.5-flash'))
      assert.equal(stateObj.data.textModels.length, 1)
      assert.equal(stateObj.data.textModels[0].model, 'ds-v4-flash')
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('falls back to defaultTarget when a text model is unmapped', async () => {
    const bench = createHarness()
    bench.updateMappings({})
    apply(bench.ctx, {
      defaultTarget: {
        provider: 'provider-a', model: 'vision-chat', displayName: 'Default Vision', focusPreset: 'auto',
      },
    })

    const enhanced = await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')
    assert.deepEqual(enhanced.inputModalities, ['text', 'image'])

    const chunks = await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('m1', [
        { type: 'text', text: '请分析图片' },
        { type: 'image', attachment: { attachmentId: 'img-default-target' } },
      ])],
    }))

    assert.equal(bench.rawCalls.length, 2)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat']],
    )
    bench.dispose()
  })

  it('auto-falls back to same-provider native image model when autoFallback is enabled', async () => {
    const bench = createHarness()
    apply(bench.ctx, { autoFallback: true })

    // provider-a has text-chat and vision-chat
    const enhanced = await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')
    assert.deepEqual(enhanced.inputModalities, ['text', 'image'])

    const chunks = await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('m2', [
        { type: 'text', text: '自动查找同组视觉模型' },
        { type: 'image', attachment: { attachmentId: 'img-auto-fallback' } },
      ])],
    }))

    assert.equal(bench.rawCalls.length, 2)
    assert.deepEqual(
      bench.rawCalls.map((call) => [call.provider, call.model]),
      [['provider-a', 'vision-chat'], ['provider-a', 'text-chat']],
    )
    bench.dispose()
  })

  it('gracefully strips images and invokes text adapter when gracefulDegrade is enabled ("没有就没有了")', async () => {
    const bench = createHarness()
    apply(bench.ctx, { gracefulDegrade: true })

    const enhanced = await bench.ctx.llm.resolveModelInfo('provider-a', 'text-chat')
    assert.deepEqual(enhanced.inputModalities, ['text', 'image'])

    const chunks = await drain(bench.ctx.llm.stream({
      provider: 'provider-a',
      model: 'text-chat',
      messages: [userMessage('m3', [
        { type: 'text', text: '无视觉模型时的提问' },
        { type: 'image', attachment: { attachmentId: 'img-no-vision' } },
      ])],
    }))

    // Text model IS called directly with image stripped!
    assert.equal(bench.rawCalls.length, 1)
    assert.equal(bench.rawCalls[0].provider, 'provider-a')
    assert.equal(bench.rawCalls[0].model, 'text-chat')
    const sentContent = bench.rawCalls[0].messages[0].content
    assert.equal(sentContent.some((b) => b.type === 'image'), false)
    assert.match(sentContent[1].text, /附图已略过/s)
    bench.dispose()
  })
})
