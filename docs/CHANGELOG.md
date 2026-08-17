# 变更记录

## 2.0.1 - 2026-08-17

- 移除 DSH 设置页对旧 `/api/config` 的读取和写入，消除 AI v2、新闻源、推荐和画像的假配置。
- 改为读取 `/api/news/runtime` 与 `/api/news/sources`，只展示后端真实运行状态和已生效参数。
- 完整业务配置统一跳转到新闻爪电脑版；DSH 仅保留真实的开机自启动操作。
- 浏览器侧从 Harness 插件行接收 `apiUrl` / `timeoutMs`，并同步兼容存储，使右侧栏和 Agent Bridge 默认共用同一后端。
