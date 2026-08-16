# 新闻爪 DSH 插件

新闻爪（NewsClaw）的 DeepSeek Harness 客户端插件。它把同一个本机新闻爪后端接入 DSH：右侧栏、推荐、内容库、画像、对话、消息，以及 22 个 `newsclaw_*` Agent Bridge 工具。

本目录是独立开发源码，不会在构建时读取、覆盖或启动当前已安装插件。

## 产品边界

- 只消费新闻爪后端提供的新闻与画像，不抓网页、不读取新闻网站 Cookie。
- 所有界面与工具共用 `apiUrl`，默认 `http://127.0.0.1:8430`。
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

插件注册以下 22 个工具，全部请求同一个 `/api/agent-bridge`：

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

写操作使用稳定的 `requestId`；同一次动作重试时复用，另一动作不得复用。详细调用规范见 `skills/newsclaw-adapter/SKILL.md`。

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

## 许可

本衍生插件保留上游声明：

- DSH 插件代码：BSD-3-Clause，见 `LICENSE`
- OpenBiliClaw 衍生部分：MIT，见 `licenses/OpenBiliClaw-MIT.txt`
- 归属与衍生说明：见 `NOTICE`
