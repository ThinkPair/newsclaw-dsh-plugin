# 变更记录

## 2.2.1 - 2026-08-31

- 修复 2.2.0 增加网页监控工具时覆盖研究工具的问题，恢复 `newsclaw_search_web` 与 `newsclaw_extract_evidence`，与 7 个监控工具同时注册，总计 31 个 Agent Bridge 工具。
- Extract 在进入后端前拒绝尾点 localhost、单标签内网名、IPv4 私网/保留段、IPv6 未指定/回环/映射私网/链路本地/ULA/组播、带凭据和不安全 URL；Tavily 仍只接受用户或 Agent 明确发起的按需研究，不成为后台新闻源。
- `newsclaw_edit_profile` 现在强制稳定 `requestId`；进程内相同 ID 与相同编辑合并，相同 ID 换内容拒绝。传输失败视为结果不确定，保留 ID→payload 绑定，只允许原 ID + 原 payload 重试，并在错误上明确 `retryable/outcomeUncertain`。
- CSS Modules 使用稳定的 `src/client/...` 相对文件名参与 hash 与 sourcemap，跨 worktree 构建不再改变类名或嵌入开发机绝对路径。

## 2.2.0 - 2026-08-30

- 内容库新增紧凑的“网页监控”页，复用 8430 后端同一目标、版本、事件和消息真值；支持添加、立即检查、暂停/继续、软移除和折叠版本摘要，不把正文重新铺满侧栏。
- 消息抽屉与 60 秒可见态轮询接入持久监控消息；delivered/read/dismiss 使用稳定请求标识，失败时保留消息。
- Agent Bridge 从 22 个扩展到 29 个工具，补齐监控列表、添加、检查、状态、历史、消息列表和消息动作；私有 lease/ETag 不进入工具输出。
- DSH 不抓目标网页、不持有 Cookie/认证；所有文档获取、SSRF 防护、正文去噪、差异和重试均由 NewsClaw 后端负责。

## 2.0.1 - 2026-08-17

- 发布仓库补齐私有配置、凭据、证书、打包与编辑器缓存的忽略规则，并保留上游许可和本地改编基线。
- 浏览器构建使用稳定的相对 CSS 模块标识，发布产物不写入开发机绝对路径，为后续跨工作树可复现构建建立基线。
- 移除 DSH 设置页对旧 `/api/config` 的读取和写入，消除 AI v2、新闻源、推荐和画像的假配置。
- 改为读取 `/api/news/runtime` 与 `/api/news/sources`，只展示后端真实运行状态和已生效参数。
- 完整业务配置统一跳转到新闻爪电脑版；DSH 仅保留真实的开机自启动操作。
- 浏览器侧从 Harness 插件行接收 `apiUrl` / `timeoutMs`，并同步兼容存储，使右侧栏和 Agent Bridge 默认共用同一后端。
