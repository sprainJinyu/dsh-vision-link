# DSH 适配记录

每次为了跟上 DeepSeek Harness 的升级而改插件时，在这里记一行。版本号是当时本机 `apps/cli/package.json` 里的 DSH 版本，不是一个兼容范围。

| 插件版本 | 适配的 DSH | 日期 | 这次改了什么 |
| --- | --- | --- | --- |
| 1.2.5 | 0.2.1-alpha.2 | 2026-10-13 | 设置面从 `ctx.settings.register` 换成插件 `Config` 的 volatile 字段，条目 id 仍是 `vision-link`。`connection.rpc.handle` 会在 connection 自己的上下文里访问未注入的 `webServer`，只读通道改走 `webServer.register`。未写映射时，默认借用同一 provider 分组里第一个声明 `image` 的模型。输入框是 contentEditable，粘贴由页面自己收下，不再提示缺少图片回放接口。 |
| 1.2.4 | settings.register 时期的宿主 | 2026-09-18 | 候选模型发现和 `/vision-link-rpc`。没有在 0.2.1-alpha.2 上复验。 |
