/**
 * Shared card pieces plus the 推荐 (recommend) view — mirroring the canonical
 * NewsClaw surfaces (mobile web + extension popup): header card with
 * 换一批, pool status chips, spotlight banner, recommendation cards with the
 * full action set (打开原文/喜欢/稍后读/收藏/不感兴趣/评论), and the
 * expandable activity footer.
 * @module @newsclaw/dsh-plugin
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendRecommendations, fetchActivityFeed, fetchNewsBootstrapStatus, fetchSpotlightBatch, fetchRuntimeStatus, fetchSavedStatus,
  fetchRecommendations, removeSaved, reportClick, reshuffleRecommendations, respondToSpotlight, saveItem,
  imageProxyCrossOrigin, imageProxyUrl, readApiBase, stableId, submitFeedback,
  type ActivityItem, type SpotlightItem, type RecommendationItem,
  type NewsBootstrapStatus, type RuntimeStatus,
} from './api.ts'
import { ClockIcon, StarIcon } from './icons.tsx'
import css from './panel.module.css'

/** Canonical media display names for provider codes. */
export function mediaLabel(media: string): string {
  const key = media.trim().toLowerCase()
  const labels: Record<string, string> = {
    cls: '财联社', yicai: '第一财经', eastmoney: '东方财富', '10jqka': '同花顺',
    wallstreetcn: '华尔街见闻', sina: '新浪财经', cctv: '央视新闻',
    xinhua: '新华网', caixin: '财新网', cs: '中证网', rss: 'RSS',
  }
  return labels[key] ?? (media || '未知媒体')
}

/** Format a raw count into a compact display number. */
export function formatCount(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/**
 * Normalize a news card's identity and URLs for the local saved-list payload.
 * URLs must be absolute HTTP(S); protocol-relative cover URLs are promoted to
 * `https:` and malformed values are dropped.
 */
function normalizeSaveIdentity(item: {
  article_id: string
  item_key: string
  content_url: string
  cover_url: string
}): { article_id: string; original_url: string; cover_url: string } {
  const asAbsoluteUrl = (url: string, promoteProtocolRelative: boolean): string => {
    if (/^https?:\/\//i.test(url)) return url
    if (promoteProtocolRelative && /^\/\//.test(url)) return `https:${url}`
    return ''
  }
  const fallback = item.article_id !== '' ? item.article_id : item.item_key
  return {
    article_id: fallback,
    original_url: asAbsoluteUrl(item.content_url, false),
    cover_url: asAbsoluteUrl(item.cover_url, true),
  }
}

/** Image with the shared backend proxy and a deterministic local fallback. */
function CoverImage(props: {
  base: string
  url: string
  className?: string
  alt?: string
  loading?: 'lazy' | 'eager'
  fallback: React.ReactNode
  onError?: () => void
}): React.JSX.Element {
  const src = imageProxyUrl(props.base, props.url)
  const [failedSource, setFailedSource] = useState('')
  if (src === '' || failedSource === src) return <>{props.fallback}</>
  return (
    <img
      className={props.className}
      src={src}
      alt={props.alt ?? ''}
      loading={props.loading ?? 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      crossOrigin={imageProxyCrossOrigin(props.base)}
      onError={() => {
        setFailedSource(src)
        props.onError?.()
      }}
    />
  )
}

/** Small cover thumbnail with an optional media corner label. */
export function Thumb(props: { base?: string; url: string; title: string; kind?: string; media?: string }) {
  const base = props.base ?? readApiBase()
  const media = (
    props.url !== ''
      ? <CoverImage base={base} url={props.url} className={css.thumb} fallback={<div className={css.thumbFallback}>📰</div>} />
      : <div className={css.thumbFallback}>📰</div>
  )
  if (props.media !== undefined && props.media !== '') {
    return (
      <div className={css.coverWrap}>
        {media}
        <span className={css.coverCorner}>{mediaLabel(props.media)}</span>
      </div>
    )
  }
  return media
}

/** Media tag + publisher/time meta row. */
export function MetaRow(props: { media: string; author?: string; time?: string }) {
  const parts: Array<React.ReactNode> = []
  if (props.media !== '') parts.push(<span key="m">{mediaLabel(props.media)}</span>)
  if (props.author !== undefined && props.author !== '') parts.push(<span key="a">{props.author}</span>)
  if (props.time !== undefined && props.time !== '') parts.push(<span key="t">{formatTime(props.time)}</span>)
  if (parts.length === 0) return null
  return <div className={css.cardMeta}>{parts}</div>
}

/** Compact timestamp formatter. */
export function formatTime(iso: string): string {
  if (iso === '') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Small action button. */
export function ActionButton(props: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={css.actionButton}
      data-primary={props.primary === true || undefined}
      data-danger={props.danger === true || undefined}
      disabled={props.disabled === true}
      title={props.title}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

/** Empty state line. */
export function EmptyState(props: { text: string }) {
  return <div className={css.empty}>{props.text}</div>
}

/** Error note. */
export function ErrorNote(props: { text: string }) {
  return <div className={css.error}>{props.text}</div>
}

/** Stable idempotency key per (item identity × action): reuse on retries only. */
export function useActionId(identity: string, action: string): string {
  const ref = useRef<Map<string, string>>(new Map())
  const key = `${identity}::${action}`
  let id = ref.current.get(key)
  if (id === undefined) {
    id = stableId()
    ref.current.set(key, id)
  }
  return id
}

/** Pending click ids survive an ambiguous timeout, so a user's retry is idempotent. */
const pendingClickIds = new Map<string, string>()

/** Open a content URL immediately, then report whether the weak open signal persisted. */
export function openItem(
  base: string,
  item: { recommendation_id?: number; content_id: string; article_id: string; content_url: string; media: string; title: string },
  onPersistError?: (error: unknown) => void,
): void {
  const url = item.content_url
  if (url === '') return
  const identity = `${item.recommendation_id ?? ''}:${item.article_id || item.content_id}:${url}`
  const requestId = pendingClickIds.get(identity) ?? stableId()
  pendingClickIds.set(identity, requestId)
  void reportClick(base, {
    recommendation_id: item.recommendation_id,
    article_id: item.article_id !== '' ? item.article_id : item.content_id,
    content_url: item.content_url,
    media: item.media,
    title: item.title,
    request_id: requestId,
  }).then(() => {
    if (pendingClickIds.get(identity) === requestId) pendingClickIds.delete(identity)
  }).catch(error => {
    // Reading the original article remains available during degradation, but
    // the user must know that this learning signal was not confirmed.
    onPersistError?.(error)
  })
  window.open(url, '_blank', 'noopener')
}

/** Pool status chips, mirroring the popup's getPoolStatusSummary language. */
function poolStatus(status: RuntimeStatus | null): Array<{ label: string; value: string }> {
  if (status === null) return []
  const available = status.pool_available_count
  const replenished = typeof status.last_replenished_count === 'number' ? status.last_replenished_count : 0
  const pending = status.pool_pending_count
  return [
    { label: '候选池', value: `${available} 条可推荐` },
    { label: '处理中', value: `${pending} 条` },
    { label: '本轮新增', value: `${replenished} 条` },
  ]
}

// ── recommendation card ────────────────────────────────────────────────

interface RecCardProps {
  base: string
  item: RecommendationItem
  /** Only explicit hiding (移除) removes the card; positive actions keep it. */
  onDismissed: (id: number) => void
  onError: (text: string) => void
}

/** One recommendation card (canonical action set incl. comment composer). */
function RecommendationCard({ base, item, onDismissed, onError }: RecCardProps): React.JSX.Element {
  const likeId = useActionId(String(item.id), 'like')
  const dislikeId = useActionId(String(item.id), 'dislike')
  const dismissId = useActionId(String(item.id), 'dismiss')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info')
  const [comment, setComment] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [saved, setSaved] = useState<{ favorite: boolean; watch_later: boolean } | null>(null)
  const commentIds = useRef(new Map<string, string>())

  // Saved toggle state for this card.
  useEffect(() => {
    let cancelled = false
    const key = item.item_key !== '' ? item.item_key : item.article_id
    if (key === '') return
    setSaved(null)
    void Promise.all([
      fetchSavedStatus(base, 'favorite', key),
      fetchSavedStatus(base, 'watch_later', key),
    ]).then(([favorite, watch_later]) => {
      if (!cancelled) setSaved({ favorite, watch_later })
    }).catch(err => {
      if (!cancelled) {
        setSaved(null)
        setStatus('收藏状态读取失败：' + (err instanceof Error ? err.message : String(err)))
        setStatusTone('error')
      }
    })
    return () => { cancelled = true }
  }, [base, item.item_key, item.article_id])

  const act = useCallback(async (action: string, run: () => Promise<void>, done = '', doneTone: 'info' | 'success' | 'error' = 'info') => {
    setBusy(action)
    setStatus('提交中…')
    setStatusTone('info')
    try {
      await run()
      setStatus(done)
      setStatusTone(doneTone)
    } catch (err) {
      setStatus('没记上：' + (err instanceof Error ? err.message : String(err)))
      setStatusTone('error')
    } finally {
      setBusy(null)
    }
  }, [])

  const feedback = (type: string, requestId: string, done: string): Promise<void> => (
    submitFeedback(base, { recommendation_id: item.id, feedback_type: type, request_id: requestId }).then(() => {
      setStatus(done)
    })
  )
  const toggleSave = (listKind: 'favorite' | 'watch_later'): Promise<void> => {
    const key = item.item_key !== '' ? item.item_key : item.article_id
    const currently = saved?.[listKind] === true
    const run = async () => {
      if (currently) await removeSaved(base, listKind, key)
      else {
        await saveItem(base, listKind, {
          media: item.media,
          ...normalizeSaveIdentity(item),
          title: item.title,
          author_name: item.publisher_name,
        })
      }
      setSaved(prev => prev === null ? prev : ({ ...prev, [listKind]: !currently }))
    }
    return run()
  }

  const submitComment = (): void => {
    const note = comment.trim()
    if (note === '') return
    let commentId = commentIds.current.get(note)
    if (commentId === undefined) {
      commentId = stableId()
      commentIds.current.set(note, commentId)
    }
    void act('comment', async () => {
      await submitFeedback(base, { recommendation_id: item.id, feedback_type: 'comment', note, request_id: commentId })
      commentIds.current.delete(note)
      setComment('')
    }, '评论已记下。', 'success')
  }

  const anyBusy = busy !== null
  const key = item.item_key !== '' ? item.item_key : item.article_id
  const isText = item.cover_url === ''

  const open = (): void => {
    openItem(base, {
      recommendation_id: item.id,
      content_id: item.content_id,
      article_id: item.article_id,
      content_url: item.content_url,
      media: item.media,
      title: item.title,
    }, err => {
      setStatus('原文已打开，但阅读记录未确认保存：' + (err instanceof Error ? err.message : String(err)))
      setStatusTone('error')
    })
  }

  return (
    <div className={css.recCard}>
      {/* Popup-style 16:9 cover (whole cover clickable), text-card fallback. */}
      <button type="button" className={css.recCover} onClick={open} aria-label={item.title}>
        {!isText && item.cover_url !== ''
          ? <CoverImage
              base={base}
              url={item.cover_url}
              fallback={<span className={css.recCoverText}>{item.title || item.body_text || '封面暂时加载失败'}</span>}
            />
          : <span className={css.recCoverText}>{isText && item.body_text !== '' ? item.body_text : item.title}</span>}
        <span className={css.coverCorner}>{mediaLabel(item.media)}</span>
      </button>
      <div className={css.recBody}>
        <div className={css.badgeRow}>
          {item.topic_label !== '' ? <span className={css.topicBadge}>{item.topic_label}</span> : null}
          <span className={css.stateBadge}>{item.body_level === 'title' ? '标题级信息' : item.presented ? '已展示' : '新抓到'}</span>
        </div>
        <div className={css.recTitle}>{item.title !== '' ? item.title : (item.body_text !== '' ? item.body_text.slice(0,80) : item.article_id)}</div>
        {item.why_for_you !== '' ? <div className={css.expression}>为什么适合你：{item.why_for_you}</div> : null}
        {item.impact_chain.length > 0 ? <div className={css.expression}>可能影响链：{item.impact_chain.join(' → ')}</div> : null}
        {item.observation_points.length > 0 ? <div className={css.expression}>后续观察：{item.observation_points.join('；')}</div> : null}
        <MetaRow media={item.media} author={item.publisher_name || item.technical_provider} time={item.published_label || item.published_at} />
        <div className={css.cardActions}>
          <ActionButton label="打开原文" primary disabled={anyBusy || item.original_url === ''} onClick={open} />
          <ActionButton label="喜欢" disabled={anyBusy} onClick={() => void act('like', () => feedback('like', likeId, '记下了，这类新闻可以多来点。'), '记下了，这类新闻可以多来点。', 'success')} />
          <button
            type="button"
            className={`${css.savedToggle} ${css.watchToggle}`}
            data-pressed={saved?.watch_later === true}
            aria-pressed={saved?.watch_later === true}
            title="稍后读"
            disabled={anyBusy || saved === null}
            onClick={() => void act('watch_later', () => toggleSave('watch_later'))}
          >
            <ClockIcon size={14} />
          </button>
          <button
            type="button"
            className={`${css.savedToggle} ${css.starToggle}`}
            data-pressed={saved?.favorite === true}
            aria-pressed={saved?.favorite === true}
            title="收藏"
            disabled={anyBusy || saved === null}
            onClick={() => void act('favorite', () => toggleSave('favorite'))}
          >
            <StarIcon size={14} />
          </button>
          <ActionButton label="不感兴趣" danger disabled={anyBusy} onClick={() => void act('dislike', () => feedback('dislike', dislikeId, '记下了，这类新闻先少来点。'), '记下了，这类新闻先少来点。', 'success')} />
          <ActionButton label="忽略" disabled={anyBusy} onClick={() => void act('ignore', () => feedback('ignore', dismissId, '已移出推荐。').then(() => { onDismissed(item.id) }), '已移出推荐。', 'success')} />
          <ActionButton label={composerOpen ? '收起' : '说说原因'} disabled={anyBusy} onClick={() => setComposerOpen(open => !open)} />
        </div>
        {composerOpen ? (
          <div className={css.commentComposer}>
            <textarea
              rows={3}
              placeholder="写一句为什么这条新闻对你有用，或哪里不符合需要"
              value={comment}
              disabled={anyBusy}
              onChange={event => setComment(event.target.value)}
            />
            <ActionButton label="发送" primary disabled={anyBusy || comment.trim() === ''} onClick={submitComment} />
          </div>
        ) : null}
        {status !== '' ? <div className={css.feedbackStatus} data-tone={statusTone}>{status}</div> : null}
      </div>
      <span style={{ display: 'none' }}>{key}</span>
    </div>
  )
}

/** Spotlight banner — popup structure: collapsed row (16:9 thumb + kicker pills
 *  + clamped title + chevron) with a right-edge × column; clicking the row
 *  expands the body (reason + actions + chat composer). */
function SpotlightBanner(props: { base: string; onError: (text: string) => void }): React.JSX.Element | null {
  const { base, onError } = props
  const [queue, setQueue] = useState<SpotlightItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatStatus, setChatStatus] = useState('')
  const [busy, setBusy] = useState('')
  const [reaction, setReaction] = useState<{ kind: string; text: string } | null>(null)
  const [saved, setSaved] = useState<{ favorite: boolean; watch_later: boolean } | null>(null)
  const [failedCoverKey, setFailedCoverKey] = useState('')
  const actionIds = useRef(new Map<string, string>())
  const reload = useCallback(async () => {
    try {
      const items = await fetchSpotlightBatch(base)
      setQueue(items)
      setIndex(0)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }, [base, onError])

  useEffect(() => { void reload() }, [reload])

  const item = queue === null ? null : queue[Math.min(index, queue.length - 1)]

  // Saved toggle state for the current spotlight.
  useEffect(() => {
    let cancelled = false
    if (item === undefined || item === null) return
    const key = item.item_key !== '' ? item.item_key : item.article_id
    if (key === '') return
    setSaved(null)
    void Promise.all([
      fetchSavedStatus(base, 'favorite', key),
      fetchSavedStatus(base, 'watch_later', key),
    ]).then(([favorite, watch_later]) => {
      if (!cancelled) setSaved({ favorite, watch_later })
    }).catch(err => {
      if (!cancelled) {
        setSaved(null)
        onError('收藏状态读取失败：' + (err instanceof Error ? err.message : String(err)))
      }
    })
    return () => { cancelled = true }
  }, [base, item])

  const respond = useCallback(async (target: SpotlightItem, response: string, message = '') => {
    setBusy(response)
    try {
      const key = `${target.article_id}:${response}:${message}`
      let request_id = actionIds.current.get(key)
      if (request_id === undefined) {
        request_id = stableId()
        actionIds.current.set(key, request_id)
      }
      await respondToSpotlight(base, { article_id: target.article_id, response, title: target.title, message, request_id })
      if (response === 'ignore') {
        setQueue(prev => (prev ?? []).filter(candidate => candidate.article_id !== target.article_id))
        setExpanded(false)
      } else if (response === 'like') {
        setReaction({ kind: 'like', text: '已记下，这类惊喜多来点。' })
      } else if (response === 'dislike') {
        setReaction({ kind: 'dislike', text: '记下了，这类惊喜先少来点。' })
      } else if (response === 'open') {
        setReaction({ kind: 'open', text: '已记录打开。' })
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, onError])

  const toggleSave = useCallback(async (listKind: 'favorite' | 'watch_later') => {
    if (item === undefined || item === null) return
    const key = item.item_key !== '' ? item.item_key : item.article_id
    const currently = saved?.[listKind] === true
    setBusy(listKind)
    try {
      if (currently) await removeSaved(base, listKind, key)
      else {
        await saveItem(base, listKind, {
          media: item.media,
          ...normalizeSaveIdentity(item),
          title: item.title,
        })
      }
      setSaved(prev => prev === null ? prev : ({ ...prev, [listKind]: !currently }))
      setReaction({ kind: listKind, text: currently ? '已从列表移除。' : (listKind === 'favorite' ? '已收藏。' : '已加入稍后读。') })
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, item, onError, saved])

  const sendChat = useCallback(async () => {
    if (item === undefined || item === null) return
    const message = chatDraft.trim()
    if (message === '') return
    setBusy('chat')
    setChatStatus('')
    try {
      const key = `${item.article_id}:chat:${message}`
      let request_id = actionIds.current.get(key)
      if (request_id === undefined) {
        request_id = stableId()
        actionIds.current.set(key, request_id)
      }
      await respondToSpotlight(base, { article_id: item.article_id, response: 'chat', title: item.title, message, request_id })
      actionIds.current.delete(key)
      setChatDraft('')
      setChatStatus('已转达给新闻爪，它会继续追问和学习。')
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, chatDraft, item, onError])

  if (queue === null) return null
  if (queue.length === 0) return null
  if (item === undefined || item === null) return null
  const anyBusy = busy !== ''
  const isText = item.cover_url === ''
  const coverKey = `${item.item_key}:${item.article_id}:${item.cover_url}`
  const coverFailed = failedCoverKey === coverKey

  const open = (): void => {
    // `view` only marks the spotlight card seen; openItem records the single
    // weak article-open learning signal. Using `open` here as well would
    // double-count the click under two request ids.
    void respond(item, 'view')
    openItem(base, {
      recommendation_id: undefined,
      content_id: item.content_id !== '' ? item.content_id : item.article_id,
      article_id: item.article_id,
      content_url: item.content_url,
      media: item.media,
      title: item.title,
    }, err => {
      onError('原文已打开，但阅读记录未确认保存：' + (err instanceof Error ? err.message : String(err)))
    })
  }

  return (
    <div className={css.spotlightCard} data-expanded={expanded}>
      <div className={css.spotlightHeader}>
        <span className={css.spotlightKicker}>✨ 惊喜推荐</span>
        <span className={css.spotlightMedia}>{mediaLabel(item.media)}</span>
        <span className={css.spacer} />
        {queue.length > 1 ? (
          <>
            <button type="button" className={css.spotlightNav} title="上一条" disabled={index <= 0 || anyBusy} onClick={() => { setIndex(i => Math.max(0, i - 1)); setReaction(null) }}>‹</button>
            <span className={css.spotlightCounter}>{index + 1}/{queue.length}</span>
            <button type="button" className={css.spotlightNav} title="下一条" disabled={index >= queue.length - 1 || anyBusy} onClick={() => { setIndex(i => Math.min(queue.length - 1, i + 1)); setReaction(null) }}>›</button>
          </>
        ) : null}
        <button type="button" className={css.spotlightDismiss} title="忽略并不再推荐" disabled={anyBusy} onClick={() => void respond(item, 'ignore')}>×</button>
      </div>
      <button type="button" className={css.spotlightMain} onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
        <span className={css.spotlightCover}>
          {item.cover_url !== ''
            ? <CoverImage
                base={base}
                url={item.cover_url}
                className={css.spotlightHero}
                fallback={<span className={css.spotlightHeroFallback}>{isText && item.body_text !== '' ? item.body_text.slice(0, 120) : '✨'}</span>}
                onError={() => setFailedCoverKey(coverKey)}
              />
            : <span className={css.spotlightHeroFallback}>{isText && item.body_text !== '' ? item.body_text.slice(0, 120) : '✨'}</span>}
          <span className={css.spotlightCoverScrim} aria-hidden="true" />
          {!coverFailed && item.cover_url !== '' && item.spotlight_score > 0 ? (
            <span className={css.spotlightScorePill}>💗 {Math.round(item.spotlight_score * 100)}% 匹配</span>
          ) : null}
        </span>
        <span className={css.spotlightTitleWrap}>
          <span className={css.spotlightTitle}>{item.title !== '' ? item.title : (item.body_text !== '' ? item.body_text.slice(0, 80) : item.article_id)}</span>
          <span className={css.spotlightChevron} aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      {expanded ? (
        <div className={css.spotlightBody}>
          {item.spotlight_reason !== '' ? (
            <div className={css.spotlightReason}>
              <span className={css.spotlightScore}>{Math.round(item.spotlight_score * 100)}%</span> · {item.spotlight_reason}
            </div>
          ) : null}
          {item.body_level === 'title' ? <div className={css.hint}>标题级信息</div> : null}
          {item.impact_chain.length > 0 ? <div className={css.expression}>可能影响链：{item.impact_chain.join(' → ')}</div> : null}
          {item.observation_points.length > 0 ? <div className={css.expression}>后续观察：{item.observation_points.join('；')}</div> : null}
          <div className={css.spotlightActions}>
            <ActionButton label="打开原文" primary disabled={anyBusy || item.original_url === ''} onClick={open} />
            <ActionButton label={reaction?.kind === 'like' ? '已喜欢' : '喜欢'} primary={reaction?.kind === 'like'} disabled={anyBusy || reaction?.kind === 'like'} onClick={() => void respond(item, 'like')} />
            <ActionButton label={saved?.watch_later === true ? '已稍后读' : '稍后读'} disabled={anyBusy || saved === null} onClick={() => void toggleSave('watch_later')} />
            <ActionButton label={saved?.favorite === true ? '已收藏' : '收藏'} disabled={anyBusy || saved === null} onClick={() => void toggleSave('favorite')} />
            <ActionButton label="不感兴趣" danger disabled={anyBusy} onClick={() => void respond(item, 'dislike')} />
            <ActionButton label={composerOpen ? '收起' : '聊一聊'} disabled={anyBusy} onClick={() => setComposerOpen(v => !v)} />
          </div>
          {composerOpen ? (
            <div className={css.spotlightComposer}>
              <textarea
                className={css.chatInput}
                rows={2}
                placeholder="说说你为什么想点开，或者哪里还拿不准"
                value={chatDraft}
                disabled={anyBusy}
                onChange={event => setChatDraft(event.target.value)}
              />
              <button type="button" className={css.chatSend} disabled={anyBusy || chatDraft.trim() === ''} onClick={() => void sendChat()}>发送</button>
            </div>
          ) : null}
          {chatStatus !== '' ? <div className={css.feedbackStatus}>{chatStatus}</div> : null}
          {reaction !== null ? (
            <div className={css.feedbackStatus} data-tone={reaction.kind === 'dislike' ? 'error' : 'success'}>{reaction.text}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ── activity footer ────────────────────────────────────────────────────

/** Activity footer — popup-style: collapsed line (summary + headline) with a
 *  更多/收起 toggle; expanded rows are footer-item cards with a kind pill,
 *  time and summary, plus a dashed load-more button. */
export function ActivityFooter(props: { base: string }): React.JSX.Element | null {
  const { base } = props
  const [feed, setFeed] = useState<{ items: ActivityItem[]; liveSummary: string; headline: string; hasMore: boolean; nextCursor: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try {
      setFeed(await fetchActivityFeed(base, { limit: 5 }))
    } catch (err) {
      setFeed(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [base])

  useEffect(() => { void reload() }, [reload])

  const loadMore = useCallback(async () => {
    if (feed === null || !feed.hasMore || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const next = await fetchActivityFeed(base, { limit: 5, before: feed.nextCursor })
      setFeed(prev => prev === null ? next : {
        ...next,
        items: [...prev.items, ...next.items],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingMore(false)
    }
  }, [base, feed, loadingMore])

  if (feed === null) return error === '' ? null : <ErrorNote text={`后台动态读取失败：${error}`} />
  if (feed.items.length === 0 && feed.liveSummary === '' && feed.headline === '') return null

  const summaryOf = (item: ActivityItem): string => {
    if (typeof item.summary === 'string' && item.summary !== '') return item.summary
    const kind = typeof item.kind === 'string' ? item.kind : ''
    return kind !== '' ? kind.replace(/[._]/g, ' ') : JSON.stringify(item).slice(0, 120)
  }
  const kindOf = (item: ActivityItem): string => (typeof item.kind === 'string' && item.kind !== '' ? item.kind : '动态')

  return (
    <div className={css.activityFooter}>
      <div className={css.footerHead}>
        <div className={css.footerCopy}>
          <p className={css.footerHint}>{feed.liveSummary !== '' ? feed.liveSummary : '新闻爪正在替你留意新信息。'}</p>
          <p className={css.footerHeadline}>{feed.headline !== '' ? feed.headline : '最近还没新动静，先多刷一阵。'}</p>
        </div>
        {feed.items.length > 0 ? (
          <button type="button" className={css.footerToggle} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : '更多'}
          </button>
        ) : null}
      </div>
      {error !== '' ? <ErrorNote text={`加载更多失败：${error}`} /> : null}
      {expanded && feed.items.length > 0 ? (
        <div className={css.footerHistory}>
          {feed.items.map((item, i) => (
            <div className={css.footerItem} key={String(item.id ?? i)}>
              <div className={css.footerItemMeta}>
                <span className={css.footerItemKind}>{kindOf(item)}</span>
                <span>{typeof item.occurred_at === 'string' && item.occurred_at !== '' ? formatTime(item.occurred_at) : ''}</span>
              </div>
              <div className={css.footerItemSummary}>{summaryOf(item)}</div>
            </div>
          ))}
          {feed.hasMore ? <ActionButton label="加载更多" disabled={loadingMore} onClick={() => void loadMore()} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Read-only first-setup handoff. DSH never force-rebuilds an existing profile. */
function InitPrompt(props: { base: string; status: NewsBootstrapStatus; onRefresh: () => void; busy: boolean }): React.JSX.Element {
  const { base, status, onRefresh, busy } = props
  const failed = status.status === 'failed'
  const running = status.running || status.status === 'running'
  return (
    <div className={css.initPrompt}>
      <div className={css.initPromptCopy}>
        <strong>{running ? '首次设置正在进行' : failed ? '首次设置需要重试' : '先完成新闻爪首次设置'}</strong>
        <span>{running ? '新闻爪正在抓取首批真实新闻并建立画像。' : '兴趣方向与数据源需要在电脑版填写；已有画像不会被这里重建。'}</span>
        {status.detail !== '' ? <span className={css.initPromptStatus} role="status">{status.detail}</span> : null}
      </div>
      {running
        ? <ActionButton label={busy ? '刷新中…' : '刷新进度'} primary disabled={busy} onClick={onRefresh} />
        : <ActionButton label={failed ? '去电脑版检查并重试' : '去电脑版完成首次设置'} primary onClick={() => { window.open(`${base}/web`, '_blank', 'noopener') }} />}
    </div>
  )
}

/** 推荐 tab: header + pool status + spotlight + recommendation cards + activity. */
export function RecommendView(props: { base: string; refreshKey: number }): React.JSX.Element {
  const { base, refreshKey } = props
  const [items, setItems] = useState<RecommendationItem[] | null>(null)
  const [status, setStatus] = useState<RuntimeStatus | null>(null)
  const [bootstrap, setBootstrap] = useState<NewsBootstrapStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const reload = useCallback(async () => {
    setBusy('refresh')
    setError('')
    const [recs, runtime, bootstrapState] = await Promise.allSettled([
      fetchRecommendations(base),
      fetchRuntimeStatus(base),
      fetchNewsBootstrapStatus(base),
    ])
    if (recs.status === 'fulfilled') {
      setItems(recs.value)
      setExcluded([])
    } else {
      setError(recs.reason instanceof Error ? recs.reason.message : String(recs.reason))
    }
    if (runtime.status === 'fulfilled') setStatus(runtime.value)
    if (bootstrapState.status === 'fulfilled') setBootstrap(bootstrapState.value)
    const auxiliaryFailures = [runtime, bootstrapState].filter(result => result.status === 'rejected').length
    if (recs.status === 'fulfilled' && auxiliaryFailures > 0) setError('推荐已刷新，但部分运行状态读取失败；请稍后再试。')
    setBusy('')
  }, [base])

  useEffect(() => { void reload() }, [reload])

  const run = useCallback(async (label: string, action: () => Promise<RecommendationItem[]>) => {
    setBusy(label)
    setError('')
    try {
      const next = await action()
      setItems(next)
      setExcluded([])
      await fetchRuntimeStatus(base).then(setStatus).catch(() => {
        setError('内容已更新，但运行状态暂时读取失败。')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base])

  const visibleIds = items?.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean) ?? []
  const excludeAll = [...excluded, ...visibleIds]
  const [exhausted, setExhausted] = useState(false)

  // Scroll-to-load with prefetch: the sentinel fires a full 800px before it
  // scrolls into view, so the next page is fetched while the user is still
  // reading earlier cards (and short pages chain-append until the viewport
  // plus the prefetch buffer are filled). A visible loading row renders at
  // the bottom while a page is in flight.
  //
  // The observer is created ONCE (the latest appendMore rides a ref), so it
  // only fires on real intersection changes — recreating it per render made
  // a failed append re-fire forever (loading row flicker). A failed auto
  // append blocks further auto appends until the user acts again (manual
  // 追加一批 / 换一批 / 刷新 clear the block).
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [appendBlocked, setAppendBlocked] = useState(false)
  const appendMore = useCallback(async () => {
    if (items === null || busy !== '' || exhausted || appendBlocked) return
    setBusy('append-auto')
    setError('')
    try {
      const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean)] })
      if (next.length === 0) setExhausted(true)
      else {
        setItems(prev => [...(prev ?? []), ...next])
        setExcluded(prev => [...prev, ...items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean)])
      }
      await fetchRuntimeStatus(base).then(setStatus).catch(() => {
        setError('新闻已追加，但运行状态暂时读取失败。')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAppendBlocked(true)
    } finally {
      setBusy('')
    }
  }, [base, busy, exhausted, appendBlocked, items, excluded])

  const appendManual = useCallback(async () => {
    if (items === null || busy !== '') return
    setBusy('append')
    setError('')
    try {
      const currentIds = items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean)
      const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...currentIds] })
      if (next.length === 0) {
        setExhausted(true)
      } else {
        const seen = new Set(currentIds)
        const fresh = next.filter(item => {
          const key = item.item_key !== '' ? item.item_key : item.article_id
          if (key === '' || seen.has(key)) return false
          seen.add(key)
          return true
        })
        if (fresh.length === 0) setExhausted(true)
        else {
          setItems(prev => [...(prev ?? []), ...fresh])
          setExcluded(prev => [...prev, ...currentIds])
          setExhausted(false)
        }
      }
      await fetchRuntimeStatus(base).then(setStatus).catch(() => {
        setError('新闻已追加，但运行状态暂时读取失败。')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, busy, excluded, items])
  const appendMoreRef = useRef<() => Promise<void>>(async () => undefined)
  appendMoreRef.current = appendMore
  useEffect(() => {
    const el = sentinelRef.current
    if (el === null) return
    // The panel scrolls in its own container (`.body`), so that container must
    // be the observer root — a viewport root's margin is clipped by it.
    const root = el.parentElement
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) void appendMoreRef.current()
      }
    }, { root, rootMargin: '800px 0px 800px 0px' })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  return (
    <>
      <div className={css.recHeader}>
        <div className={css.recHeaderCopy}>
          <div className={css.recKicker}>For You</div>
          <div className={css.recHeaderTitle}>今天值得你理解的新闻</div>
          {status !== null ? (
            <div className={css.poolChips}>
              {poolStatus(status).map(chip => (
                <div className={css.poolChip} key={chip.label}>
                  <span className={css.poolChipLabel}>{chip.label}</span>
                  <span className={css.poolChipValue}>{chip.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className={css.recHeaderActions}>
          <ActionButton label="刷新" disabled={busy !== ''} onClick={() => { setExhausted(false); setAppendBlocked(false); void reload() }} />
          <ActionButton label="换一批" disabled={busy !== ''} onClick={() => { setExhausted(false); setAppendBlocked(false); void run('reshuffle', () => reshuffleRecommendations(base, { excludedArticleIds: excludeAll })) }} />
        </div>
      </div>
      {error !== '' ? <ErrorNote text={error} /> : null}
      {bootstrap !== null && !bootstrap.profile_ready ? <InitPrompt base={base} status={bootstrap} onRefresh={() => void reload()} busy={busy !== ''} /> : null}
      <SpotlightBanner key={`spotlight-${refreshKey}`} base={base} onError={setError} />
      {items !== null && items.length === 0
        ? <EmptyState text="推荐池暂时为空。可以先完成首次设置，或等新闻源下一轮刷新。" />
        : null}
      {items?.map(item => (
        <RecommendationCard
          key={item.id}
          base={base}
          item={item}
          onDismissed={id => setItems(prev => (prev ?? []).filter(card => card.id !== id))}
          onError={setError}
        />
      ))}
      {items !== null && items.length > 0 ? (
        <div className={css.cardActions}>
          <ActionButton label="追加一批" disabled={busy !== '' || exhausted} onClick={() => { setAppendBlocked(false); void appendManual() }} />
          <ActionButton label="刷新" disabled={busy !== ''} onClick={() => { setExhausted(false); setAppendBlocked(false); void reload() }} />
        </div>
      ) : null}
      {exhausted ? <div className={css.hint} style={{ textAlign: 'center' }}>这池先翻到头了，后台还在继续补货。</div> : null}
      {busy === 'append-auto' || busy === 'append' ? (
        <div className={css.loadingRow} role="status">
          <span className={css.spinner} aria-hidden="true" />
          正在加载下一批…
        </div>
      ) : null}
      <div ref={sentinelRef} style={{ height: 2 }} aria-hidden="true" />
    </>
  )
}
