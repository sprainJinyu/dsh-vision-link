# dsh-vision-link 第一轮修复与验证总结（收口归档）

## 1. 本轮目标

本轮工作的目标不是扩功能，而是把 `dsh-vision-link` 的第一批高风险问题压实、修掉，并形成未来改动的基准线：

1. 修复 **同图不同问复用旧视觉证据** 的缓存 correctness 问题；
2. 在客户端 Fiber / DOM 挂钩失效时，不再静默失败，而是明确降级为配置助手；
3. 把真实浏览器验证沉淀为可复用的回归测试基线；
4. 核实当前新版 DSH 上，插件页是否已经开放写入 `settings`；
5. 评估是否还能进一步拿到 live cache hit/miss 的运行时日志证据。

---

## 2. 已完成修复

### 2.1 服务端缓存 key 修复

已修改 `D:\develop\dsh\my-create-plugins\dsh-vision-link\src\index.js`：

- 视觉证据缓存 key 现在包含 **当前用户问题文本**；
- 同一张图、同一目标模型、同一 focus，但**问题不同**时，不再复用旧 evidence；
- 同一问题仍保留既有缓存收益与 in-flight dedup 行为。

这解决了原先最危险的 correctness 风险：
> 第一次问“这是什么报错？”，第二次问“怎么修？”，却仍然吃到第一次生成的视觉证据。

### 2.2 客户端降级路径补强

已修改 `D:\develop\dsh\my-create-plugins\dsh-vision-link\client.js`：

- 新增 `nativeIntakeSupport()` 统一判断当前页面是否还能：
  - 识别当前文本模型；
  - 将图片重新回放进输入框；
- 当 Fiber / DOM 集成点失效时，不再静默返回；
- 会明确提示：
  - 当前页面无法确认模型；
  - 当前页面未暴露图片回放接口；
  - 已退化为**配置助手模式**，应优先检查 `settings.yaml`。

### 2.3 文档对齐真实行为

已更新：

- `README.md`
- `README.zh-CN.md`
- `docs/TROUBLESHOOTING.md`
- `docs/ARCHITECTURE.md`

修正点：

- 不再把“立即保存、零重启”写成所有环境的默认事实；
- 明确区分：
  - 新版 / 当前 Host：支持页面直接保存；
  - 旧版 / 受限 Host：退回只读 / YAML 路线；
- 明确浏览器无感贴图依赖当前 DSH Web 集成点，挂了就降级而不是假装丝滑。

---

## 3. 自动化测试结果

测试文件：
- `D:\develop\dsh\my-create-plugins\dsh-vision-link\test\vision-link.test.mjs`

已补充的关键用例：

1. 同图同问仍可复用 evidence；
2. 同图不同问不再复用 stale evidence；
3. browser bundle 含降级辅助逻辑存在性校验。

### 当前结果

```bash
cd /d/develop/dsh/my-create-plugins/dsh-vision-link
node --test test/vision-link.test.mjs
```

- **11 / 11 通过**

结论：
> 自动化测试已覆盖本轮最关键的缓存修复语义，且未发现回归。

---

## 4. 真机浏览器验证结论

通过 tappi 对本地 DSH Web 进行了真实浏览器验证。

### 4.1 插件设置页已确认可写

已在：
- `设置 → 插件 → 视觉映射`

页面中真实看到并验证：
- 文本模型下拉
- 图片理解模型下拉
- Focus preset 下拉
- `保存映射`
- `编辑`
- `删除`

并且点击保存后，映射真实写入：
- `D:\develop\dsh\settings.yaml`

这已经核实：
> 当前新版 DSH / 当前 Host 上，`vision-link` 命名空间确实已经开放页面配置写入。

### 4.2 首次贴图流程真实可用

使用本地测试图片：
- `D:\develop\dsh\my-create-plugins\test-vision-link-ui.png`

验证到：

1. 文本模型会话中贴图，能触发首次映射选择对话框；
2. 点击 `保存并加入图片` 后，图片会作为**原生附件 chip** 回放进输入框；
3. 过程没有切换模型选择 UI；
4. 页面上仍显示原文本模型（如 `deepseek-v4-flash` / `ds-v4-flash-top`）。

### 4.3 图像内容真实进入回答语义链

在全新会话中，检查了压缩后的 DSH session log，确认：

- 用户消息中真实包含 `image` attachment；
- assistant 的 reasoning / text 中真实出现了图片里的内容，例如：
  - `Build failed`
  - `HTTP 500 Internal Server Error`
  - `NullPointerException at FooService:42`
  - `Order ID: A12345`
  - `Amount: 99.00`

这说明：
> 不是“UI 上显示了图片而已”，而是图片事实真实进入了最终回答链路。

### 4.4 route-preserving 行为真实成立

真机观察中，发送前后主模型按钮始终保持原文本模型，没有切换到 wrapper/provider UI。

结论：
> `dsh-vision-link` 在当前环境下，核心承诺“让多模态模型负责看，选中的文本模型始终负责想与答”真实成立。

---

## 5. 已建立的回归测试基线

已写入：
- `D:\develop\dsh\my-create-plugins\dsh-vision-link\docs\TROUBLESHOOTING.md`

当前高价值回归线包括：

1. **Writable Settings page**
   - 插件页是否仍可写；
   - 保存后是否仍会写回 `settings.yaml`。

2. **First-image mapping flow**
   - 首贴图时是否弹映射选择框；
   - `保存并加入图片` 是否还能回放为原生附件。

3. **Route-preserving answer flow**
   - 主模型 UI 是否保持不切换；
   - 回答是否包含图片中独有事实。

4. **Same-image repeated question baseline**
   - 同图不同问时，后续应继续验证不复用 stale evidence。

这意味着后续任何改动，都应至少通过：

- 自动化单测；
- 以上真机回归线。

---

## 6. A3 运行时 cache forensic 取证结果

本轮尝试过一轮更强取证：

- 在 `src/index.js` 增加最小 cache debug instrumentation；
- 通过 `DSH_VISION_LINK_DEBUG_CACHE=1` 期望记录：
  - `cache:miss`
  - `cache:hit`
  - `cache:pending-hit`
- 修改了 fast-start 启动脚本并重启 DSH；
- 再次做了同图重复发送的真实浏览器测试。

### 结果

- **调试版代码已写入 profile 安装副本；**
- **单测依旧 11 / 11 通过；**
- **真机主路径依旧正常；**
- 但在最新 session log 中，**没有看到预期的 `[vision-link][cache:*]` 输出。**

### 当前判断

这更像是：
> 当前 DSH 运行时实际加载的插件执行体 / 构建产物路径，与本次直接修改的源码路径不完全一致。

也就是说，A3 没闭环的原因更偏向：
- **平台装配 / 插件加载链路取证问题**
而不是：
- `vision-link` 业务修复失败。

---

## 7. 本轮最终结论

### 可以确认的

1. `dsh-vision-link` 的第一轮修复已经完成；
2. 最关键的缓存 correctness 问题已在代码与单测层面修掉；
3. 当前新版 DSH / 当前 Host 已开放页面写入配置；
4. 真机验证显示：
   - 插件页可写；
   - 映射保存能回写 `settings.yaml`；
   - 首贴图流程可用；
   - 附件回放可用；
   - 主模型不切换；
   - 图像事实真实进入回答语义链；
5. 这已经足以把本轮工作视为：
   - **修复完成**；
   - **主路径可用**；
   - **可进入后续试用 / 持续迭代阶段。**

### 尚未完全闭环的点

- A3 级别的 **runtime cache hit/miss forensic log** 还没有拿到；
- 若未来要继续深挖，应单独作为：
  - **DSH 插件装配 / 实际加载路径取证任务**
处理，而不应再与 `vision-link` 本轮修复收尾混在一起。

---

## 8. 建议的后续执行规则

每次后续修改 `dsh-vision-link` 后，至少执行：

### 自动化回归
```bash
cd /d/develop/dsh/my-create-plugins/dsh-vision-link
node --test test/vision-link.test.mjs
```

### 真机回归
按 `docs/TROUBLESHOOTING.md` 里的 regression baseline 逐项验证：

- 插件页可写；
- 保存回写 `settings.yaml`；
- 首贴图映射流程；
- 附件回放；
- route-preserving；
- 图像事实进入回答。

如果以上两层都通过，则未来改动即使较大，也有相当稳的基准线可依赖。
