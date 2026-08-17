import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('registers the exact 22 NewsClaw bridge tool names', () => {
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
  ]
  assert.deepEqual(names, expected)
  assert.equal(new Set(names).size, 22)
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
  assert.match(clientEntry, /apply\(ctx: ClientContext, config\?: NewsClawClientConfig\)/)
  assert.match(clientEntry, /apiUrl: config\?\.apiUrl/)
  assert.match(clientEntry, /timeoutMs: typeof config\?\.timeoutMs/)
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
})

test('learning writes are idempotent and credentials are redacted', () => {
  const tools = read('src/tools.ts')
  const bridge = read('src/bridge.ts')
  const api = read('src/client/api.ts')
  assert.match(tools, /--request-id[\s\S]+bridge\.run\('respond-interest-probe'/)
  assert.match(tools, /--request-id[\s\S]+bridge\.run\('respond-avoidance-probe'/)
  assert.match(api, /interest-probes\/respond[\s\S]+request_id/)
  assert.match(api, /avoidance-probes\/respond[\s\S]+request_id/)
  assert.match(bridge, /sanitizeBridgeValue/)
  assert.match(bridge, /SECRET_KEY/)
  assert.match(bridge, /\[REDACTED\]/)
})

test('client CSS is upserted on a hot reload', () => {
  const build = read('tsdown.config.ts')
  assert.match(build, /const existing = document\.querySelector/)
  assert.match(build, /if \(tag\.textContent !== css\) tag\.textContent = css/)
  assert.match(build, /if \(existing === null\) document\.head\.appendChild\(tag\)/)
})

test('upstream license notices ship with the source package', () => {
  for (const path of ['LICENSE', 'NOTICE', 'licenses/OpenBiliClaw-MIT.txt']) {
    assert.equal(existsSync(join(root, path)), true, `${path} missing`)
  }
  assert.match(read('LICENSE'), /BSD 3-Clause License/)
  assert.match(read('licenses/OpenBiliClaw-MIT.txt'), /MIT License/)
})
