# 新闻爪 DSH 插件

新闻爪（NewsClaw）的 DeepSeek Harness 客户端插件。它把同一个本机新闻爪后端接入 DSH：右侧栏、推荐、内容库、画像、对话、消息，以及 24 个 `newsclaw_*` Agent Bridge 工具。

本目录是独立开发源码，不会在构建时读取、覆盖或启动当前已安装插件。

## 产品边界

- 日常推荐只消费新闻爪后端提供的新闻与画像，不读取新闻网站 Cookie。两项研究工具可按需把去标识化的公开查询或最多 3 个公开网页 URL 交给后端配置的 Tavily；它们不接收密钥、私人画像或本地笔记。
- 所有界面与工具共用 Harness 插件行的 `apiUrl`，默认 `http://127.0.0.1:8430`；浏览器侧启动时会把同一地址镜像给兼容视图，不再维护第二套地址。
- 新闻正文等级会原样展示；只有标题时必须标为“标题级信息”。
- 不给出买卖建议，不连接券商，不执行交易。
- 单一来源失败显示 `degraded`；后端不可达显示 `offline`，不会假装刷新成功。
- 插件面板、工具或 Skill 注册失败会被隔离，不阻断 Harness 主界面加载。

## 右侧栏布局

- 右侧栏是真实的尾部网格列，不是盖住会话的浮层。
- 默认宽度 380px，可拖动范围 280–560px。
- 会话区至少保留 400px；窗口不足时侧栏自动收窄。
- 导航顺序固定为：推荐 → 内容库 → 画像 → 对话。

## Agent Bridge 工具

插件注册以下 24 个工具，全部请求同一个 `/api/agent-bridge`：

1. `newsclaw_get_capabilities`
2. `newsclaw_recommend`
3. `newsclaw_reshuffle`
4. `newsclaw_append_recommendations`
5. `newsclaw_submit_feedback`
6. `newsclaw_get_spotlight`
7. `newsclaw_respond_spotlight`
8. `newsclaw_get_runtime_status`
9. `newsclaw_get_activity_feed`
10. `newsclaw_get_source_availability`
11. `newsclaw_chat`
12. `newsclaw_get_chat_history`
13. `newsclaw_next_probe`
14. `newsclaw_respond_interest_probe`
15. `newsclaw_next_avoidance_probe`
16. `newsclaw_respond_avoidance_probe`
17. `newsclaw_get_profile`
18. `newsclaw_get_profile_edit_state`
19. `newsclaw_edit_profile`
20. `newsclaw_save_local`
21. `newsclaw_remove_saved`
22. `newsclaw_list_saved`
23. `newsclaw_search_web`
24. `newsclaw_extract_evidence`

反馈、探针和惊喜响应使用稳定的 `requestId`；持久对话使用稳定的 `turnId`。同一次动作在超时后重试必须复用原 ID，另一动作不得复用。详细调用规范见 `skills/newsclaw-adapter/SKILL.md`。

联网研究遵守最小披露：`newsclaw_search_web` 默认返回 5 条、最多 8 条，只使用后端强制的 `basic` 搜索；`newsclaw_extract_evidence` 一次最多处理 3 个公开 URL、每个来源默认 2 段且最多 3 段。搜索不请求 Tavily 生成答案、网页全文或图片，提取也只返回与必填 `query` 相关的有限证据段。查询和 URL 会发送给后端配置的外部研究提供方，因此不得包含私人画像、本地笔记/记忆、家庭/健康/财务细节、凭据、秘密或未公开材料。

## 本地验证

要求 Node.js 22 或更新版本。

```powershell
npm install
npm run typecheck
npm test
npm run build
```

构建产物：

- `lib/index.js`：Harness 主进程插件入口
- `lib/client.js`：浏览器侧栏闭包包
- `lib/client.js.map`：浏览器调试映射
- `lib/types/`：类型声明

安装前可运行：

```powershell
npm pack --dry-run
Select-String -Path lib/client.js -Pattern '__ModuleLoader__.load','@newsclaw/dsh-plugin'
```

预期打包中包含 `LICENSE`、`NOTICE`、`licenses/OpenBiliClaw-MIT.txt` 与 `skills/newsclaw-adapter/SKILL.md`，且 `lib/client.js` 使用 Harness 的 `window.__ModuleLoader__` 闭包协议。

## 配置形态

Harness 插件行可提供：

```yaml
apiUrl: http://127.0.0.1:8430
timeoutMs: 300000
```

`skillPath` 仅用于开发时覆盖；默认读取插件随包附带的 Skill。页面和工具不会回显后端 Token。

### DSH 设置页现在负责什么

- “运行状态”读取 `/api/news/runtime`，展示后端确认已经生效的候选池、刷新、反馈、后台 AI 与重试参数。
- “新闻来源”读取 `/api/news/sources`，只展示媒体、技术提供方、健康状态、最后成功时间和错误，不在 DSH 里复制一套来源编辑器。
- “插件连接”只读展示插件行的 `apiUrl` 和 `timeoutMs`；其中 `timeoutMs` 是 24 个 Agent Bridge 工具的单次总预算。
- 开机自启动开关调用专用自启动接口，是设置页唯一会修改后端状态的项目。
- AI v2 实例与路由、DeepSeek/Tushare 凭据、新闻源开关、自定义 RSS、刷新和重试参数统一在新闻爪电脑版设置。
- DSH 设置页不会再 GET/PUT 旧 `/api/config`，因此不会出现“保存成功但新闻系统实际没采用”的假配置。

更完整的字段边界见 [docs/settings-contract.md](docs/settings-contract.md)。
界面控件与 24 个 Agent 工具的端到端闭环见 [docs/control-closure-matrix.md](docs/control-closure-matrix.md)。

## 许可

本衍生插件保留上游声明：

- DSH 插件代码：BSD-3-Clause，见 `LICENSE`
- OpenBiliClaw 衍生部分：MIT，见 `licenses/OpenBiliClaw-MIT.txt`
- 上游项目：[whiteguo233/dsh-openbiliclaw](https://github.com/whiteguo233/dsh-openbiliclaw) 与 [whiteguo233/OpenBiliClaw](https://github.com/whiteguo233/OpenBiliClaw)
- 归属与衍生说明：见 `NOTICE`
