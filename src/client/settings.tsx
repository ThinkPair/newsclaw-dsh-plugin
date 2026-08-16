/** NewsClaw settings surface: AI, sources, refresh, recommendation, profile, general and logs. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_API_BASE, applyAutostart, fetchAutostartStatus, fetchConfig,
  fetchSourceAvailability, readApiBase, updateConfig, writeApiBase,
  type SourceAvailability,
} from './api.ts'
import { ActionButton } from './views.tsx'
import css from './panel.module.css'

type SettingsTab = 'ai' | 'sources' | 'refresh' | 'recommendation' | 'profile' | 'general' | 'logs'

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'ai', label: 'AI 模型' },
  { key: 'sources', label: '新闻源' },
  { key: 'refresh', label: '刷新' },
  { key: 'recommendation', label: '推荐' },
  { key: 'profile', label: '画像' },
  { key: 'general', label: '通用' },
  { key: 'logs', label: '日志' },
]

interface SourceDraft {
  id: string
  name: string
  provider: string
  enabled: boolean
  weight: number
  refreshMinutes: number
  health: 'online' | 'degraded' | 'offline' | 'unknown'
  lastSuccess: string
  error: string
}

interface SettingsDraft {
  ai: { provider: string; model: string; baseUrl: string; apiKey: string; apiKeyConfigured: boolean; concurrency: number; timeout: number }
  sources: SourceDraft[]
  refresh: {
    poolTarget: number
    pollSeconds: number
    hotMinutes: number
    exploreMinutes: number
    feedbackThreshold: number
    proactivePush: boolean
    pushSeconds: number
    backgroundLlm: boolean
    continueAfterClose: boolean
    retryBaseSeconds: number
    retryMaxSeconds: number
    sourceShareLimit: number
  }
  recommendation: { explorationRatio: number; candidateTtlHours: number; dedupeThreshold: number; sourceDiversity: boolean; hardNegativeFilter: boolean }
  profile: { probeThreshold: number; maxActiveProbes: number; manualOverrideWins: boolean }
  general: { language: string; dataDir: string; dbPath: string }
  logs: { level: string; fileLevel: string; path: string }
}

function dict(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function firstInstance(llm: Record<string, unknown>): Record<string, unknown> {
  const instances = dict(llm.instances)
  const first = Object.values(instances).find(value => typeof value === 'object' && value !== null)
  return dict(first)
}

function parseSources(raw: Record<string, unknown>, availability: SourceAvailability[]): SourceDraft[] {
  const value = raw.news_sources ?? raw.sources
  const rows: Array<[string, Record<string, unknown>]> = Array.isArray(value)
    ? value.map((row, index) => [text(dict(row).id, `source-${index + 1}`), dict(row)])
    : Object.entries(dict(value)).map(([id, row]) => [id, dict(row)])
  const ids = new Set(rows.map(([id]) => id))
  for (const source of availability) {
    if (!ids.has(source.id)) rows.push([source.id || source.media, { media: source.media }])
  }
  return rows.map(([id, row]) => {
    const runtime = availability.find(source => source.id === id || source.media === text(row.name ?? row.media, id))
    const healthValue = text(runtime?.state ?? row.health ?? row.state ?? row.status, 'unknown').toLowerCase()
    const health = healthValue === 'online' || healthValue === 'degraded' || healthValue === 'offline' ? healthValue : 'unknown'
    return {
      id,
      name: text(row.name ?? row.media, runtime?.media || id),
      provider: runtime?.technical_provider || text(row.technical_provider ?? row.provider),
      enabled: boolean(row.enabled, true),
      weight: number(row.weight, 1),
      refreshMinutes: number(row.refresh_minutes ?? row.refresh_interval_minutes, 5),
      health,
      lastSuccess: runtime?.last_success_at || text(row.last_success_at ?? row.last_success),
      error: runtime?.error || text(row.error ?? row.last_error),
    }
  })
}

function buildDraft(raw: Record<string, unknown>, availability: SourceAvailability[] = []): SettingsDraft {
  const llm = dict(raw.llm)
  const instance = firstInstance(llm)
  const scheduler = dict(raw.scheduler)
  const recommendation = dict(raw.recommendation)
  const profile = dict(raw.profile)
  const storage = dict(raw.storage)
  const logging = dict(raw.logging)
  return {
    ai: {
      provider: text(instance.provider_type ?? llm.provider, 'deepseek'),
      model: text(instance.model ?? llm.model, 'deepseek-chat'),
      baseUrl: text(instance.base_url ?? llm.base_url),
      apiKey: '',
      apiKeyConfigured: text(instance.api_key ?? llm.api_key) !== '' || boolean(instance.api_key_configured ?? llm.api_key_configured),
      concurrency: number(llm.concurrency, 4),
      timeout: number(llm.timeout, 120),
    },
    sources: parseSources(raw, availability),
    refresh: {
      poolTarget: number(scheduler.pool_target_count, 300),
      pollSeconds: number(scheduler.refresh_check_interval_seconds, 60),
      hotMinutes: number(scheduler.trending_refresh_minutes, 3),
      exploreMinutes: number(scheduler.explore_refresh_minutes, 15),
      feedbackThreshold: number(scheduler.feedback_batch_threshold, 3),
      proactivePush: boolean(scheduler.proactive_push_enabled, true),
      pushSeconds: number(scheduler.proactive_push_interval_seconds, 120),
      backgroundLlm: boolean(scheduler.background_llm_enabled, true),
      continueAfterClose: boolean(scheduler.continue_after_browser_close, true),
      retryBaseSeconds: number(scheduler.retry_base_seconds, 5),
      retryMaxSeconds: number(scheduler.retry_max_seconds, 300),
      sourceShareLimit: number(scheduler.source_share_limit, 0.4),
    },
    recommendation: {
      explorationRatio: number(recommendation.exploration_ratio, 0.15),
      candidateTtlHours: number(recommendation.candidate_ttl_hours, 48),
      dedupeThreshold: number(recommendation.semantic_dedupe_threshold, 0.88),
      sourceDiversity: boolean(recommendation.source_diversity_enabled, true),
      hardNegativeFilter: boolean(recommendation.hard_negative_filter_enabled, true),
    },
    profile: {
      probeThreshold: number(profile.probe_confirmation_threshold, 3),
      maxActiveProbes: number(profile.max_active_probes, 5),
      manualOverrideWins: true,
    },
    general: {
      language: text(raw.language, 'zh'),
      dataDir: text(raw.data_dir, 'data'),
      dbPath: text(storage.db_path, 'data/newsclaw.db'),
    },
    logs: {
      level: text(logging.level, 'INFO'),
      fileLevel: text(logging.file_level, 'DEBUG'),
      path: `${text(logging.directory, 'logs')}/${text(logging.filename, 'newsclaw.log')}`,
    },
  }
}

function buildPayload(draft: SettingsDraft): Record<string, unknown> {
  const slash = Math.max(draft.logs.path.lastIndexOf('/'), draft.logs.path.lastIndexOf('\\'))
  const directory = slash >= 0 ? draft.logs.path.slice(0, slash) : 'logs'
  const filename = slash >= 0 ? draft.logs.path.slice(slash + 1) : draft.logs.path
  const llm: Record<string, unknown> = {
    provider: draft.ai.provider,
    model: draft.ai.model,
    base_url: draft.ai.baseUrl,
    concurrency: draft.ai.concurrency,
    timeout: draft.ai.timeout,
  }
  if (draft.ai.apiKey.trim() !== '' && !draft.ai.apiKey.includes('*')) llm.api_key = draft.ai.apiKey.trim()
  return {
    llm,
    news_sources: Object.fromEntries(draft.sources.map(source => [source.id, {
      enabled: source.enabled,
      weight: source.weight,
      refresh_minutes: source.refreshMinutes,
    }])),
    scheduler: {
      pool_target_count: draft.refresh.poolTarget,
      refresh_check_interval_seconds: draft.refresh.pollSeconds,
      trending_refresh_minutes: draft.refresh.hotMinutes,
      explore_refresh_minutes: draft.refresh.exploreMinutes,
      feedback_batch_threshold: draft.refresh.feedbackThreshold,
      proactive_push_enabled: draft.refresh.proactivePush,
      proactive_push_interval_seconds: draft.refresh.pushSeconds,
      background_llm_enabled: draft.refresh.backgroundLlm,
      continue_after_browser_close: draft.refresh.continueAfterClose,
      retry_base_seconds: draft.refresh.retryBaseSeconds,
      retry_max_seconds: draft.refresh.retryMaxSeconds,
      source_share_limit: draft.refresh.sourceShareLimit,
    },
    recommendation: {
      exploration_ratio: draft.recommendation.explorationRatio,
      candidate_ttl_hours: draft.recommendation.candidateTtlHours,
      semantic_dedupe_threshold: draft.recommendation.dedupeThreshold,
      source_diversity_enabled: draft.recommendation.sourceDiversity,
      hard_negative_filter_enabled: draft.recommendation.hardNegativeFilter,
    },
    profile: {
      probe_confirmation_threshold: draft.profile.probeThreshold,
      max_active_probes: draft.profile.maxActiveProbes,
      manual_override_wins: true,
    },
    language: draft.general.language,
    data_dir: draft.general.dataDir,
    storage: { db_path: draft.general.dbPath },
    logging: { level: draft.logs.level, file_level: draft.logs.fileLevel, directory, filename: filename || 'newsclaw.log' },
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return <div className={css.settingsField}><label>{label}</label>{children}{hint !== undefined ? <p className={css.settingsHint}>{hint}</p> : null}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className={css.settingsSection}><h3>{title}</h3>{children}</section>
}

function TextInput({ value, onChange, type = 'text', placeholder }: { value: string; onChange: (value: string) => void; type?: string; placeholder?: string }): React.JSX.Element {
  return <input className={css.settingsInput} type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }): React.JSX.Element {
  return <input className={css.settingsInput} type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(number(event.target.value, value))} />
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }): React.JSX.Element {
  return <div className={css.settingsField}><div className={css.settingsFieldRow}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><label>{label}</label></div>{hint !== undefined ? <p className={css.settingsHint}>{hint}</p> : null}</div>
}

function AiTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  const set = <K extends keyof SettingsDraft['ai']>(key: K, value: SettingsDraft['ai'][K]): void => patch({ ...draft, ai: { ...draft.ai, [key]: value } })
  return <Section title="默认 AI 模型">
    <Field label="提供方"><TextInput value={draft.ai.provider} onChange={value => set('provider', value)} /></Field>
    <Field label="模型"><TextInput value={draft.ai.model} onChange={value => set('model', value)} /></Field>
    <Field label="Base URL"><TextInput value={draft.ai.baseUrl} onChange={value => set('baseUrl', value)} /></Field>
    <Field label="API Key" hint={draft.ai.apiKeyConfigured ? '已配置（值已隐藏）；留空会保留后端现有密钥。' : '尚未配置；页面不会读取或回显真实密钥。'}><TextInput type="password" value={draft.ai.apiKey} placeholder={draft.ai.apiKeyConfigured ? '已配置，值已隐藏' : '输入新密钥'} onChange={value => set('apiKey', value)} /></Field>
    <Field label="并发"><NumberInput value={draft.ai.concurrency} min={1} max={16} onChange={value => set('concurrency', value)} /></Field>
    <Field label="超时（秒）"><NumberInput value={draft.ai.timeout} min={10} max={1800} onChange={value => set('timeout', value)} /></Field>
  </Section>
}

function SourcesTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  const update = (index: number, partial: Partial<SourceDraft>): void => patch({ ...draft, sources: draft.sources.map((source, i) => i === index ? { ...source, ...partial } : source) })
  if (draft.sources.length === 0) return <Section title="新闻来源"><p className={css.settingsHint}>后端还没有返回新闻源配置。首次启动会验证 Tushare 与 RSS 契约。</p></Section>
  return <>{draft.sources.map((source, index) => <Section key={source.id} title={source.name}>
    <p className={css.settingsHint}>技术提供方：{source.provider || '未标注'} · 状态：{source.health === 'online' ? '在线' : source.health === 'degraded' ? '降级' : source.health === 'offline' ? '离线' : '待验证'}</p>
    <Toggle label="启用" checked={source.enabled} onChange={enabled => update(index, { enabled })} />
    <Field label="权重"><NumberInput value={source.weight} min={0} max={10} step={0.1} onChange={weight => update(index, { weight })} /></Field>
    <Field label="刷新频率（分钟）"><NumberInput value={source.refreshMinutes} min={1} max={1440} onChange={refreshMinutes => update(index, { refreshMinutes })} /></Field>
    {source.lastSuccess !== '' ? <p className={css.settingsHint}>最后成功：{source.lastSuccess}</p> : null}
    {source.error !== '' ? <p className={css.settingsHint}>当前错误：{source.error}</p> : null}
  </Section>)}</>
}

function RefreshTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  const set = <K extends keyof SettingsDraft['refresh']>(key: K, value: SettingsDraft['refresh'][K]): void => patch({ ...draft, refresh: { ...draft.refresh, [key]: value } })
  const r = draft.refresh
  return <>
    <Section title="候选池与刷新">
      <Field label="候选池目标数"><NumberInput value={r.poolTarget} min={20} max={2000} onChange={value => set('poolTarget', value)} /></Field>
      <Field label="刷新轮询（秒）"><NumberInput value={r.pollSeconds} min={15} max={3600} onChange={value => set('pollSeconds', value)} /></Field>
      <Field label="热门刷新（分钟）"><NumberInput value={r.hotMinutes} min={1} max={1440} onChange={value => set('hotMinutes', value)} /></Field>
      <Field label="探索刷新（分钟）"><NumberInput value={r.exploreMinutes} min={1} max={1440} onChange={value => set('exploreMinutes', value)} /></Field>
      <Field label="反馈触发阈值"><NumberInput value={r.feedbackThreshold} min={1} max={100} onChange={value => set('feedbackThreshold', value)} /></Field>
      <Field label="单一来源最高占比"><NumberInput value={r.sourceShareLimit} min={0.1} max={1} step={0.05} onChange={value => set('sourceShareLimit', value)} /></Field>
    </Section>
    <Section title="后台与重试">
      <Toggle label="主动推送" checked={r.proactivePush} onChange={value => set('proactivePush', value)} />
      <Field label="推送轮询（秒）"><NumberInput value={r.pushSeconds} min={30} max={86400} onChange={value => set('pushSeconds', value)} /></Field>
      <Toggle label="后台运行 AI" checked={r.backgroundLlm} onChange={value => set('backgroundLlm', value)} />
      <Toggle label="关闭浏览器后继续刷新" checked={r.continueAfterClose} onChange={value => set('continueAfterClose', value)} />
      <Field label="重试起始（秒）"><NumberInput value={r.retryBaseSeconds} min={1} max={300} onChange={value => set('retryBaseSeconds', value)} /></Field>
      <Field label="重试上限（秒）"><NumberInput value={r.retryMaxSeconds} min={10} max={3600} onChange={value => set('retryMaxSeconds', value)} /></Field>
    </Section>
  </>
}

function RecommendationTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  const set = <K extends keyof SettingsDraft['recommendation']>(key: K, value: SettingsDraft['recommendation'][K]): void => patch({ ...draft, recommendation: { ...draft.recommendation, [key]: value } })
  const r = draft.recommendation
  return <Section title="推荐池规则">
    <Field label="探索比例"><NumberInput value={r.explorationRatio} min={0} max={1} step={0.05} onChange={value => set('explorationRatio', value)} /></Field>
    <Field label="候选时效（小时）"><NumberInput value={r.candidateTtlHours} min={1} max={720} onChange={value => set('candidateTtlHours', value)} /></Field>
    <Field label="语义去重阈值"><NumberInput value={r.dedupeThreshold} min={0.5} max={1} step={0.01} onChange={value => set('dedupeThreshold', value)} /></Field>
    <Toggle label="来源多样性" checked={r.sourceDiversity} onChange={value => set('sourceDiversity', value)} />
    <Toggle label="负反馈立即出池" checked={r.hardNegativeFilter} onChange={value => set('hardNegativeFilter', value)} />
  </Section>
}

function ProfileTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  const set = <K extends keyof SettingsDraft['profile']>(key: K, value: SettingsDraft['profile'][K]): void => patch({ ...draft, profile: { ...draft.profile, [key]: value } })
  return <Section title="五层画像">
    <p className={css.settingsHint}>事件 → 偏好 → 觉察 → 洞察 → 灵魂。手工修改永远覆盖 AI 推断。</p>
    <Field label="探测确认阈值"><NumberInput value={draft.profile.probeThreshold} min={1} max={20} onChange={value => set('probeThreshold', value)} /></Field>
    <Field label="同时活跃探测数"><NumberInput value={draft.profile.maxActiveProbes} min={1} max={50} onChange={value => set('maxActiveProbes', value)} /></Field>
    <Toggle label="手工修改优先" checked onChange={() => undefined} hint="固定开启，不能被 AI 覆盖。" />
  </Section>
}

function GeneralTab({ draft, patch, base, onBaseChange, toast }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void; base: string; onBaseChange: (base: string) => void; toast: (value: string) => void }): React.JSX.Element {
  const [apiBase, setApiBase] = useState(() => readApiBase())
  const [autostart, setAutostart] = useState<{ loaded: boolean; enabled: boolean; busy: boolean }>({ loaded: false, enabled: false, busy: false })
  useEffect(() => {
    let cancelled = false
    void fetchAutostartStatus(base).then(value => { if (!cancelled) setAutostart({ loaded: true, enabled: value.enabled, busy: false }) }).catch(() => { if (!cancelled) setAutostart({ loaded: true, enabled: false, busy: false }) })
    return () => { cancelled = true }
  }, [base])
  const saveBase = (): void => {
    const next = (apiBase.trim() || DEFAULT_API_BASE).replace(/\/+$/, '')
    writeApiBase(next)
    onBaseChange(next)
    toast('后端地址已保存。')
  }
  const toggleAutostart = async (enabled: boolean): Promise<void> => {
    setAutostart(value => ({ ...value, busy: true }))
    try {
      await applyAutostart(base, enabled)
      setAutostart({ loaded: true, enabled, busy: false })
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error))
      setAutostart(value => ({ ...value, busy: false }))
    }
  }
  return <>
    <Section title="连接">
      <Field label="后端地址"><TextInput value={apiBase} placeholder={DEFAULT_API_BASE} onChange={setApiBase} /></Field>
      <ActionButton label="保存地址" primary onClick={saveBase} />
    </Section>
    <Section title="本地数据">
      <Field label="语言"><TextInput value={draft.general.language} onChange={value => patch({ ...draft, general: { ...draft.general, language: value } })} /></Field>
      <Field label="数据目录"><TextInput value={draft.general.dataDir} onChange={value => patch({ ...draft, general: { ...draft.general, dataDir: value } })} /></Field>
      <Field label="数据库"><TextInput value={draft.general.dbPath} onChange={value => patch({ ...draft, general: { ...draft.general, dbPath: value } })} /></Field>
      <Toggle label="开机自动启动新闻爪" checked={autostart.enabled} onChange={value => void toggleAutostart(value)} hint={!autostart.loaded ? '正在读取状态…' : autostart.busy ? '正在应用…' : undefined} />
    </Section>
  </>
}

function LogsTab({ draft, patch }: { draft: SettingsDraft; patch: (next: SettingsDraft) => void }): React.JSX.Element {
  return <Section title="日志">
    <Field label="控制台级别"><TextInput value={draft.logs.level} onChange={value => patch({ ...draft, logs: { ...draft.logs, level: value } })} /></Field>
    <Field label="文件级别"><TextInput value={draft.logs.fileLevel} onChange={value => patch({ ...draft, logs: { ...draft.logs, fileLevel: value } })} /></Field>
    <Field label="日志路径" hint="日志不得包含 Token、API Key 或未脱敏配置。"><TextInput value={draft.logs.path} onChange={value => patch({ ...draft, logs: { ...draft.logs, path: value } })} /></Field>
  </Section>
}

export function SettingsOverlay({ base, onBaseChange, onClose }: { base: string; onBaseChange: (base: string) => void; onClose: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('ai')
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [saved, setSaved] = useState('')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [config, availability] = await Promise.all([
        fetchConfig(base),
        fetchSourceAvailability(base).catch(() => []),
      ])
      const next = buildDraft(config, availability)
      setDraft(next)
      setSaved(JSON.stringify(next))
    } catch (error) {
      setToast('配置读取失败：' + (error instanceof Error ? error.message : String(error)))
      const next = buildDraft({})
      setDraft(next)
      setSaved(JSON.stringify(next))
    }
  }, [base])
  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved])
  const save = useCallback(async () => {
    if (draft === null) return
    setSaving(true)
    try {
      await updateConfig(base, buildPayload(draft))
      setToast('配置已保存并热更新。')
      await load()
    } catch (error) {
      setToast('保存失败，后端应继续使用最后一份可用配置：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSaving(false)
    }
  }, [base, draft, load])

  return <div className={css.settingsOverlay} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={css.settingsPanel}>
      <div className={css.settingsHeader}><h2>新闻爪设置</h2><button type="button" className={css.settingsBack} title="返回" onClick={onClose}>←</button></div>
      <div className={css.settingsTabs} role="tablist">
        {TABS.map(row => <button type="button" key={row.key} className={css.settingsTab} data-active={tab === row.key} onClick={() => setTab(row.key)}>{row.label}</button>)}
      </div>
      <div className={css.settingsBody}>
        {toast !== '' ? <div className={css.settingsToastBar} role="status">{toast}</div> : null}
        {draft === null ? <div className={css.empty}>配置加载中…</div> : <>
          {tab === 'ai' ? <AiTab draft={draft} patch={setDraft} /> : null}
          {tab === 'sources' ? <SourcesTab draft={draft} patch={setDraft} /> : null}
          {tab === 'refresh' ? <RefreshTab draft={draft} patch={setDraft} /> : null}
          {tab === 'recommendation' ? <RecommendationTab draft={draft} patch={setDraft} /> : null}
          {tab === 'profile' ? <ProfileTab draft={draft} patch={setDraft} /> : null}
          {tab === 'general' ? <GeneralTab draft={draft} patch={setDraft} base={base} onBaseChange={onBaseChange} toast={setToast} /> : null}
          {tab === 'logs' ? <LogsTab draft={draft} patch={setDraft} /> : null}
          <div className={css.settingsSavebar}><span className={css.settingsSavebarMsg}>{dirty ? '有未保存的修改' : '已保存'}</span><ActionButton label="保存配置" primary disabled={!dirty || saving} onClick={() => void save()} /></div>
        </>}
      </div>
    </div>
  </div>
}
