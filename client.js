// DSH Vision Link browser half. Keeps the selected text model unchanged,
// establishes text-to-vision mappings, and contributes a Settings page.

window.__ModuleLoader__.load({
  id: 'dsh-vision-link',
  factory: (require) => {
    'use strict'
    const React = require('react')
    const module = { exports: {} }
    const exports = module.exports

    const SETTINGS_NS = 'vision-link'
    const READ_ONLY_RPC_CHANNEL = '/vision-link-rpc'
    const READ_ONLY_RPC_ENDPOINT = 'mappings.describe'
    const STYLE_ID = 'vision-link-style'
    const TOAST_ID = 'vision-link-client-toast'
    const DIALOG_ID = 'vision-link-mapping-dialog'
    const FOCUS_OPTIONS = [
      ['auto', '自动（结合用户问题）'],
      ['ocr', '文字 / OCR'],
      ['ui', '界面与报错'],
      ['chart', '图表与数据'],
      ['code', '代码与终端'],
      ['custom', '自定义重点'],
    ]

    let api = null
    let connectionRpc = null
    let intakeBusy = false
    let replayingNativeImageIntake = false

    function installStyles() {
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .vision-link-toast{position:fixed;right:24px;bottom:80px;z-index:99990;display:flex;align-items:center;gap:10px;max-width:460px;padding:11px 14px;border:1px solid var(--dsw-alias-border-l2,#475569);border-radius:10px;background:var(--dsw-specific-menu,#1e293b);color:var(--dsw-alias-label-primary,#f1f5f9);box-shadow:0 8px 24px rgba(0,0,0,.35);font:13px/1.5 var(--dsw-font-family,system-ui);transition:opacity .2s,transform .2s}
        .vision-link-toast[data-error=true]{border-color:#ef4444;background:#7f1d1d;color:#fecaca}.vision-link-toast button{flex:none;border:0;border-radius:7px;padding:5px 9px;background:rgba(255,255,255,.12);color:inherit;cursor:pointer}
        .vision-link-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.58);font-family:var(--dsw-font-family,system-ui)}
        .vision-link-dialog{width:min(560px,100%);max-height:85vh;overflow:auto;padding:20px;border:1px solid var(--dsw-alias-border-l2,#475569);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#171a21);color:var(--dsw-alias-label-primary,#f1f5f9);box-shadow:0 18px 60px rgba(0,0,0,.45)}
        .vision-link-dialog h3{margin:0 0 7px;font-size:18px}.vision-link-dialog p{margin:0 0 16px;color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:13px;line-height:1.55}.vision-link-field{display:grid;gap:6px;margin:12px 0}.vision-link-field label{font-size:12px;color:var(--dsw-alias-label-secondary,#cbd5e1)}
        .vision-link-field select,.vision-link-field input{width:100%;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2,#475569);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#0f172a);color:inherit;font:13px inherit}.vision-link-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.vision-link-actions button,.vision-link-settings button{padding:8px 13px;border:1px solid var(--dsw-alias-border-l2,#475569);border-radius:8px;background:transparent;color:inherit;cursor:pointer}.vision-link-actions button[data-primary=true],.vision-link-settings button[data-primary=true]{border-color:#2563eb;background:#2563eb;color:white}
        .vision-link-priority,.vision-link-readonly{display:inline-flex;margin-left:6px;padding:1px 6px;border-radius:10px;background:rgba(37,99,235,.2);color:#93c5fd;font-size:11px}.vision-link-readonly{background:rgba(100,116,139,.22);color:#cbd5e1}
        .vision-link-settings{display:grid;gap:20px;color:var(--dsw-alias-label-primary,#f1f5f9)}.vision-link-settings h3{margin:0;font-size:17px}.vision-link-settings p{margin:6px 0;color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:13px;line-height:1.6}.vision-link-settings-card{padding:20px;border:1px solid var(--dsw-alias-border-l2,#334155);border-radius:12px;background:var(--dsw-alias-bg-layer-1,rgba(15,23,42,.45))}.vision-link-card-heading{display:flex;align-items:center;gap:8px;margin-bottom:4px}.vision-link-map-list{display:grid;gap:12px;margin-top:16px}.vision-link-map-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:15px 16px;border:1px solid var(--dsw-alias-border-l2,#334155);border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(15,23,42,.32))}.vision-link-map-title{font-size:13px;font-weight:600;line-height:1.45;word-break:break-all}.vision-link-map-detail{margin-top:6px;color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:12px;line-height:1.5}.vision-link-map-actions,.vision-link-config-actions{display:flex;align-items:center;gap:10px;margin-top:16px}.vision-link-row-actions{display:flex;gap:8px}.vision-link-candidate-note{margin-top:14px!important}.vision-link-error{color:#fca5a5;font-size:12px}.vision-link-success{color:#86efac;font-size:12px}
        .vision-link-config{margin:20px 0 0;padding:16px;overflow:auto;border:1px solid var(--dsw-alias-border-l2,#334155);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#0f172a);color:var(--dsw-alias-label-secondary,#cbd5e1);font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}
        @media (max-width:640px){.vision-link-settings-card{padding:16px}.vision-link-map-row{grid-template-columns:1fr;padding:14px}.vision-link-map-actions,.vision-link-config-actions{margin-top:14px}}
      `
      document.head.appendChild(style)
    }

    function modelKey(provider, model) {
      return `${provider}/${model}`
    }

    function isWrapperProvider(provider) {
      return provider === 'deepseek-vision-link'
        || String(provider || '').startsWith('vision-link-')
        || String(provider || '').startsWith('modlens-')
    }

    function getReactFiber(node) {
      if (!node) return null
      const key = Object.keys(node).find(
        (name) => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'),
      )
      return key ? node[key] : null
    }

    function findModelContext() {
      const trigger = document.querySelector(
        'button[aria-haspopup="menu"][class*="trigger"], button[class*="ModelSelect"], [class*="ModelSelect_root"] button',
      )
      let fiber = getReactFiber(trigger)
      while (fiber) {
        if (fiber.memoizedProps?.directory) {
          const state = fiber.memoizedProps.directory.getSnapshot?.()
          if (state?.current) return state
        }
        fiber = fiber.return
      }
      return null
    }

    function findInputBarContext() {
      let fiber = getReactFiber(document.querySelector('textarea'))
      while (fiber) {
        if (typeof fiber.memoizedProps?.addImages === 'function') return fiber.memoizedProps
        fiber = fiber.return
      }
      return null
    }

    function showBanner(message, isError = false, action) {
      document.getElementById(TOAST_ID)?.remove()
      const toast = document.createElement('div')
      toast.id = TOAST_ID
      toast.className = 'vision-link-toast'
      toast.dataset.error = String(isError)
      const text = document.createElement('span')
      text.textContent = message
      toast.appendChild(text)
      if (action) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = action.label
        button.addEventListener('click', () => action.run())
        toast.appendChild(button)
      }
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.style.opacity = '0'
        toast.style.transform = 'translateY(8px)'
        setTimeout(() => toast.remove(), 250)
      }, action ? 8000 : 4500)
    }

    function unwrap(response, label) {
      if (!response?.result?.ok) throw new Error(response?.result?.error?.message || `${label}不可用`)
      return response.result.value
    }

    function configuredImageModelKeys(settingsRoot) {
      const piSettings = settingsRoot.namespaces.find((entry) => entry.ns === 'llm-pi-ai')?.value
      const providers = piSettings?.providers || {}
      const keys = new Set()
      Object.entries(providers).forEach(([provider, config]) => {
        const providerInput = Array.isArray(config?.defaultInput) ? config.defaultInput : []
        ;(Array.isArray(config?.models) ? config.models : []).forEach((model) => {
          const declaredInput = Array.isArray(model?.input) && model.input.length > 0
            ? model.input
            : providerInput
          if (typeof model?.id === 'string' && declaredInput.includes('image')) {
            keys.add(modelKey(provider, model.id))
          }
        })
      })
      return keys
    }

    async function readOnlyMappingSnapshot() {
      if (!connectionRpc) return null
      try {
        const result = await connectionRpc.call(READ_ONLY_RPC_CHANNEL, READ_ONLY_RPC_ENDPOINT, {})
        if (!result?.ok) throw new Error(result?.error?.message || '只读映射接口不可用')
        return result.value
      } catch (error) {
        console.warn('[dsh-vision-link] read-only mapping snapshot unavailable:', error)
        return null
      }
    }

    async function loadState(preferredProvider) {
      const [catalogResponse, settingsResponse, readOnlySnapshot] = await Promise.all([
        api.llm.models({}),
        api.settings.describe({}),
        readOnlyMappingSnapshot(),
      ])
      const catalog = unwrap(catalogResponse, '模型目录')
      const settingsRoot = unwrap(settingsResponse, '视觉映射设置')
      const settings = settingsRoot.namespaces.find((entry) => entry.ns === SETTINGS_NS)

      // `llm.models` intentionally exposes selector data only and omits modality
      // metadata. The user's configured pi-ai catalog is the source of truth for
      // explicit image declarations, so join it to the runtime catalog by route.
      const imageModelKeys = configuredImageModelKeys(settingsRoot)

      const groups = (catalog.groups || []).filter((group) => !isWrapperProvider(group.id))
      const allModels = groups.flatMap((group) => (group.models || []).map((model) => ({
        provider: group.id,
        providerName: group.name || group.id,
        model: model.id,
        name: model.name || model.id,
        inputModalities: imageModelKeys.has(modelKey(group.id, model.id)) ? ['text', 'image'] : ['text'],
      })))
      const visionModels = allModels
        .filter((entry) => entry.inputModalities.includes('image'))
        .sort((left, right) => {
          const leftSame = left.provider === preferredProvider ? 0 : 1
          const rightSame = right.provider === preferredProvider ? 0 : 1
          return leftSame - rightSame
            || left.providerName.localeCompare(right.providerName)
            || left.name.localeCompare(right.name)
        })
      const textModels = allModels.filter((entry) => !entry.inputModalities.includes('image'))
      const readOnlyMappings = Object.fromEntries((readOnlySnapshot?.mappings || []).map((entry) => [
        entry.textModel,
        {
          provider: entry.provider,
          model: entry.model,
          ...(entry.displayName ? { displayName: entry.displayName } : {}),
          focusPreset: entry.focusPreset || 'auto',
          ...(entry.customFocus ? { customFocus: entry.customFocus } : {}),
        },
      ]))
      return {
        managementAvailable: Boolean(settings),
        readOnlyAvailable: Boolean(!settings && readOnlySnapshot?.mode === 'read-only'),
        writable: Boolean(settings && settingsRoot.writable),
        revision: settings?.revision,
        mappings: settings?.value?.mappings || readOnlyMappings,
        visionModels,
        textModels,
      }
    }

    async function writeMapping(textModel, target, focusPreset, customFocus, expectedRevision) {
      const key = modelKey(textModel.provider, textModel.model)
      const value = {
        provider: target.provider,
        model: target.model,
        displayName: `${target.providerName} · ${target.name}`,
        focusPreset,
        ...(focusPreset === 'custom' ? { customFocus: customFocus.trim() } : {}),
      }
      const response = await api.settings.mutate({
        ns: SETTINGS_NS,
        ops: [{ op: 'set', path: ['mappings', key], value }],
        expectedRevision,
      })
      unwrap(response, '保存映射')
      return value
    }

    async function removeMapping(key, expectedRevision) {
      const response = await api.settings.mutate({
        ns: SETTINGS_NS,
        ops: [{ op: 'unset', path: ['mappings', key] }],
        expectedRevision,
      })
      unwrap(response, '删除映射')
    }

    function optionLabel(model, preferredProvider) {
      return `${model.providerName} · ${model.name}${model.provider === preferredProvider ? '（同分组优先）' : ''}`
    }

    function mappingDialog(textModel, candidates, initial) {
      document.getElementById(DIALOG_ID)?.remove()
      return new Promise((resolve) => {
        const overlay = document.createElement('div')
        overlay.id = DIALOG_ID
        overlay.className = 'vision-link-overlay'
        const dialog = document.createElement('div')
        dialog.className = 'vision-link-dialog'
        dialog.setAttribute('role', 'dialog')
        dialog.setAttribute('aria-modal', 'true')

        const title = document.createElement('h3')
        title.textContent = initial ? '更新图片理解映射' : '为当前文本模型选择图片理解模型'
        const intro = document.createElement('p')
        intro.textContent = `${textModel.provider}/${textModel.model} 保持为当前回答模型。所选多模态模型只负责读取图片，映射会保存到 DSH Settings。`
        dialog.append(title, intro)

        const modelField = document.createElement('div')
        modelField.className = 'vision-link-field'
        const modelLabel = document.createElement('label')
        modelLabel.textContent = '图片理解模型'
        const modelSelect = document.createElement('select')
        candidates.forEach((candidate, index) => {
          const option = document.createElement('option')
          option.value = String(index)
          option.textContent = optionLabel(candidate, textModel.provider)
          if (initial && candidate.provider === initial.provider && candidate.model === initial.model) option.selected = true
          modelSelect.appendChild(option)
        })
        modelField.append(modelLabel, modelSelect)

        const focusField = document.createElement('div')
        focusField.className = 'vision-link-field'
        const focusLabel = document.createElement('label')
        focusLabel.textContent = '默认解读重点'
        const focusSelect = document.createElement('select')
        FOCUS_OPTIONS.forEach(([value, label]) => {
          const option = document.createElement('option')
          option.value = value
          option.textContent = label
          if ((initial?.focusPreset || 'auto') === value) option.selected = true
          focusSelect.appendChild(option)
        })
        focusField.append(focusLabel, focusSelect)

        const customField = document.createElement('div')
        customField.className = 'vision-link-field'
        const customLabel = document.createElement('label')
        customLabel.textContent = '自定义解读重点'
        const customInput = document.createElement('input')
        customInput.placeholder = '例如：重点核对订单号、金额和红色告警'
        customInput.value = initial?.customFocus || ''
        customField.append(customLabel, customInput)
        const syncCustom = () => { customField.style.display = focusSelect.value === 'custom' ? 'grid' : 'none' }
        focusSelect.addEventListener('change', syncCustom)
        syncCustom()

        const actions = document.createElement('div')
        actions.className = 'vision-link-actions'
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = '取消'
        const save = document.createElement('button')
        save.type = 'button'
        save.dataset.primary = 'true'
        save.textContent = initial ? '更新映射' : '保存并加入图片'
        actions.append(cancel, save)
        dialog.append(modelField, focusField, customField, actions)
        overlay.appendChild(dialog)
        document.body.appendChild(overlay)

        const finish = (value) => {
          overlay.remove()
          resolve(value)
        }
        cancel.addEventListener('click', () => finish(null))
        overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(null) })
        save.addEventListener('click', () => {
          if (focusSelect.value === 'custom' && !customInput.value.trim()) {
            customInput.focus()
            return
          }
          finish({
            target: candidates[Number(modelSelect.value)],
            focusPreset: focusSelect.value,
            customFocus: customInput.value,
          })
        })
        modelSelect.focus()
      })
    }

    async function replayNativeIntake(files) {
      replayingNativeImageIntake = true
      try {
        const input = findInputBarContext()
        if (typeof input?.addImages === 'function') {
          const error = input.addImages(files)
          if (error) showBanner(String(error), true)
          return
        }
        const textarea = document.querySelector('textarea')
        if (!textarea) throw new Error('找不到对话输入框')
        const transfer = new DataTransfer()
        files.forEach((file) => transfer.items.add(file))
        textarea.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }))
      } finally {
        setTimeout(() => { replayingNativeImageIntake = false }, 100)
      }
    }

    async function handleImageFiles(files, event) {
      if (replayingNativeImageIntake || intakeBusy || files.length === 0) return
      const modelState = findModelContext()
      const current = modelState?.current
      if (!current || isWrapperProvider(current.provider)) return
      const group = modelState.groups?.find((entry) => entry.id === current.provider)
      const currentInfo = group?.models?.find((entry) => entry.id === current.model)
      if (currentInfo?.inputModalities?.includes('image')) return

      event?.preventDefault()
      event?.stopImmediatePropagation()
      intakeBusy = true
      const textModel = { provider: current.provider, model: current.model }
      try {
        const state = await loadState(current.provider)
        if (!state.managementAvailable) {
          const mapping = state.mappings[modelKey(current.provider, current.model)]
          if (state.readOnlyAvailable && mapping) {
            showBanner(`由 ${mapping.displayName || `${mapping.provider}/${mapping.model}`} 读取图片（settings.yaml 只读映射）；当前模型保持为 ${current.model}`)
          } else if (state.readOnlyAvailable) {
            showBanner(`当前模型没有配置图片映射；图片可以加入，但发送时 DSH 会友好拒绝。请在 settings.yaml 中添加映射。当前模型保持为 ${current.model}`, true)
          } else {
            showBanner(`页面管理未开放；图片将按 settings.yaml 的服务端映射处理。当前 DSH 不支持读取映射快照，若尚未配置，发送时会拒绝。当前模型保持为 ${current.model}`)
          }
          await replayNativeIntake(files)
          return
        }
        if (state.visionModels.length === 0) {
          showBanner('没有找到 DSH Settings 中声明支持 image 的模型。图片未加入，请先配置多模态模型。', true)
          return
        }
        const key = modelKey(current.provider, current.model)
        let mapping = state.mappings[key]
        let candidate = mapping && state.visionModels.find(
          (entry) => entry.provider === mapping.provider && entry.model === mapping.model,
        )
        if (!candidate) {
          const choice = await mappingDialog(textModel, state.visionModels, null)
          if (!choice) return
          mapping = await writeMapping(
            textModel,
            choice.target,
            choice.focusPreset,
            choice.customFocus,
            state.revision,
          )
          candidate = choice.target
        }
        showBanner(`由 ${mapping.displayName || `${candidate.provider}/${candidate.model}`} 读取图片；当前模型保持为 ${current.model}`)
        await replayNativeIntake(files)
      } catch (error) {
        showBanner(`图片映射失败：${error instanceof Error ? error.message : String(error)}`, true)
      } finally {
        intakeBusy = false
      }
    }

    function extractImageFiles(itemsOrFiles) {
      const files = []
      for (const item of Array.from(itemsOrFiles || [])) {
        if (item instanceof File && item.type.startsWith('image/')) files.push(item)
        else if (typeof item?.getAsFile === 'function') {
          const file = item.getAsFile()
          if (file?.type?.startsWith('image/')) files.push(file)
        }
      }
      return files
    }

    function yamlString(value) {
      return JSON.stringify(String(value))
    }

    function mappingsYaml(mappings) {
      const entries = Object.entries(mappings || {}).sort(([left], [right]) => left.localeCompare(right))
      if (entries.length === 0) return 'vision-link:\n  mappings: {}'
      const lines = ['vision-link:', '  mappings:']
      entries.forEach(([key, mapping]) => {
        lines.push(`    ${yamlString(key)}:`)
        lines.push(`      provider: ${yamlString(mapping.provider)}`)
        lines.push(`      model: ${yamlString(mapping.model)}`)
        if (mapping.displayName) lines.push(`      displayName: ${yamlString(mapping.displayName)}`)
        lines.push(`      focusPreset: ${yamlString(mapping.focusPreset || 'auto')}`)
        if (mapping.focusPreset === 'custom' && mapping.customFocus) {
          lines.push(`      customFocus: ${yamlString(mapping.customFocus)}`)
        }
      })
      return lines.join('\n')
    }

    function VisionMappingSettings() {
      const [state, setState] = React.useState({ status: 'loading', data: null, error: null })
      const [textKey, setTextKey] = React.useState('')
      const [visionKey, setVisionKey] = React.useState('')
      const [focusPreset, setFocusPreset] = React.useState('auto')
      const [customFocus, setCustomFocus] = React.useState('')
      const [notice, setNotice] = React.useState('')

      const load = React.useCallback(async () => {
        setState((previous) => ({ ...previous, status: 'loading', error: null }))
        try {
          const data = await loadState()
          setState({ status: 'ready', data, error: null })
          setTextKey((value) => value || (data.textModels[0] ? modelKey(data.textModels[0].provider, data.textModels[0].model) : ''))
          setVisionKey((value) => value || (data.visionModels[0] ? modelKey(data.visionModels[0].provider, data.visionModels[0].model) : ''))
        } catch (error) {
          setState({ status: 'error', data: null, error: error instanceof Error ? error.message : String(error) })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])
      const data = state.data

      const configExample = () => {
        const text = data?.textModels.find((entry) => modelKey(entry.provider, entry.model) === textKey)
          || data?.textModels[0]
        const vision = data?.visionModels.find((entry) => modelKey(entry.provider, entry.model) === visionKey)
          || data?.visionModels[0]
        if (!text || !vision) return 'vision-link:\n  mappings: {}'
        return mappingsYaml({
          [modelKey(text.provider, text.model)]: {
            provider: vision.provider,
            model: vision.model,
            displayName: `${vision.providerName} · ${vision.name}`,
            focusPreset,
            ...(focusPreset === 'custom' && customFocus.trim() ? { customFocus: customFocus.trim() } : {}),
          },
        })
      }

      const copy = async (text, success) => {
        setNotice('')
        try {
          await navigator.clipboard.writeText(text)
          showBanner(success)
        } catch (error) {
          showBanner(`复制失败：${error instanceof Error ? error.message : String(error)}`, true)
        }
      }

      const edit = (key, mapping) => {
        setTextKey(key)
        setVisionKey(modelKey(mapping.provider, mapping.model))
        setFocusPreset(mapping.focusPreset || 'auto')
        setCustomFocus(mapping.customFocus || '')
        setNotice('已载入映射，修改后点击“保存映射”。')
      }

      const save = async () => {
        const text = data?.textModels.find((entry) => modelKey(entry.provider, entry.model) === textKey)
        const vision = data?.visionModels.find((entry) => modelKey(entry.provider, entry.model) === visionKey)
        if (!text || !vision) return
        if (focusPreset === 'custom' && !customFocus.trim()) {
          setNotice('自定义解读重点不能为空。')
          return
        }
        try {
          await writeMapping(text, vision, focusPreset, customFocus, data.revision)
          setNotice('映射已保存并立即生效。')
          await load()
        } catch (error) {
          setNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      const remove = async (key) => {
        try {
          await removeMapping(key, data.revision)
          setNotice('映射已删除。下次贴图时会重新询问。')
          await load()
        } catch (error) {
          setNotice(`删除失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (state.status === 'loading' && !data) return React.createElement('p', null, '正在读取模型与映射…')
      if (state.error) return React.createElement('p', { className: 'vision-link-error' }, state.error)
      const mappings = Object.entries(data.mappings || {})
      if (!data.managementAvailable) return React.createElement('div', { className: 'vision-link-settings' },
        React.createElement('div', null,
          React.createElement('h3', null, '视觉模型映射（配置文件模式）'),
          React.createElement('p', null, data.readOnlyAvailable
            ? '🔒 本页是只读配置助手，不能直接保存（正常现象，不是故障）。配置只需：1. 选择模型；2. 复制 YAML；3. 点击右上角“打开配置文件”，合并到 settings.yaml。保存后若未自动生效，请重启 DSH。'
            : '本页不能直接保存映射。请在下方生成并复制 YAML，再点击右上角“打开配置文件”，将内容合并到 settings.yaml；当前文本模型不会切换。'),
        ),
        React.createElement('div', { className: 'vision-link-settings-card' },
          React.createElement('h3', { className: 'vision-link-card-heading' }, '当前生效映射', data.readOnlyAvailable && React.createElement('span', { className: 'vision-link-readonly' }, '只读')),
          !data.readOnlyAvailable
            ? React.createElement('p', null, '当前版本无法从网页核对服务端映射，请直接检查 settings.yaml。')
            : mappings.length === 0
              ? React.createElement('p', null, '服务端当前没有生效的精确模型映射。')
              : React.createElement('div', { className: 'vision-link-map-list' }, mappings.map(([key, mapping]) => React.createElement('div', { key, className: 'vision-link-map-row' },
                React.createElement('div', null,
                  React.createElement('div', { className: 'vision-link-map-title' }, key),
                  React.createElement('div', { className: 'vision-link-map-detail' }, `→ ${mapping.displayName || `${mapping.provider}/${mapping.model}`} · ${FOCUS_OPTIONS.find(([value]) => value === (mapping.focusPreset || 'auto'))?.[1] || '自动'}`),
                ),
              ))),
          data.readOnlyAvailable && React.createElement('div', { className: 'vision-link-map-actions' },
            React.createElement('button', {
              type: 'button', disabled: mappings.length === 0,
              onClick: () => { void copy(mappingsYaml(data.mappings), '已复制当前生效映射的 YAML。') },
            }, '复制当前生效 YAML'),
          ),
        ),
        React.createElement('div', { className: 'vision-link-settings-card' },
          React.createElement('h3', { className: 'vision-link-card-heading' }, '生成新映射配置'),
          React.createElement('p', null, '选择后复制配置，再通过右上角“打开配置文件”合并到 settings.yaml。本页不会直接保存。'),
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '文本模型'),
            React.createElement('select', { value: textKey, onChange: (event) => setTextKey(event.target.value) },
              data.textModels.map((entry) => React.createElement('option', { key: modelKey(entry.provider, entry.model), value: modelKey(entry.provider, entry.model) }, `${entry.providerName} · ${entry.name}`)),
            ),
          ),
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '图片理解模型'),
            React.createElement('select', { value: visionKey, onChange: (event) => setVisionKey(event.target.value) },
              [...data.visionModels].sort((left, right) => Number(right.provider === textKey.split('/')[0]) - Number(left.provider === textKey.split('/')[0])).map((entry) => React.createElement('option', {
                key: modelKey(entry.provider, entry.model), value: modelKey(entry.provider, entry.model),
              }, optionLabel(entry, textKey.split('/')[0]))),
            ),
          ),
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '解读重点'),
            React.createElement('select', { value: focusPreset, onChange: (event) => setFocusPreset(event.target.value) },
              FOCUS_OPTIONS.map(([value, label]) => React.createElement('option', { key: value, value }, label)),
            ),
          ),
          focusPreset === 'custom' && React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '自定义解读重点'),
            React.createElement('input', { value: customFocus, onChange: (event) => setCustomFocus(event.target.value), placeholder: '例如：重点核对订单号和金额' }),
          ),
          React.createElement('pre', { className: 'vision-link-config' }, configExample()),
          React.createElement('div', { className: 'vision-link-config-actions' },
            React.createElement('button', {
              type: 'button', 'data-primary': 'true', disabled: !textKey || !visionKey || (focusPreset === 'custom' && !customFocus.trim()),
              onClick: () => { void copy(configExample(), '已复制。请点击右上角“打开配置文件”，将内容合并到 settings.yaml。') },
            }, '复制配置 YAML'),
          ),
          React.createElement('p', { className: 'vision-link-candidate-note' }, `检测到 ${data.visionModels.length} 个明确声明支持 image 的候选模型；同分组候选优先。修改后若未自动加载，请重启 DSH。`),
        ),
      )
      return React.createElement('div', { className: 'vision-link-settings' },
        React.createElement('div', null,
          React.createElement('h3', null, '视觉模型映射'),
          React.createElement('p', null, '文本模型仍负责回答；多模态模型仅把图片转换为视觉证据。候选项只来自 DSH 模型目录中明确声明支持 image 的模型，同分组候选优先。'),
        ),
        React.createElement('div', { className: 'vision-link-settings-card' },
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '文本模型'),
            React.createElement('select', { value: textKey, onChange: (event) => setTextKey(event.target.value) },
              data.textModels.map((entry) => React.createElement('option', {
                key: modelKey(entry.provider, entry.model), value: modelKey(entry.provider, entry.model),
              }, `${entry.providerName} · ${entry.name}`)),
            ),
          ),
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '图片理解模型'),
            React.createElement('select', { value: visionKey, onChange: (event) => setVisionKey(event.target.value) },
              [...data.visionModels].sort((left, right) => {
                const provider = textKey.split('/')[0]
                return Number(right.provider === provider) - Number(left.provider === provider)
              }).map((entry) => React.createElement('option', {
                key: modelKey(entry.provider, entry.model), value: modelKey(entry.provider, entry.model),
              }, optionLabel(entry, textKey.split('/')[0]))),
            ),
          ),
          React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '默认解读重点'),
            React.createElement('select', { value: focusPreset, onChange: (event) => setFocusPreset(event.target.value) },
              FOCUS_OPTIONS.map(([value, label]) => React.createElement('option', { key: value, value }, label)),
            ),
          ),
          focusPreset === 'custom' && React.createElement('div', { className: 'vision-link-field' },
            React.createElement('label', null, '自定义解读重点'),
            React.createElement('input', { value: customFocus, onChange: (event) => setCustomFocus(event.target.value), placeholder: '例如：重点核对订单号和金额' }),
          ),
          React.createElement('button', { type: 'button', 'data-primary': 'true', disabled: !data.writable, onClick: () => { void save() } }, '保存映射'),
          notice && React.createElement('p', { className: notice.includes('失败') || notice.includes('不能') ? 'vision-link-error' : 'vision-link-success' }, notice),
        ),
        React.createElement('div', { className: 'vision-link-map-list' },
          mappings.length === 0
            ? React.createElement('p', null, '尚未建立映射；也可以在文本模型中首次贴图时选择。')
            : mappings.map(([key, mapping]) => React.createElement('div', { key, className: 'vision-link-map-row' },
              React.createElement('div', null,
                React.createElement('div', { className: 'vision-link-map-title' }, key),
                React.createElement('div', { className: 'vision-link-map-detail' }, `→ ${mapping.displayName || `${mapping.provider}/${mapping.model}`} · ${FOCUS_OPTIONS.find(([value]) => value === (mapping.focusPreset || 'auto'))?.[1] || '自动'}`),
              ),
              React.createElement('div', { className: 'vision-link-row-actions' },
                React.createElement('button', { type: 'button', onClick: () => edit(key, mapping) }, '编辑'),
                React.createElement('button', { type: 'button', onClick: () => { void remove(key) } }, '删除'),
              ),
            )),
        ),
      )
    }

    function apply(ctx) {
      installStyles()
      const connection = ctx.get('connection')
      api = connection?.api
      connectionRpc = connection?.rpc || null
      if (!api) throw new Error('dsh-vision-link: connection service unavailable')

      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'vision-link',
        order: 30,
        label: '视觉映射',
      }, VisionMappingSettings))

      const onPaste = (event) => {
        if (replayingNativeImageIntake) return
        const files = extractImageFiles(event.clipboardData?.items)
        if (files.length > 0) void handleImageFiles(files, event)
      }
      const onDrop = (event) => {
        if (replayingNativeImageIntake) return
        const files = extractImageFiles(event.dataTransfer?.files)
        if (files.length > 0) void handleImageFiles(files, event)
      }
      const onChange = (event) => {
        if (replayingNativeImageIntake) return
        const target = event.target
        if (target?.tagName === 'INPUT' && target.type === 'file') {
          const files = extractImageFiles(target.files)
          if (files.length > 0) void handleImageFiles(files, event)
        }
      }
      document.addEventListener('paste', onPaste, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('change', onChange, true)

      return () => {
        document.removeEventListener('paste', onPaste, true)
        document.removeEventListener('drop', onDrop, true)
        document.removeEventListener('change', onChange, true)
        document.getElementById(DIALOG_ID)?.remove()
        document.getElementById(TOAST_ID)?.remove()
      }
    }

    exports.name = 'dsh-vision-link'
    exports.inject = ['slots', 'connection']
    exports.apply = apply
    return module.exports
  },
})
