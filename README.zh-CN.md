# dsh-vision-link

[![CI](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml/badge.svg)](https://github.com/sprainJinyu/dsh-vision-link/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[English](./README.md) | 简体中文

让 DeepSeek Harness（DSH）中的纯文本模型读取图片，同时保持用户选择的文本模型与 provider 不变。

## 亮点

- **不切换主模型**：多模态模型只提取视觉证据，最终回答仍由原文本模型完成。
- **复用现有配置**：候选模型来自 DSH `settings.yaml` 中已经配置且声明支持 `image` 的模型，不再维护第二套 API Key。
- **贴图即用**：支持截图、界面报错、OCR、图表、代码和终端等解读重点。
- **同分组优先**：选择图片模型时，优先展示与当前文本模型相同 provider 的候选项。
- **零 DSH 源码修改**：普通 npm 安装只需增加一段 `settings.yaml` 映射。
- **安全的只读页面**：Web 端只能查看生效映射和生成 YAML；只读 RPC 限定 loopback，并且不会返回凭据。

## 先看这里：页面为什么不能直接保存？

普通安装下，`设置 → 插件 → 视觉映射` 是一个**只读配置助手**，不是保存表单。**这是正常现象，不是插件故障。** 这样可以不修改 DSH 源码，也不绕过 DSH 的 Settings 权限边界。

配置只需三步：

1. 在页面选择文本模型、图片模型和解读重点；
2. 点击“复制配置 YAML”；
3. 点击设置窗口右上角“打开配置文件”，把内容合并到 `settings.yaml`。

如果 `settings.yaml` 已经存在 `vision-link:`，只把新的模型条目加入现有 `mappings:`，不要再创建第二个 `vision-link:`。保存后通常会自动生效；没有自动生效时重启 DSH。

## 快速开始

### 1. 安装

在 DSH 的运行目录执行：

```bash
npx -y @deepseek-ai/dsh plugin --profile web add dsh-vision-link
```

然后启动或重启：

```bash
npx -y @deepseek-ai/dsh web
```

### 2. 确认图片模型声明了 image

图片模型必须在 DSH Settings 中明确声明图片输入能力：

```yaml
llm-pi-ai:
  providers:
    example-provider:
      # 保留你已有的 api、baseURL 和凭据配置
      models:
        - id: text-chat
          name: Text Chat

        - id: vision-chat
          name: Vision Chat
          input: [text, image]
```

如果模型条目没有自己的 `input`，也可以继承 provider 的 `defaultInput`。

### 3. 建立映射

推荐使用 `设置 → 插件 → 视觉映射` 生成 YAML；也可以手动添加：

```yaml
vision-link:
  mappings:
    example-provider/text-chat:
      provider: example-provider
      model: vision-chat
      displayName: Example Provider · Vision Chat
      focusPreset: auto
```

映射键必须是完整的 `文本 provider/文本 model`；目标必须使用 DSH 中实际存在的图片 provider 和 model id。完整示例见 [`examples/settings.yaml`](./examples/settings.yaml)。

### 4. 使用

保持原文本模型选中，在对话框中粘贴图片并继续提问即可。页面会提示实际负责读图的模型，但模型选择器不会切换。

## 解读重点

`focusPreset` 支持：

- `auto`：结合用户问题提取相关视觉事实；
- `ocr`：优先准确转录文字；
- `ui`：界面状态、按钮、操作路径和报错；
- `chart`：表格、坐标轴、图例、数值和趋势；
- `code`：代码、终端、文件名、行号和堆栈；
- `custom`：使用自定义重点，同时填写 `customFocus`。

## 工作原理

```text
图片 + 用户问题
  → 映射的多模态模型提取视觉证据
  → 图片替换为结构化的 [视觉证据] 文本
  → 原 provider / 原文本模型完成最终回答
```

原生多模态模型保持 DSH 默认行为。插件不注册包装 provider、不调用模型选择接口，也不把图片写入额外临时文件。

## 配置优先级

1. `settings.yaml` 中精确的 `vision-link.mappings[provider/model]`；
2. 插件配置中的 `visionTargetByModel`；
3. 插件配置中的 `visionTargetByRoute[provider]`。

普通用户只需要第一种。后两种用于管理员维护固定 profile，发布包不会内置任何 provider 映射。

## 安全与隐私

- 图片只会发送到映射的多模态模型和当前 DSH 会话链路；
- 图片内容按不可信输入处理，视觉提示会要求模型不要执行图片中的指令；
- 页面只读接口只返回模型映射、显示名和解读重点，不返回 API Key、地址或其他 Settings；
- 只读接口使用 DSH Connection RPC 的 Host/Origin 检查，并限定 loopback。

## 常见问题

### 页面没有图片模型候选项

检查目标模型是否声明了 `input: [text, image]`，并确认 provider/model id 与 DSH 模型目录一致。

### 页面能看到映射但不能编辑

这是普通安装的预期行为。使用页面生成 YAML，然后通过右上角“打开配置文件”合并到 `settings.yaml`。

### 保存后没有生效

先检查 YAML 缩进和是否重复声明了顶层 `vision-link:`，再重启 DSH。更多排障见 [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md)。

## 开发

```bash
npm ci
npm run validate
```

架构说明见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)，贡献方式见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 卸载

```bash
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-vision-link
```

插件不会自动删除 `settings.yaml` 中的 `vision-link` 配置；不再需要时可手动移除。

## License

[MIT](./LICENSE)
