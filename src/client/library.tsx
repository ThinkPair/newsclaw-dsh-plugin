/** NewsClaw local library: later, favorites and recent reading history. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkWebMonitor, createWebMonitor, fetchWebMonitorHistory, fetchWebMonitors,
  fetchContentHistory, fetchSaved, fetchSavedStatus, removeSaved, saveItem,
  sendBehaviorEvents, setWebMonitorState, stableId,
  type ContentHistoryItem, type SavedItem, type WebMonitorHistory, type WebMonitorItem,
} from './api.ts'
import { ActionButton, EmptyState, ErrorNote, MetaRow, openItem, Thumb } from './views.tsx'
import css from './panel.module.css'

type LibraryTab = 'watch_later' | 'favorite' | 'history' | 'monitoring'
type HistoryCategory = 'clicked' | 'shown' | 'removed'

const LIBRARY_TABS: Array<{ key: LibraryTab; label: string }> = [
  { key: 'watch_later', label: '稍后读' },
  { key: 'favorite', label: '收藏' },
  { key: 'history', label: '阅读记录' },
  { key: 'monitoring', label: '网页监控' },
]

const HISTORY_CATEGORIES: Array<{ key: HistoryCategory; label: string }> = [
  { key: 'clicked', label: '打开过' },
  { key: 'shown', label: '展示过' },
  { key: 'removed', label: '移除的' },
]

function articleId(item: Pick<SavedItem, 'article_id' | 'content_id' | 'item_key'>): string {
  if (item.article_id !== '') return item.article_id
  if (item.content_id !== '') return item.content_id
  return item.item_key
}

async function postSavedFeedback(base: string, item: SavedItem, feedbackType: string, note: string, eventId: string): Promise<void> {
  const id = articleId(item)
  const result = await sendBehaviorEvents(base, [{
    type: 'feedback',
    media: item.media,
    title: item.title,
    url: item.content_url,
    timestamp: Date.now(),
    metadata: {
      feedback_type: feedbackType,
      article_id: id,
      feedback_note: note,
      saved_feedback: true,
    },
    event_id: eventId,
  }])
  if (result.accepted < 1) throw new Error(result.rejected[0]?.reason || '反馈没有保存，请稍后重试。')
}

function SavedCard(props: {
  base: string
  listKind: 'favorite' | 'watch_later'
  item: SavedItem
  removing: string
  onRemove: (itemKey: string) => void
}): React.JSX.Element {
  const { base, listKind, item, removing, onRemove } = props
  const otherKind = listKind === 'favorite' ? 'watch_later' : 'favorite'
  const [otherSaved, setOtherSaved] = useState<boolean | null>(null)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const actionIds = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    setOtherSaved(null)
    setStatus('')
    void fetchSavedStatus(base, otherKind, item.item_key)
      .then(saved => { if (!cancelled) setOtherSaved(saved) })
      .catch(error => {
        if (!cancelled) {
          setOtherSaved(null)
          setStatus('另一列表状态读取失败：' + (error instanceof Error ? error.message : String(error)))
        }
      })
    return () => { cancelled = true }
  }, [base, item.item_key, otherKind])

  const toggleOther = useCallback(async () => {
    if (otherSaved === null) return
    setBusy('other')
    setStatus('')
    try {
      if (otherSaved) {
        await removeSaved(base, otherKind, item.item_key)
      } else {
        await saveItem(base, otherKind, {
          article_id: articleId(item),
          media: item.media,
          original_url: item.content_url,
          title: item.title,
          author_name: item.author_name,
          cover_url: item.cover_url,
        })
      }
      setOtherSaved(value => value === null ? null : !value)
      setStatus(otherSaved ? '已从另一列表移除。' : otherKind === 'favorite' ? '已加入收藏。' : '已加入稍后读。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }, [base, item, otherKind, otherSaved])

  const feedback = useCallback(async (kind: string, note = '') => {
    setBusy(kind)
    setStatus('')
    try {
      const key = `${kind}:${note}`
      let eventId = actionIds.current.get(key)
      if (eventId === undefined) {
        eventId = stableId()
        actionIds.current.set(key, eventId)
      }
      await postSavedFeedback(base, item, kind, note, eventId)
      actionIds.current.delete(key)
      setStatus('这条反馈已用于更新你的画像。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }, [base, item])

  const comment = useCallback(() => {
    const value = window.prompt('这条新闻为什么对你有用，或哪里不符合你的需要？')?.trim() ?? ''
    if (value !== '') void feedback('comment', value)
  }, [feedback])

  const anyBusy = removing !== '' || busy !== ''
  return (
    <div className={css.card}>
      <Thumb base={base} url={item.cover_url} title={item.title} kind="article" media={item.media} />
      <div className={css.cardBody}>
        <div className={css.cardTitle}>{item.title || item.item_key}</div>
        <MetaRow media={item.media} author={item.author_name} time={item.added_at} />
        <div className={css.cardActions}>
          <ActionButton label="打开原文" primary disabled={anyBusy || item.content_url === ''} onClick={() => {
            openItem(
              base,
              { content_id: item.content_id, article_id: articleId(item), content_url: item.content_url, media: item.media, title: item.title },
              error => { setStatus('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error))) },
            )
          }} />
          <ActionButton label="移除" danger disabled={anyBusy} onClick={() => onRemove(item.item_key)} />
        </div>
        <div className={css.savedFeedbackRow}>
          <ActionButton label="喜欢" disabled={anyBusy} onClick={() => void feedback('like')} />
          <ActionButton label="不感兴趣" disabled={anyBusy} onClick={() => void feedback('dislike')} />
          <ActionButton label="聊一聊" disabled={anyBusy} onClick={comment} />
          <ActionButton
            label={otherKind === 'favorite' ? (otherSaved ? '取消收藏' : '收藏') : (otherSaved ? '取消稍后读' : '稍后读')}
            disabled={anyBusy || otherSaved === null}
            onClick={() => void toggleOther()}
          />
        </div>
        {status !== '' ? <div className={css.feedbackStatus}>{status}</div> : null}
      </div>
    </div>
  )
}

function SavedList(props: { base: string; listKind: 'favorite' | 'watch_later' }): React.JSX.Element {
  const { base, listKind } = props
  const [items, setItems] = useState<SavedItem[] | null>(null)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try {
      setItems((await fetchSaved(base, listKind)).items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [base, listKind])

  useEffect(() => { void reload() }, [reload])

  const remove = useCallback(async (itemKey: string) => {
    setRemoving(itemKey)
    try {
      await removeSaved(base, listKind, itemKey)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRemoving('')
    }
  }, [base, listKind, reload])

  return (
    <>
      {error !== '' ? <ErrorNote text={error} /> : null}
      {items !== null && items.length === 0
        ? <EmptyState text={listKind === 'favorite' ? '还没有收藏。' : '还没有稍后读的新闻。'} />
        : null}
      {items?.map(item => (
        <SavedCard key={item.item_key} base={base} listKind={listKind} item={item} removing={removing} onRemove={key => void remove(key)} />
      ))}
    </>
  )
}

function historyLabel(context: string): string {
  if (context === 'favorite') return '收藏'
  if (context === 'watch_later') return '稍后读'
  if (context === 'dismiss' || context === 'ignore') return '不再推荐'
  if (context === 'dislike') return '不感兴趣'
  return context
}

function HistoryContextBadges({ item }: { item: ContentHistoryItem }): React.JSX.Element | null {
  const contexts = item.contexts.length > 0 ? item.contexts : item.context !== '' ? [{ context: item.context, occurred_at: item.occurred_at, restored: item.restored }] : []
  if (contexts.length === 0) return null
  return (
    <div className={css.badgeRow}>
      {contexts.map(context => (
        <span className={css.contextBadge} data-kind={context.restored ? 'restored' : undefined} key={`${context.context}:${context.occurred_at}`}>
          {historyLabel(context.context)}{context.restored ? ' · 已恢复' : ''}
        </span>
      ))}
    </div>
  )
}

function HistoryList({ base }: { base: string }): React.JSX.Element {
  const [category, setCategory] = useState<HistoryCategory>('clicked')
  const [items, setItems] = useState<ContentHistoryItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (nextCursor = '', append = false) => {
    setError('')
    try {
      const page = await fetchContentHistory(base, category, nextCursor)
      setItems(previous => append && previous !== null ? [...previous, ...page.items] : page.items)
      setTotal(page.total)
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [base, category])

  useEffect(() => { void load() }, [load])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    await load(cursor, true)
    setLoadingMore(false)
  }, [cursor, hasMore, load, loadingMore])

  return (
    <>
      <div className={css.subTabs}>
        {HISTORY_CATEGORIES.map(row => (
          <button type="button" key={row.key} className={css.subTab} data-active={category === row.key} onClick={() => setCategory(row.key)}>{row.label}</button>
        ))}
      </div>
      <div className={css.hint}>近 30 天 · 共 {total} 条</div>
      {error !== '' ? <ErrorNote text={error} /> : null}
      {items !== null && items.length === 0 ? <EmptyState text="这个分类还没有记录。" /> : null}
      {items?.map(item => (
        <div className={css.card} key={`${item.item_key}:${item.occurred_at}`}>
          <Thumb base={base} url={item.cover_url} title={item.title} kind="article" media={item.media} />
          <div className={css.cardBody}>
            <div className={css.cardTitle}>{item.title || item.body_text.slice(0, 60) || item.item_key}</div>
            <MetaRow media={item.media} author={item.author_name} time={item.occurred_at} />
            <HistoryContextBadges item={item} />
            <div className={css.cardActions}>
              <ActionButton label="打开原文" primary disabled={item.content_url === ''} onClick={() => {
                openItem(
                  base,
                  {
                    recommendation_id: item.recommendation_id ?? undefined,
                    content_id: item.content_id,
                    article_id: item.content_id !== '' ? item.content_id : item.item_key,
                    content_url: item.content_url,
                    media: item.media,
                    title: item.title,
                  },
                  cause => { setError('原文已打开，但阅读记录未确认保存：' + (cause instanceof Error ? cause.message : String(cause))) },
                )
              }} />
            </div>
          </div>
        </div>
      ))}
      {hasMore ? <button type="button" className={css.loadMore} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? '加载中…' : '加载更多'}</button> : null}
    </>
  )
}

function monitorStatus(status: string): string {
  if (status === 'active') return '监控中'
  if (status === 'paused') return '已暂停'
  if (status === 'retry_wait') return '等待重试'
  if (status === 'needs_attention') return '需要处理'
  return status || '状态未知'
}

function shortTime(value: string): string {
  if (value === '') return '尚未检查'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function MonitorHistoryFold({ history }: { history: WebMonitorHistory }): React.JSX.Element {
  const meaningful = history.diffs.filter(item => item.classification === 'meaningful').slice(0, 3)
  const totalVersions = Math.max(history.monitor.current_version, history.versions.length)
  return (
    <div className={css.monitorHistory}>
      <div className={css.monitorHistoryHead}>已留存 {totalVersions} 个版本</div>
      {meaningful.length === 0
        ? <div className={css.monitorQuiet}>还没有确认的正文变化。</div>
        : meaningful.map(item => (
          <div className={css.monitorDiff} key={item.diff_id}>
            <span>{item.summary || '正文发生变化'}</span>
            <time>{shortTime(item.created_at)}</time>
          </div>
        ))}
    </div>
  )
}

function WebMonitoringView({ base }: { base: string }): React.JSX.Element {
  const [items, setItems] = useState<WebMonitorItem[] | null>(null)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState('')
  const [history, setHistory] = useState<Record<string, WebMonitorHistory>>({})
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({})
  const actionIds = useRef(new Map<string, string>())
  const reloadGeneration = useRef(0)
  const busyIdsRef = useRef<Set<string>>(new Set())
  const expandedRef = useRef('')
  const historySignatures = useRef(new Map<string, string>())
  const historyLoadGenerations = useRef(new Map<string, number>())
  expandedRef.current = expanded

  const setMonitorBusy = useCallback((monitorId: string, value: boolean) => {
    const next = new Set(busyIdsRef.current)
    if (value) next.add(monitorId)
    else next.delete(monitorId)
    busyIdsRef.current = next
    setBusyIds(next)
  }, [])

  const reload = useCallback(async () => {
    const generation = ++reloadGeneration.current
    setError('')
    try {
      const next = await fetchWebMonitors(base)
      if (generation === reloadGeneration.current) setItems(next)
    } catch (cause) {
      if (generation === reloadGeneration.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [base])

  useEffect(() => {
    void reload()
    const interval = window.setInterval(() => { void reload() }, 30_000)
    return () => {
      window.clearInterval(interval)
      reloadGeneration.current += 1
    }
  }, [reload])

  const add = useCallback(async () => {
    const target = url.trim()
    if (target === '' || adding) return
    setAdding(true)
    setError('')
    setStatus('正在读取正文并建立首个基线…')
    try {
      const created = await createWebMonitor(base, { url: target, label: label.trim(), requestId: stableId() })
      setUrl('')
      setLabel('')
      if (created.initialCheckStatus === 'baseline' || created.item.has_baseline) {
        setStatus('已建立基线；以后只有正文发生真实变化才会提醒。')
      } else {
        setStatus('监控已保存，但首次读取没有建立基线；可在列表中查看原因并重新检查。')
      }
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally { setAdding(false) }
  }, [adding, base, label, reload, url])

  const act = useCallback(async (item: WebMonitorItem, action: 'check' | 'pause' | 'resume' | 'remove') => {
    if (busyIdsRef.current.has(item.monitor_id)) return
    if (action === 'remove' && !window.confirm(`移除“${item.label || item.display_url}”的监控？历史版本不会删除。`)) return
    const key = `${item.monitor_id}:${action}`
    let requestId = actionIds.current.get(key)
    if (requestId === undefined) {
      requestId = stableId()
      actionIds.current.set(key, requestId)
    }
    setMonitorBusy(item.monitor_id, true)
    setError('')
    setStatus(action === 'check' ? '正在检查正文变化…' : '')
    try {
      const checkResult = action === 'check'
        ? await checkWebMonitor(base, item.monitor_id, requestId)
        : null
      if (action !== 'check') await setWebMonitorState(base, item.monitor_id, action)
      actionIds.current.delete(key)
      const historyWasOpen = expandedRef.current === item.monitor_id
      if (action === 'check' && historyWasOpen) {
        setHistory(previous => {
          const next = { ...previous }
          delete next[item.monitor_id]
          return next
        })
        setHistoryErrors(previous => {
          const next = { ...previous }
          delete next[item.monitor_id]
          return next
        })
      }
      await reload()
      if (action === 'check' && historyWasOpen) {
        try {
          const refreshed = await fetchWebMonitorHistory(base, item.monitor_id)
          historySignatures.current.set(
            item.monitor_id,
            `${refreshed.monitor.current_version}:${refreshed.monitor.change_count}`,
          )
          setHistory(previous => ({ ...previous, [item.monitor_id]: refreshed }))
          setHistoryErrors(previous => {
            const next = { ...previous }
            delete next[item.monitor_id]
            return next
          })
        } catch (historyError) {
          const message = historyError instanceof Error ? historyError.message : String(historyError)
          setHistoryErrors(previous => ({ ...previous, [item.monitor_id]: message }))
          setError('检查已完成，但版本列表刷新失败：' + message)
        }
      }
      if (action === 'check') {
        const checkStatus = checkResult?.status ?? ''
        if (checkStatus === 'changed') setStatus('发现正文变化，已写入事件档案和消息。')
        else if (checkStatus === 'baseline') setStatus('已建立正文基线。')
        else if (checkStatus === 'unchanged' || checkStatus === 'noise_only') setStatus('检查完成，正文没有确认变化。')
        else if (checkStatus === 'retry_wait') {
          setStatus('本次读取失败，系统会自动重试。')
          setError(checkResult?.error || '本次读取失败，系统会自动重试。')
        } else if (checkStatus === 'failed') {
          setStatus('本次检查失败，需要处理。')
          setError(checkResult?.error || '本次检查失败，需要处理。')
        } else if (checkStatus === 'cancelled') setStatus('本次检查已取消。')
        else {
          setStatus('')
          setError('检查结果状态未知，请刷新后查看。')
        }
      } else setStatus('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally { setMonitorBusy(item.monitor_id, false) }
  }, [base, history, reload, setMonitorBusy])

  const toggleHistory = useCallback(async (item: WebMonitorItem, force = false) => {
    const monitorId = item.monitor_id
    if (busyIdsRef.current.has(monitorId)) return
    if (expandedRef.current === monitorId && !force) {
      const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1
      historyLoadGenerations.current.set(monitorId, generation)
      expandedRef.current = ''
      setExpanded('')
      return
    }
    expandedRef.current = monitorId
    setExpanded(monitorId)
    const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1
    historyLoadGenerations.current.set(monitorId, generation)
    historySignatures.current.delete(monitorId)
    setHistory(previous => {
      const next = { ...previous }
      delete next[monitorId]
      return next
    })
    setHistoryErrors(previous => {
      const next = { ...previous }
      delete next[monitorId]
      return next
    })
    setMonitorBusy(monitorId, true)
    try {
      const value = await fetchWebMonitorHistory(base, monitorId)
      if (historyLoadGenerations.current.get(monitorId) !== generation) return
      historySignatures.current.set(
        monitorId,
        `${value.monitor.current_version}:${value.monitor.change_count}`,
      )
      setHistory(previous => ({ ...previous, [monitorId]: value }))
    } catch (cause) {
      if (historyLoadGenerations.current.get(monitorId) !== generation) return
      setHistoryErrors(previous => ({
        ...previous,
        [monitorId]: cause instanceof Error ? cause.message : String(cause),
      }))
    } finally {
      setMonitorBusy(monitorId, false)
    }
  }, [base, setMonitorBusy])

  useEffect(() => {
    if (expanded === '' || items === null || busyIds.has(expanded)) return
    const item = items.find(row => row.monitor_id === expanded)
    const cached = history[expanded]
    if (item === undefined || cached === undefined) return
    if (
      item.current_version > cached.monitor.current_version
      || item.change_count > cached.monitor.change_count
    ) {
      void toggleHistory(item, true)
    }
  }, [busyIds, expanded, history, items, toggleHistory])

  const totalChanges = items?.reduce((sum, item) => sum + item.change_count, 0) ?? 0
  const attention = items?.filter(item => item.status === 'needs_attention' || item.status === 'retry_wait').length ?? 0
  return (
    <div className={css.monitoring}>
      <div className={css.monitorIntro}>
        <strong>盯住变化，不重复读整篇</strong>
        <span>添加公开网页或 PDF；首轮只建基线，之后正文真变了才进入事件档案。</span>
      </div>
      <div className={css.monitorForm}>
        <input aria-label="网页或 PDF 地址" placeholder="粘贴公开网页或 PDF 地址" value={url} onChange={event => setUrl(event.currentTarget.value)} />
        <input aria-label="监控名称" placeholder="名称（可不填）" value={label} onChange={event => setLabel(event.currentTarget.value)} />
        <button type="button" disabled={adding || url.trim() === ''} onClick={() => void add()}>{adding ? '建立中…' : '开始监控'}</button>
      </div>
      <div className={css.monitorStats}>
        {items === null
          ? <span>记录尚未载入</span>
          : <><span>{items.length} 个监控</span><span>{totalChanges} 次确认变化</span><span>{attention} 个待处理</span></>}
        <button type="button" disabled={adding} onClick={() => void reload()}>刷新</button>
      </div>
      {status !== '' ? <div className={css.monitorQuiet}>{status}</div> : null}
      {error !== '' ? <ErrorNote text={error} /> : null}
      {items !== null && items.length === 0 ? <EmptyState text="还没有网页监控。先添加一个经常更新的政策页、公告页或 PDF。" /> : null}
      {items?.map(item => {
        const itemBusy = busyIds.has(item.monitor_id)
        const folded = history[item.monitor_id]
        const historyError = historyErrors[item.monitor_id] ?? ''
        return (
          <div className={css.monitorCard} key={item.monitor_id} data-status={item.status}>
            <div className={css.monitorTop}>
              <span className={css.monitorState}>{monitorStatus(item.status)}</span>
              <span className={css.monitorMetrics}>V{item.current_version || '—'} · {item.change_count} 次变化</span>
            </div>
            <div className={css.monitorTitle}>{item.label || item.display_url}</div>
            <div className={css.monitorUrl}>{item.display_url}</div>
            <div className={css.monitorMeta}>上次成功：{shortTime(item.last_success_at)} · 下次：{shortTime(item.next_check_at)}</div>
            {item.last_error !== '' ? <div className={css.monitorError}>{item.last_error}</div> : null}
            <div className={css.monitorActions}>
              <button type="button" disabled={itemBusy || item.status === 'paused'} onClick={() => void act(item, 'check')}>立即检查</button>
              <button type="button" disabled={itemBusy} onClick={() => void act(item, item.status === 'paused' ? 'resume' : 'pause')}>{item.status === 'paused' ? '继续' : '暂停'}</button>
              <button type="button" disabled={itemBusy} onClick={() => void toggleHistory(item)}>{expanded === item.monitor_id ? '收起版本' : '版本记录'}</button>
              <button type="button" disabled={itemBusy} onClick={() => void act(item, 'remove')}>移除</button>
            </div>
            {expanded === item.monitor_id
              ? folded !== undefined
                ? <MonitorHistoryFold history={folded} />
                : historyError !== ''
                  ? <div className={css.monitorHistoryError}><span>{historyError}</span><button type="button" onClick={() => void toggleHistory(item, true)}>重新读取</button></div>
                  : <div className={css.monitorQuiet}>正在读取版本…</div>
              : null}
          </div>
        )
      })}
    </div>
  )
}

export function LibraryView({ base }: { base: string }): React.JSX.Element {
  const [tab, setTab] = useState<LibraryTab>('watch_later')
  return (
    <>
      <div className={css.subTabs}>
        {LIBRARY_TABS.map(row => (
          <button type="button" key={row.key} className={css.subTab} data-active={tab === row.key} onClick={() => setTab(row.key)}>{row.label}</button>
        ))}
      </div>
      {tab === 'watch_later' ? <SavedList key={`later-${base}`} base={base} listKind="watch_later" /> : null}
      {tab === 'favorite' ? <SavedList key={`favorite-${base}`} base={base} listKind="favorite" /> : null}
      {tab === 'history' ? <HistoryList key={`history-${base}`} base={base} /> : null}
      {tab === 'monitoring' ? <WebMonitoringView key={`monitoring-${base}`} base={base} /> : null}
    </>
  )
}
