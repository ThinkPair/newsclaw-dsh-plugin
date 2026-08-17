/**
 * Truthful NewsClaw settings summary for the DSH side panel.
 *
 * DSH deliberately does not maintain a second editor for backend settings.
 * It reads the dedicated NewsClaw runtime/source contracts, shows the plugin
 * row connection, and sends full configuration work to the desktop Web UI.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  applyAutostart, fetchAutostartStatus, fetchNewsRuntime, fetchNewsSources,
  type NewsEffectiveSettings, type NewsRuntimeSnapshot, type NewsSourceState,
  type NewsSourcesSnapshot,
} from './api.ts'
import { ActionButton } from './views.tsx'
import css from './panel.module.css'

type SettingsTab = 'status' | 'sources' | 'connection'

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'status', label: '运行状态' },
  { key: 'sources', label: '新闻来源' },
  { key: 'connection', label: '插件连接' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className={css.settingsSection}><h3>{title}</h3>{children}</section>
}

function formatDate(value: string): string {
  if (value === '') return '尚无记录'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`
}

function runtimeLabel(state: string): string {
  const normalized = state.toLowerCase()
  if (normalized === 'online' || normalized === 'healthy' || normalized === 'success') return '正常'
  if (normalized === 'degraded' || normalized === 'partial') return '降级'
  if (normalized === 'offline' || normalized === 'failed' || normalized === 'error') return '异常'
  return state === '' ? '待确认' : state
}

function statusTone(state: string): 'online' | 'degraded' | 'offline' | 'unknown' {
  const normalized = state.toLowerCase()
  if (normalized === 'online' || normalized === 'healthy' || normalized === 'success') return 'online'
  if (normalized === 'degraded' || normalized === 'partial') return 'degraded'
  if (normalized === 'offline' || normalized === 'failed' || normalized === 'error') return 'offline'
  return 'unknown'
}

function StatusPill({ state }: { state: string }): React.JSX.Element {
  return <span className={css.settingsStatusPill} data-state={statusTone(state)}>{runtimeLabel(state)}</span>
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }): React.JSX.Element {
  return <div className={css.settingsMetric}>
    <span>{label}</span>
    <strong>{value}</strong>
    {hint !== undefined ? <small>{hint}</small> : null}
  </div>
}

function SettingRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return <div className={css.settingsValueRow}><span>{label}</span><strong>{value}</strong></div>
}

function FullSettingsCard({ base }: { base: string }): React.JSX.Element {
  const openDesktop = (): void => {
    window.open(`${base.replace(/\/+$/, '')}/web`, '_blank', 'noopener')
  }
  return <Section title="完整配置在电脑版">
    <p className={css.settingsHint}>AI 实例与路由、DeepSeek 密钥、新闻源开关、自定义 RSS、刷新和重试参数，都由新闻爪电脑版统一管理。DSH 这里只展示后端确认已经生效的结果，不再保存一份“看起来能改、实际不生效”的配置。</p>
    <div className={css.settingsActionRow}>
      <ActionButton label="打开新闻爪电脑版" primary onClick={openDesktop} />
    </div>
  </Section>
}

function EffectiveSettingsView({ settings }: { settings: NewsEffectiveSettings | null }): React.JSX.Element {
  if (settings === null) return <p className={css.settingsHint}>后端尚未返回生效配置。</p>
  return <div className={css.settingsValueList}>
    <SettingRow label="候选池目标" value={`${settings.pool_target_count} 条`} />
    <SettingRow label="调度检查" value={`${settings.refresh_poll_minutes} 分钟`} />
    <SettingRow label="热门刷新" value={`${settings.hot_refresh_minutes} 分钟`} />
    <SettingRow label="探索刷新" value={`${settings.exploration_refresh_minutes} 分钟`} />
    <SettingRow label="反馈触发" value={`${settings.feedback_threshold} 次`} />
    <SettingRow label="主动推送" value={settings.proactive_push ? '已开启' : '已关闭'} />
    <SettingRow label="后台 AI" value={settings.background_llm ? '已开启' : '已关闭'} />
    <SettingRow label="关闭浏览器后" value={settings.browser_close_behavior === 'continue' ? '继续运行' : settings.browser_close_behavior || '—'} />
    <SettingRow label="失败重试" value={`${settings.retry_max_attempts} 次；${formatDuration(settings.retry_base_seconds)} → ${formatDuration(settings.retry_max_seconds)}`} />
  </div>
}

function StatusView({ runtime, settings }: { runtime: NewsRuntimeSnapshot | null; settings: NewsEffectiveSettings | null }): React.JSX.Element {
  return <>
    <div className={css.settingsRuntimeHero} data-state={runtime?.status ?? 'offline'}>
      <div>
        <span className={css.settingsEyebrow}>NEWSCLAW RUNTIME</span>
        <strong>{runtime === null ? '正在确认后端状态' : runtime.status === 'online' ? '新闻爪运行正常' : runtime.status === 'degraded' ? '新闻爪正在降级运行' : '新闻爪当前离线'}</strong>
        <p>{runtime === null ? '正在读取 /api/news/runtime' : `最近刷新：${formatDate(runtime.last_refresh)}`}</p>
      </div>
      <StatusPill state={runtime?.status ?? 'unknown'} />
    </div>
    <div className={css.settingsMetricGrid}>
      <Metric label="最近入池" value={runtime?.last_article_count ?? '—'} hint="后端真实返回" />
      <Metric label="调度通道" value={runtime?.last_schedule_lane === 'exploration' ? '探索' : runtime?.last_schedule_lane === 'hot' ? '热门' : '—'} />
      <Metric label="画像" value={runtime?.profile_ready === true ? '就绪' : '未就绪'} />
      <Metric label="刷新任务" value={runtime?.refresh_running === true || runtime?.bootstrap_running === true ? '进行中' : '空闲'} />
    </div>
    <Section title="当前已生效的刷新参数">
      <p className={css.settingsHint}>以下数值来自后端的 effective_settings，不是 DSH 自己猜测的默认值。</p>
      <EffectiveSettingsView settings={settings} />
    </Section>
  </>
}

function SourcesView({ snapshot }: { snapshot: NewsSourcesSnapshot | null }): React.JSX.Element {
  const sources = snapshot?.sources ?? []
  const healthy = sources.filter(source => statusTone(source.status) === 'online').length
  return <>
    <Section title="来源概况">
      <div className={css.settingsMetricGrid}>
        <Metric label="已接入" value={sources.length} />
        <Metric label="当前正常" value={healthy} />
      </div>
      <p className={css.settingsHint}>来源状态直接读取 /api/news/sources。DSH 不修改来源开关、权重或单源频率；完整设置请到电脑版完成。</p>
    </Section>
    {sources.length === 0 ? <div className={css.empty}>后端还没有返回新闻来源。</div> : <div className={css.settingsSourceList}>
      {sources.map(source => <SourceCard key={source.source_id} source={source} />)}
    </div>}
  </>
}

function SourceCard({ source }: { source: NewsSourceState }): React.JSX.Element {
  return <article className={css.settingsSourceCard}>
    <div className={css.settingsSourceHead}>
      <div>
        <strong>{source.media || source.source_id}</strong>
        <span>{source.technical_provider || source.kind || '未标注技术提供方'}</span>
      </div>
      {source.enabled ? <StatusPill state={source.status} /> : <span className={css.settingsStatusPill} data-state="unknown">已停用</span>}
    </div>
    <div className={css.settingsSourceMeta}>
      <span>{source.enabled ? '已启用' : '已停用'}</span>
      <span>{source.custom ? '自定义 RSS' : source.kind === 'rss' ? '官方 RSS/Atom' : source.kind === 'tushare' ? 'Tushare 接口' : source.kind || '新闻接口'}</span>
      <span>{source.credential_configured ? '凭据/地址已配置' : '需要配置'}</span>
    </div>
    <p className={css.settingsHint}>最后成功：{formatDate(source.last_success_at)}</p>
    {source.error !== '' ? <p className={css.settingsSourceError}>当前错误：{source.error}</p> : null}
  </article>
}

function ConnectionView({ base, timeoutMs, autostart, onAutostart }: {
  base: string
  timeoutMs: number
  autostart: { loaded: boolean; enabled: boolean; busy: boolean }
  onAutostart: (enabled: boolean) => void
}): React.JSX.Element {
  return <>
    <Section title="插件自身连接">
      <div className={css.settingsConnectionValue}>
        <span>API 地址</span>
        <code>{base}</code>
      </div>
      <div className={css.settingsConnectionValue}>
        <span>Agent 工具单次总超时</span>
        <code>{timeoutMs} ms（{Math.round(timeoutMs / 1000)} 秒）</code>
      </div>
      <p className={css.settingsHint}>这两个值来自 Harness 插件行的 apiUrl / timeoutMs。面板启动时会把同一个 apiUrl 镜像给全部界面请求，22 个 Agent Bridge 工具也使用该地址，避免两套连接漂移。</p>
      <p className={css.settingsHint}>修改它们需要编辑 DSH 插件配置并重新加载插件；这里保持只读，防止只改右侧栏却没有改 Agent 工具。</p>
    </Section>
    <Section title="本机启动">
      <label className={css.settingsToggleRow}>
        <input
          type="checkbox"
          checked={autostart.enabled}
          disabled={!autostart.loaded || autostart.busy}
          onChange={event => onAutostart(event.target.checked)}
        />
        <span><strong>开机自动启动新闻爪</strong><small>{!autostart.loaded ? '正在读取真实状态…' : autostart.busy ? '正在应用…' : autostart.enabled ? '当前已开启' : '当前已关闭'}</small></span>
      </label>
      <p className={css.settingsHint}>该开关直接调用新闻爪的本机自启动接口，是本页唯一会改动后端状态的项目。</p>
    </Section>
    <Section title="隐私与边界">
      <p className={css.settingsHint}>页面不会读取或回显 DeepSeek、Tushare 等 Token。插件只连接本机新闻爪，不抓网页、不读取新闻网站 Cookie，也不连接券商或执行交易。</p>
    </Section>
  </>
}

export function SettingsOverlay({ base, timeoutMs, onClose }: { base: string; timeoutMs: number; onClose: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('status')
  const [runtime, setRuntime] = useState<NewsRuntimeSnapshot | null>(null)
  const [sources, setSources] = useState<NewsSourcesSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [autostart, setAutostart] = useState({ loaded: false, enabled: false, busy: false })

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setNotice('')
    const [runtimeResult, sourcesResult, autostartResult] = await Promise.allSettled([
      fetchNewsRuntime(base, signal),
      fetchNewsSources(base, signal),
      fetchAutostartStatus(base, signal),
    ])
    if (signal?.aborted === true) return
    if (runtimeResult.status === 'fulfilled') setRuntime(runtimeResult.value)
    if (sourcesResult.status === 'fulfilled') setSources(sourcesResult.value)
    if (autostartResult.status === 'fulfilled') setAutostart({ loaded: true, enabled: autostartResult.value.enabled, busy: false })
    else setAutostart(value => ({ ...value, loaded: true, busy: false }))
    const failed = [runtimeResult, sourcesResult].filter(result => result.status === 'rejected')
    if (failed.length > 0) setNotice(failed.length === 2 ? '新闻爪后端暂时不可达，请确认服务已经启动。' : '部分实时状态读取失败，当前展示的是已成功取得的数据。')
    setLoading(false)
  }, [base])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const toggleAutostart = useCallback(async (enabled: boolean) => {
    setAutostart(value => ({ ...value, busy: true }))
    setNotice('')
    try {
      await applyAutostart(base, enabled)
      setAutostart({ loaded: true, enabled, busy: false })
      setNotice(enabled ? '已开启开机自动启动。' : '已关闭开机自动启动。')
    } catch (error) {
      setAutostart(value => ({ ...value, busy: false }))
      setNotice('自启动设置失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }, [base])

  const effective = runtime?.effective_settings ?? sources?.settings ?? null

  return <div className={css.settingsOverlay} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={css.settingsPanel}>
      <div className={css.settingsHeader}>
        <div><h2>新闻爪状态与配置</h2><p>DSH 展示真实状态，完整设置由电脑版统一管理</p></div>
        <button type="button" className={css.settingsBack} title="返回" onClick={onClose}>←</button>
      </div>
      <div className={css.settingsTabs} role="tablist">
        {TABS.map(row => <button type="button" key={row.key} className={css.settingsTab} data-active={tab === row.key} onClick={() => setTab(row.key)}>{row.label}</button>)}
      </div>
      <div className={css.settingsBody}>
        {notice !== '' ? <div className={css.settingsNotice} role="status">{notice}</div> : null}
        {loading && runtime === null && sources === null ? <div className={css.empty}>正在读取后端实际状态…</div> : <>
          {tab === 'status' ? <StatusView runtime={runtime ?? sources?.runtime ?? null} settings={effective} /> : null}
          {tab === 'sources' ? <SourcesView snapshot={sources} /> : null}
          {tab === 'connection' ? <ConnectionView base={base} timeoutMs={timeoutMs} autostart={autostart} onAutostart={enabled => { void toggleAutostart(enabled) }} /> : null}
          <FullSettingsCard base={base} />
          <div className={css.settingsRefreshBar}>
            <span>{loading ? '正在刷新…' : '数据来自新闻爪专用接口'}</span>
            <ActionButton label="刷新实际状态" disabled={loading} onClick={() => { void load() }} />
          </div>
        </>}
      </div>
    </div>
  </div>
}
