# DSH 控件与 Agent 工具闭环矩阵

> 审计基线：`31cc0c257453eb59d4d9ab9a705e6cadd517a5be`  
> 目标：每个可见操作和 24 个 Agent Bridge 工具都能回答“在哪里处理、调哪个接口、什么被保存、怎么判断成功、失败怎么告知、超时后怎么重试”。

## 公共合同

| 项目 | 闭环 |
|---|---|
| 后端地址 | Node 工具、浏览器面板和 WebSocket 共用 Harness 同一行 `apiUrl`。只允许 `http(s)://127.0.0.1`/`localhost`/`[::1]`；带凭据、query、hash 或非本机主机的值会 fail-closed 回到 `http://127.0.0.1:8430`。 |
| REST 失败 | 非 2xx 保留路径、HTTP 状态和后端细节；断网/超时显示在当前卡片或页面。已成功读取的分区不被另一分区的失败清空。 |
| REST 超时 | 健康 5s；状态/收藏 8–10s；历史/消息 15s；推荐/写操作 10–20s；旧同步 AI 对话 300s。超时文案包含接口与毫秒数。 |
| 写入重试 | 不在客户端盲目自动重放。反馈/探针/惊喜/消息确认复用稳定 `request_id`；持久对话复用稳定 `turn_id`；同一请求与不同对象冲突由后端返回 409。 |
| 阅读信号 | 打开原文立即新开窗口，然后持久化一次弱 `open`信号。模糊超时后再点复用原 `request_id`；失败明确显示“原文已打开，但阅读记录未确认保存”。 |
| WebSocket | `/api/runtime-stream`；实时推送探针/惊喜，500ms 去重，2s→4s→…→30s 指数退避；稳定连接 8s 后将下次退避恢复到 2s。 |
| 敏感信息 | `credentials: omit`；插件界面不读取/回显 Token；Bridge 结果对 token/key/secret/cookie/authorization 及字符串内密钥模式脱敏。 |

## 可见控件闭环

### 外壳与布局

| 控件 | Handler / API | 状态与持久化 | 成功反馈 | 失败/降级与重试 |
|---|---|---|---|---|
| 侧边栏 NewsClaw 入口 | `sidebarButton` → `PanelLayoutController.toggle` | `newsclaw:panel-open` localStorage | 真实尾部 grid 列显示/收起 | DOM 挂载失败被插件边界捕获，不拖死 Harness；重新加载插件重试 |
| 拖动左边界 | pointer drag → `clampWidth` | `newsclaw:panel-width`；280–560px；会话至少 400px | 列宽随拖动，结束后持久化 | 空间不足时列自动收缩为 0；双击恢复 380px |
| 电脑版按钮 | `window.open(<apiUrl>/web)` | 无业务写入 | 打开同一本机后端的 Web 版 | 浏览器拦截时保留当前 DSH，用户可再点 |
| 消息/设置/收起 | Panel state handlers | React 本地状态；收起另持久 | drawer/overlay/列状态立即更新 | 纯本地操作，不依赖后端 |
| 推荐/内容库/画像/对话 tab | `selectTab` | React 状态 | 活动页即时切换 | 切换不发写请求；各页读取失败在页内重试 |

### 推荐与惊喜

| 控件 | Handler / API | 状态与持久化 | 成功反馈 | 失败/降级与重试 |
|---|---|---|---|---|
| 刷新 | `reload` → `GET /api/recommendations` + runtime + bootstrap status | 服务器推荐池；页面卡片 | 卡片替换，状态同步 | `allSettled`；推荐成功而辅助状态失败时明确标注“部分状态读取失败” |
| 换一批 | `run('reshuffle')` → `POST /api/recommendations/reshuffle` | 服务器推荐池/展示记录 | 当前页被新一批替换 | 20s；主请求失败保留原卡；状态失败显示降级文案，手动再点 |
| 追加一批/滚动预取 | `appendManual`/`appendMore` → `POST /api/recommendations/append` | 新卡去重后追加，不覆盖已读卡 | 卡片列表变长；空页显示到底 | 20s；自动预取失败后锁住自动重放，必须由用户刷新/追加/换一批解锁 |
| 封面/打开原文 | `openItem` → `POST /api/recommendation-click` + `window.open` | 弱 open 学习事件，稳定 request ID | 原文立即打开 | 10s；原文不被日志失败阻塞，但页内告知“阅读记录未确认保存”；再点复用原 ID |
| 喜欢/不感兴趣/忽略 | `submitFeedback` → `POST /api/feedback` | 反馈表、画像学习；忽略成功后才出池 | 卡内成功文案；忽略后卡片移除 | 10s；原卡/原状态保留，稳定 request ID 可再点重试 |
| 稍后读/收藏 | saved status + `POST /api/saved/{kind}` or `/remove` | 本地收藏数据库，不参与画像学习 | 图标与文案仅在后端确认后切换 | 状态读取失败时为“未知”并禁用，不假装未收藏；写失败保留原状态 |
| 说说原因/发送 | composer + `POST /api/feedback` (`comment`) | 评论反馈与画像证据 | 成功后清空草稿 | 失败保留草稿和原 request ID；再点为幂等重试 |
| 惊喜展开/收起、上一条/下一条 | React state | 无服务器写入 | 展开内容/切换队列索引 | 纯本地操作 |
| 惊喜打开 | `respond(view)` + `openItem` | `view` 只标记卡已见；`openItem` 只学习一次打开 | 原文打开，不双计点击 | 两个写入独立报错；各自复用稳定 ID |
| 惊喜喜欢/不感兴趣/忽略 | `POST /api/spotlight/respond` | 惊喜响应与画像；忽略后移出 | 成功文案/卡移除 | 20s；失败保留卡和稳定 request ID |
| 惊喜聊一聊/发送 | `respondToSpotlight(chat)` | 对话入口与画像证据 | 成功后清空草稿 | 失败保留草稿与 request ID |
| 后台动态展开/加载更多 | `GET /api/activity-feed` | 只读活动历史 | 追加更旧页 | 10s；页脚显示失败，不清空已加载数据 |
| 首次设置/重试提示 | `GET /api/news/bootstrap/status`；按钮转到 `/web` | 只读 NewsClaw 首次设置状态 | 已就绪时提示自动消失 | 不暴露“重新初始化”，不重建已有画像；仅引导到电脑版完成/检查并重试 |

### 内容库、画像、对话和消息

| 控件 | Handler / API | 状态与持久化 | 成功反馈 | 失败/降级与重试 |
|---|---|---|---|---|
| 稍后读/收藏 tab，移除，切到另一列表 | saved GET/POST/remove/status | 本地数据库 | 成功后列表/按钮状态刷新 | 8–10s；失败保留原卡和草稿，未知状态不开放切换 |
| 内容库喜欢/不感兴趣/聊一聊 | `POST /api/events` 带 `event_id` | 行为事件和画像证据 | accepted 后显示已用于更新画像 | rejected/timeout 显示原因，草稿与 event ID 保留 |
| 阅读记录分类/加载更多/打开 | `GET /api/content-history` + `openItem` | 30 天历史、分页 cursor；新打开写弱信号 | 追加页/打开原文 | 15s；保留已加载页，页内报错，手动再点 |
| 画像重试/加载更早认知 | `GET /api/profile-summary` 带 cursor | 只读五层画像与证据追溯 | 画像或更早认知追加显示 | 10s；失败不伪装成“还未生成”，显示错误与重试 |
| 画像兴趣/避雷探针“确实/放一放/不对” | interest/avoidance respond | 探针状态、冷却期和画像 | 后端确认后移除已处理卡 | 20s；稳定 request ID，失败保留卡 |
| 对话刷新 | chat turns + pending confirmations，`allSettled` | 只读持久对话/待聊列表 | 成功分区独立刷新 | 10s；一区失败不清空另一区，显示部分/全部失败 |
| 待聊确认展开/打开 | local toggle + `POST /api/chat/pending-confirmations/{ref}/open` | 持久 turn/对话上下文 | 卡转为可回复对话 | 20s；失败卡不消失，页面显示错误 |
| 假设卡确认/否定/修订/放一放 | `POST /api/chat/cards/{turn_id}/action` | 持久卡状态与画像 overlay | 后端 verdict 替换卡状态 | 20s；失败保留原卡可重试 |
| 清除对话上下文 | localStorage context | 本地对话绑定 | 引用条立即消失 | 纯本地操作 |
| 发送对话 | `POST /api/chat/turns` + `GET /api/chat/turns/{turn_id}` polling | 持久 turn；稳定 `turn_id` | optimistic turn → pending → settled，再刷新历史 | start 20s/poll 15s；失败恢复草稿，同文本+上下文重试复用 turn ID；409 给出清除上下文指引 |
| 铃铛/消息关闭 | drawer hydrate / local toggle | 各分区仅成功后替换；已处理 key 本地去重 | badge 和列表同步 | 四路 `allSettled`；部分失败只展示成功来源，全失败显示后端不可达 |
| 消息中探针/惊喜按钮 | probe/spotlight respond | 后端状态与画像 | 确认成功后才从 drawer 移除 | 20s；失败保留卡和 request ID |
| “值得一看”打开 | `openItem` + `POST /api/notifications/ack` | 阅读信号；消息 ack 幂等终态 | ack 成功后才移除消息 | ack 失败显示“已打开但确认未保存”，卡保留且复用 request ID；同 ID 不同文章由 409 拒绝 |

### 设置

| 控件 | Handler / API | 状态与持久化 | 成功反馈 | 失败/降级与重试 |
|---|---|---|---|---|
| 运行状态/新闻来源/插件连接 tab | local tab + `GET /api/news/runtime`, `/api/news/sources`, `/api/autostart-status` | 只读后端实际值 | 分区卡片显示 | `allSettled`；异常 JSON 不转成“空/关闭”，明确部分/全部失败 |
| 刷新实际状态 | 同上 | 只读 | 成功分区替换 | 10s；失败分区保留上一份成功值 |
| 开机自启动 | `POST /api/autostart/apply` → 必须 `GET /api/autostart-status` 复核 | OS 自启动项 | 只有 apply=true 且复核值一致才显示成功 | 15s+10s；失败再读真实值；无法复核时标记未知并禁用，不误显示关闭 |
| 打开新闻爪电脑版 | `window.open(<apiUrl>/web)` | 无额外配置副本 | 进入主配置中心 | DSH 仍保留只读已生效值；不写旧 `/api/config` |

## 24 个 Agent Bridge 工具

所有工具都由 `registerBridgeTools` 注册，再由 `Bridge.run(command, argv)` 调用 `POST <apiUrl>/api/agent-bridge`。工具超时是 Harness 插件行的 `timeoutMs`（1秒–15 分钟夹取，默认 5 分钟）。客户端不自动重放；读操作可重试，写操作必须复用原稳定 ID。

| # | 工具 | Bridge command / 业务终态 | 成功 | 失败、超时与重试 |
|---:|---|---|---|---|
| 1 | `newsclaw_get_capabilities` | `capabilities`；协议/适配器/skill 列表，只读 | 返回权威能力 JSON | 显示脱敏错误；可直接重试 |
| 2 | `newsclaw_recommend` | `recommend`；读取共享推荐池 | 新闻卡 JSON，保留 body level/理由/影响链/观察点 | 可重试；不声称刷新成功 |
| 3 | `newsclaw_reshuffle` | `reshuffle`；新抽一页 | 返回替换页 | 可重试；排除 article ID 可再传 |
| 4 | `newsclaw_append_recommendations` | `append`；追加页 | 返回追加页 | 可重试；用原排除集去重 |
| 5 | `newsclaw_submit_feedback` | `submit-feedback`；`open/like/dislike/comment/dismiss` 持久学习 | 返回幂等写入结果 | 必填 `requestId`≤400；comment 必填 note；同动作重试复用 ID |
| 6 | `newsclaw_get_spotlight` | `get-spotlight`；只读待处理惊喜 | 返回卡或 null | 可直接重试 |
| 7 | `newsclaw_respond_spotlight` | `respond-spotlight`；`view/open/like/dislike/dismiss/chat` | 状态/画像/对话持久；`view` 不学习，`open` 是弱学习 | 必填 requestId；chat 必填 message；不支持值本地拒绝 |
| 8 | `newsclaw_get_runtime_status` | `runtime-status`；只读就绪/池/未读/刷新 | 返回实际状态 | 可直接重试 |
| 9 | `newsclaw_get_activity_feed` | `activity-feed`；只读最近学习/任务活动 | 返回 1–100 条 | 可直接重试 |
| 10 | `newsclaw_get_source_availability` | `source-availability`；只读媒体/提供方/健康 | 返回 online/degraded/offline 及错误 | 可重试；单源失败不报全量成功 |
| 11 | `newsclaw_chat` | `chat --message --turn-id [--session]`；持久对话 | 返回该 turn 的权威结果 | 必填 `turnId`≤400；超时重试必须复用同 ID，防止重复对话 |
| 12 | `newsclaw_get_chat_history` | `chat-history`；只读 session 历史 | 返回 1–200 turns | 可直接重试 |
| 13 | `newsclaw_next_probe` | `next-probe`；只读下一兴趣假设 | 问题或 null | 可直接重试 |
| 14 | `newsclaw_respond_interest_probe` | `respond-interest-probe`；confirm/reject/defer/chat | 探针终态/冷却/画像持久 | 必填 requestId；同回答重试复用 ID |
| 15 | `newsclaw_next_avoidance_probe` | `next-avoidance-probe`；只读下一避雷假设 | 问题或 null | 可直接重试 |
| 16 | `newsclaw_respond_avoidance_probe` | `respond-avoidance-probe`；confirm/reject/defer/chat | 避雷终态/冷却/画像持久 | 必填 requestId；同回答重试复用 ID |
| 17 | `newsclaw_get_profile` | `get-profile`；只读当前五层画像 | 返回兴趣/避雷/特质 | 可直接重试 |
| 18 | `newsclaw_get_profile_edit_state` | `profile-edit-state`；只读 AI 推断与人工 overlay | 返回完整编辑态 | 可直接重试 |
| 19 | `newsclaw_edit_profile` | `edit-profile`；set/add/remove/reset 人工 overlay | 人工修改持久并覆盖 AI 推断 | 操作枚举本地校验；失败不声称已修改；查询 edit state 后再决定是否重试 |
| 20 | `newsclaw_save_local` | `save-local`；favorite/watch_later 本地成员关系 | 本地数据库写入，不同步媒体账号 | 列表枚举本地校验；超时后先 list_saved 确认再决定重试 |
| 21 | `newsclaw_remove_saved` | `remove-saved`；移除本地成员关系 | 本地数据库更新 | 列表枚举本地校验；超时后先 list_saved 确认 |
| 22 | `newsclaw_list_saved` | `list-saved`；只读 favorite/watch_later | 返回 1–200 条 | 可直接重试 |
| 23 | `newsclaw_search_web` | `research-search --query ... --topic ... --max-results ...`；后端固定 `basic`，不请求 answer/raw content/images | 返回默认 5、最多 8 条带 URL 的有限公开网页结果；可复用后端缓存 | query 必填；topic/time range 本地枚举；不得发送私人画像、本地笔记或秘密；失败不伪装为无结果，默认可重试且不加 `refresh` |
| 24 | `newsclaw_extract_evidence` | `research-extract --query ... --url ...`；后端固定 `basic`，只提取相关证据段 | 从 1–3 个公开 URL 各返回默认 2、最多 3 个相关片段 | query 必填；URL 数量及公开 HTTP(S) 边界本地校验；不得发送私网 URL 或私人本地上下文；超时可先用原参数重试且不加 `refresh` |

## 加载、卸载与隔离

- Node 端先解析经过本机白名单约束的连接，再注册 Skill 和 24 个工具。工具注册是原子的：任何一个注册失败会倒序注销前面所有工具。
- 浏览器端面板、入口按钮和布局任一步失败，会回收已建立的一切；异常仅记录在控制台，Harness 主界面继续使用。
- 卸载会关闭 WebSocket，移除 DOM 列/拖动柄/入口，取消订阅并注销 Skill/工具。
- CSS 热加载采用同 ID upsert，替换内容而不叠加旧样式。

## 明确剩余边界

- DSH 是共享后端的消费端；AI 路由、密钥、新闻源开关/RSS、刷新和重试参数统一到电脑版编辑，DSH 只读真实已生效值。
- DSH 不执行首次设置或画像重建；它只显示首次设置/失败重试状态，已有画像去电脑版手工校正。
- 日常推荐链不抓网页、不读 Cookie、不连券商、不下单；两项按需研究工具只把去标识化的公开查询/URL 交给后端研究提供方，并且返回有限结果或相关证据段。
- 私人画像、本地笔记/记忆、家庭/健康/财务细节、凭据、秘密、私网 URL 和未公开材料不得进入联网研究参数；Tavily 密钥只由后端配置，DSH 工具不提供密钥参数。
- 源包保留必要的 MIT/BSD 法律归属文件；产品 UI、Agent 工具名、日常逻辑和业务文案不使用视频平台语义。
