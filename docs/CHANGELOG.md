# 变更记录

## 2.1.0 - 2026-08-22

- 新增 `newsclaw_search_web` 与 `newsclaw_extract_evidence`，分别映射后端 `research-search` / `research-extract`。
- 搜索默认 5 条、最多 8 条；提取一次最多 3 个公开 URL、每源默认 2 段且最多 3 段。后端强制 `basic`，搜索不请求 Tavily 生成答案、网页全文或图片。
- 工具描述、Skill 和闭环文档明确联网隐私边界：不得发送私人画像、本地笔记/记忆、私网 URL、凭据、秘密或未公开材料。
- Agent Bridge 工具清单从 22 项更新为 24 项。

## 2.0.1 - 2026-08-17

- 构建时使用稳定的项目相对 CSS 虚拟模块 ID，生成的 `lib/client.js` 与 source map 不再写入开发电脑的绝对路径。
- 补齐私有源码备份的凭据、打包产物和本地缓存忽略规则，并明确记录上游地址与本地改编基线。
- 移除 DSH 设置页对旧 `/api/config` 的读取和写入，消除 AI v2、新闻源、推荐和画像的假配置。
- 改为读取 `/api/news/runtime` 与 `/api/news/sources`，只展示后端真实运行状态和已生效参数。
- 完整业务配置统一跳转到新闻爪电脑版；DSH 仅保留真实的开机自启动操作。
- 浏览器侧从 Harness 插件行接收 `apiUrl` / `timeoutMs`，并同步兼容存储，使右侧栏和 Agent Bridge 默认共用同一后端。
