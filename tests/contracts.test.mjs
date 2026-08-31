import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('registers the exact 31 NewsClaw bridge tool names', () => {
  const source = read('src/tools.ts')
  const names = [...source.matchAll(/name:\s*'(newsclaw_[^']+)'/g)].map(match => match[1])
  const expected = [
    'newsclaw_get_capabilities',
    'newsclaw_recommend',
    'newsclaw_reshuffle',
    'newsclaw_append_recommendations',
    'newsclaw_submit_feedback',
    'newsclaw_get_spotlight',
    'newsclaw_respond_spotlight',
    'newsclaw_get_runtime_status',
    'newsclaw_get_activity_feed',
    'newsclaw_get_source_availability',
    'newsclaw_chat',
    'newsclaw_get_chat_history',
    'newsclaw_next_probe',
    'newsclaw_respond_interest_probe',
    'newsclaw_next_avoidance_probe',
    'newsclaw_respond_avoidance_probe',
    'newsclaw_get_profile',
    'newsclaw_get_profile_edit_state',
    'newsclaw_edit_profile',
    'newsclaw_save_local',
    'newsclaw_remove_saved',
    'newsclaw_list_saved',
    'newsclaw_search_web',
    'newsclaw_extract_evidence',
    'newsclaw_list_web_monitors',
    'newsclaw_add_web_monitor',
    'newsclaw_check_web_monitor',
    'newsclaw_set_web_monitor_state',
    'newsclaw_get_web_monitor_history',
    'newsclaw_list_monitor_notifications',
    'newsclaw_act_on_monitor_notification',
  ]
  assert.deepEqual(names, expected)
  assert.equal(new Set(names).size, 31)
  assert.doesNotMatch(source, /openbiliclaw_|\bbvid\b|bilibili|danmaku/i)
})

test('all bridge tools use one configured backend endpoint', () => {
  const bridge = read('src/bridge.ts')
  const entry = read('src/index.ts')
  assert.match(bridge, /const endpoint = `\$\{config\.apiUrl\.replace\([^\n]+\}\/api\/agent-bridge`/)
  assert.match(entry, /http:\/\/127\.0\.0\.1:8430/)
  assert.doesNotMatch(entry + bridge, /127\.0\.0\.1:8420/)
})

test('client and tools resolve the same Harness row connection', () => {
  const clientEntry = read('src/client/index.ts')
  const mount = read('src/client/mount.tsx')
  const panel = read('src/client/NewsClawPanel.tsx')
  const sharedConfig = read('src/config.ts')
  assert.match(clientEntry, /apply\(ctx: ClientContext, config\?: NewsClawClientConfig\)/)
  assert.match(clientEntry, /apiUrl: normalizeApiUrl\(config\?\.apiUrl\)/)
  assert.match(clientEntry, /timeoutMs: normalizeTimeoutMs\(config\?\.timeoutMs\)/)
  assert.match(sharedConfig, /127\.0\.0\.1.+localhost.+\[::1\]/s)
  assert.match(sharedConfig, /url\.username.+url\.password.+url\.search.+url\.hash/s)
  assert.match(clientEntry, /writeApiBase\(connection\.apiUrl\)/)
  assert.match(mount, /apiUrl=\{connection\.apiUrl\}/)
  assert.match(mount, /timeoutMs=\{connection\.timeoutMs\}/)
  assert.match(panel, /const base = apiUrl/)
  assert.doesNotMatch(panel, /setBase|readApiBase/)
})

test('DSH settings read dedicated news truth and never write legacy config', () => {
  const api = read('src/client/api.ts')
  const settings = read('src/client/settings.tsx')
  assert.match(api, /requestJson\(base, '\/api\/news\/runtime'/)
  assert.match(api, /requestJson\(base, '\/api\/news\/sources'/)
  assert.doesNotMatch(api + settings, /\/api\/config|fetchConfig|updateConfig/)
  assert.match(settings, /运行状态/)
  assert.match(settings, /新闻来源/)
  assert.match(settings, /插件连接/)
  assert.match(settings, /完整配置在电脑版/)
  assert.match(settings, /apiUrl \/ timeoutMs/)
  assert.doesNotMatch(settings, /保存配置|AI 模型|推荐池规则|探测确认阈值/)
})

test('panel is a clamped trailing grid column', () => {
  const store = read('src/client/store.ts')
  const layout = read('src/client/layout.ts')
  assert.match(store, /PANEL_DEFAULT_WIDTH_PX\s*=\s*380/)
  assert.match(store, /PANEL_MIN_WIDTH_PX\s*=\s*280/)
  assert.match(store, /PANEL_MAX_WIDTH_PX\s*=\s*560/)
  assert.match(store, /MIN_CHAT_PX\s*=\s*400/)
  assert.match(layout, /column\.dataset\.newsclawPanelCol\s*=\s*''/)
  assert.match(layout, /gridColumnStart\s*=\s*String\(this\.shellTracks\.length\s*\+\s*1\)/)
  assert.match(layout, /column\.style\.width\s*=/)
  assert.doesNotMatch(layout, /frame\.style\.gridTemplateColumns\s*=/)
  assert.match(layout, /this\.waitObserver\?\.disconnect\(\)/)
  assert.match(layout, /available\s*-\s*MIN_CHAT_PX/)
  assert.match(layout, /maxByContainer\s*<\s*PANEL_MIN_WIDTH_PX\) return 0/)
})

test('navigation and health states match the NewsClaw contract', () => {
  const panel = read('src/client/NewsClawPanel.tsx')
  const api = read('src/client/api.ts')
  const labels = [...panel.matchAll(/key:\s*'(?:recommend|library|profile|chat)',\s*label:\s*'([^']+)'/g)].map(match => match[1])
  assert.deepEqual(labels, ['推荐', '内容库', '画像', '对话'])
  assert.match(api, /HealthState\s*=\s*'online'\s*\|\s*'degraded'\s*\|\s*'offline'/)
  assert.match(panel, /data-state=\{connection\}/)
})

test('plugin loading failures are isolated', () => {
  const nodeEntry = read('src/index.ts')
  const clientEntry = read('src/client/index.ts')
  assert.match(nodeEntry, /without affecting Harness/)
  assert.match(clientEntry, /Harness remains usable/)
  assert.match(nodeEntry, /try\s*\{/)
  assert.match(clientEntry, /try\s*\{/)
  assert.match(clientEntry, /layout\.dispose\(\)/)
  assert.match(read('src/tools.ts'), /for \(const dispose of \[\.\.\.registered\]\.reverse\(\)\)/)
})

test('learning writes are idempotent and credentials are redacted', () => {
  const tools = read('src/tools.ts')
  const bridge = read('src/bridge.ts')
  const api = read('src/client/api.ts')
  assert.match(tools, /--request-id[\s\S]+bridge\.run\('respond-interest-probe'/)
  assert.match(tools, /--request-id[\s\S]+bridge\.run\('respond-avoidance-probe'/)
  assert.match(tools, /requestId.+profile edit/i)
  assert.match(tools, /requestId was already used for a different profile edit/)
  assert.match(tools, /outcome is uncertain/)
  assert.match(tools, /retry the exact same payload/)
  assert.match(api, /interest-probes\/respond[\s\S]+request_id/)
  assert.match(api, /avoidance-probes\/respond[\s\S]+request_id/)
  assert.match(tools, /newsclaw_chat[\s\S]+turnId[\s\S]+--turn-id/)
  assert.match(bridge, /sanitizeBridgeValue/)
  assert.match(bridge, /SECRET_KEY/)
  assert.match(bridge, /\[REDACTED\]/)
})

test('client CSS is upserted on a hot reload', () => {
  const build = read('tsdown.config.ts')
  assert.match(build, /const existing = document\.querySelector/)
  assert.match(build, /if \(tag\.textContent !== css\) tag\.textContent = css/)
  assert.match(build, /if \(existing === null\) document\.head\.appendChild\(tag\)/)
  assert.match(build, /stableCssFilename/)
  assert.match(build, /filename: stableFilename/)
  assert.doesNotMatch(build, /filename:\s*file[,}]/)
})

test('built client artifacts never embed the checkout path', () => {
  const normalizedRoot = root.replaceAll('\\', '/')
  for (const path of ['lib/client.js', 'lib/client.js.map']) {
    const artifact = read(path).replaceAll('\\', '/')
    assert.equal(artifact.includes(normalizedRoot), false, `${path} leaked the checkout path`)
    assert.doesNotMatch(artifact, /\/worktrees\/dsh-[^/]+/i)
  }
})

test('packaged adapter skill advertises all 31 tools and the profile retry boundary', () => {
  const skill = read('skills/newsclaw-adapter/SKILL.md')
  assert.match(skill, /Use the 31 local NewsClaw Agent Bridge tools/)
  assert.match(skill, /## The 31 tools/)
  assert.match(skill, /newsclaw_search_web/)
  assert.match(skill, /newsclaw_extract_evidence/)
  assert.match(skill, /newsclaw_edit_profile[\s\S]+outcome is uncertain/)
  assert.match(skill, /same `requestId`[\s\S]+exact same payload/)
})

test('upstream license notices ship with the source package', () => {
  for (const path of ['LICENSE', 'NOTICE', 'licenses/OpenBiliClaw-MIT.txt']) {
    assert.equal(existsSync(join(root, path)), true, `${path} missing`)
  }
  assert.match(read('LICENSE'), /BSD 3-Clause License/)
  assert.match(read('licenses/OpenBiliClaw-MIT.txt'), /MIT License/)
})

test('first setup is NewsClaw-only and never exposes profile rebuild', () => {
  const api = read('src/client/api.ts')
  const views = read('src/client/views.tsx')
  assert.match(api, /'\/api\/news\/bootstrap\/status'/)
  assert.doesNotMatch(api + views, /\/api\/init-status|['"]\/api\/init['"]|重新初始化|开始初始化/)
  assert.match(views, /去电脑版完成首次设置/)
  assert.match(views, /已有画像不会被这里重建/)
})

test('manual append preserves current cards and runtime failures stay visible', () => {
  const views = read('src/client/views.tsx')
  assert.match(views, /const appendManual = useCallback/)
  assert.match(views, /setItems\(prev => \[\.\.\.\(prev \?\? \[\]\), \.\.\.fresh\]\)/)
  assert.doesNotMatch(views, /run\('append'/)
  assert.match(views, /Promise\.allSettled\(\[/)
  assert.match(views, /推荐已刷新，但部分运行状态读取失败/)
  assert.match(views, /内容已更新，但运行状态暂时读取失败/)
})

test('notification open is durably acknowledged with article identity', () => {
  const api = read('src/client/api.ts')
  const notifications = read('src/client/notifications.tsx')
  assert.match(api, /'\/api\/notifications\/ack'/)
  assert.match(api, /article_id: articleId, request_id: requestId/)
  assert.match(notifications, /acknowledgeNotification\(base, notice\.article_id, requestId\)/)
  assert.match(notifications, /then\(\(\) => \{\s*onHandled\(notice\.article_id\)/)
})

test('P5 webpage/PDF monitoring shares one durable truth across panel, inbox and Agent tools', () => {
  const api = read('src/client/api.ts')
  const library = read('src/client/library.tsx')
  const notifications = read('src/client/notifications.tsx')
  const panel = read('src/client/NewsClawPanel.tsx')
  const tools = read('src/tools.ts')
  assert.match(library, /key: 'monitoring', label: '网页监控'/)
  assert.match(api, /'\/api\/news\/monitors'/)
  assert.match(api, /'\/api\/news\/monitor-notifications\?limit=100'/)
  assert.match(library, /正文真变了才进入事件档案/)
  assert.doesNotMatch(library, /预测|概率|情绪评分/)
  assert.match(api, /initialCheckStatus:\s*str\(check\.status\)/)
  assert.match(library, /created\.initialCheckStatus === 'baseline' \|\| created\.item\.has_baseline/)
  assert.match(library, /首次读取没有建立基线/)
  assert.match(library, /delete next\[item\.monitor_id\]/)
  assert.match(library, /historyWasOpen[\s\S]+fetchWebMonitorHistory\(base, item\.monitor_id\)/)
  assert.match(api, /Promise<WebMonitorCheckResult>/)
  assert.match(library, /checkStatus === 'failed'/)
  assert.match(library, /checkStatus === 'retry_wait'/)
  assert.match(library, /busyIdsRef\.current\.has\(item\.monitor_id\)/)
  assert.match(library, /item\.current_version > cached\.monitor\.current_version/)
  assert.match(library, /historyErrors/)
  assert.match(library, /记录尚未载入/)
  assert.match(library, /Math\.max\(history\.monitor\.current_version, history\.versions\.length\)/)
  assert.match(notifications, /actOnWebMonitorNotification/)
  assert.match(notifications, /notice\.kind === 'recovered'/)
  assert.match(notifications, /window\.open\('about:blank', '_blank'\)/)
  assert.match(notifications, /pendingWindow\.location\.replace\(monitorUrl\)/)
  assert.match(panel, /dsh:monitor:delivered:/)
  assert.match(panel, /handledMonitorNotifications/)
  assert.match(panel, /monitorNotificationGeneration/)
  assert.match(panel, /commitMonitorNotifications/)
  assert.match(tools, /newsclaw_add_web_monitor[\s\S]+--request-id/)
  assert.match(tools, /newsclaw_act_on_monitor_notification[\s\S]+--request-id/)
})

test('news UI does not expose video-platform vocabulary or logic', () => {
  const sourceFiles = [
    'src/client/NewsClawPanel.tsx', 'src/client/api.ts', 'src/client/dialogue.tsx',
    'src/client/index.ts', 'src/client/layout.ts', 'src/client/library.tsx',
    'src/client/notifications.tsx', 'src/client/profile.tsx', 'src/client/settings.tsx',
    'src/client/views.tsx', 'src/bridge.ts', 'src/index.ts', 'src/tools.ts',
  ].map(read).join('\n')
  assert.doesNotMatch(sourceFiles, /OpenBiliClaw|BVID|\bbvid\b|Bilibili|UP 主|弹幕|视频推荐|喜欢时长/i)
})

test('saved, profile, messages and autostart do not mask failed state reads', () => {
  const api = read('src/client/api.ts')
  const views = read('src/client/views.tsx')
  const library = read('src/client/library.tsx')
  const notifications = read('src/client/notifications.tsx')
  const settings = read('src/client/settings.tsx')
  assert.doesNotMatch(api, /fetchSavedStatus[\s\S]{0,400}catch \{/)
  assert.doesNotMatch(views, /fetchSavedStatus\([^\n]+\.catch\(\(\) => false\)/)
  assert.match(library, /useState<boolean \| null>\(null\)/)
  assert.match(notifications, /Promise\.allSettled/)
  assert.match(notifications, /部分消息来源读取失败/)
  assert.match(settings, /const verified = await fetchAutostartStatus\(base\)/)
  assert.match(settings, /verified\.enabled !== enabled/)
  assert.match(api, /画像摘要返回格式无效/)
  assert.match(api, /开机启动状态缺少 enabled/)
  assert.match(read('src/client/dialogue.tsx'), /Promise\.allSettled/)
})

test('control closure matrix is packaged and live tool contracts cover restored research tools', () => {
  const matrix = read('docs/control-closure-matrix.md')
  const tools = read('src/tools.ts')
  const packageJson = JSON.parse(read('package.json'))
  assert.ok(packageJson.files.includes('docs/control-closure-matrix.md'))
  assert.match(matrix, /Handler \/ API/)
  assert.match(matrix, /状态与持久化/)
  assert.match(matrix, /失败、超时与重试/)
  assert.match(tools, /name: 'newsclaw_search_web'[\s\S]+never send private profile/i)
  assert.match(tools, /name: 'newsclaw_extract_evidence'[\s\S]+private\/intranet URLs/i)
  assert.match(tools, /bridge\.run\('research-search'/)
  assert.match(tools, /bridge\.run\('research-extract'/)
})
