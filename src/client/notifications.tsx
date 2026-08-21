/**
 * 消息 drawer — the same message system as the mobile web's messages overlay:
 * probe notifications (interest / avoidance / challenge) with the four-state
 * actions, spotlight surprise messages, and pending notification
 * recommendations. Badge = probe + spotlight + notification count.
 * @module @newsclaw/dsh-plugin
 */
import { useCallback, useEffect, useState } from 'react'
import {
  acknowledgeNotification, fetchAvoidanceProbes, fetchSpotlightBatch, fetchInterestProbes, fetchPendingNotification,
  respondAvoidanceProbe, respondInterestProbe, respondToSpotlight,
  stableId, type SpotlightItem, type ProbeItem,
} from './api.ts'
import { ActionButton, openItem } from './views.tsx'
import { MessageIcon, CloseIcon, SearchIcon } from './icons.tsx'
import css from './panel.module.css'

/** One probe notification row (interest/avoidance/challenge). */
export interface ProbeNotice {
  key: string
  type: 'interest.probe' | 'avoidance.probe'
  domain: string
  reason: string
  challenge: boolean
  confidence: number
}

/** One spotlight message row. */
export interface SpotlightNotice {
  article_id: string
  title: string
  reason: string
  hook: string
  media: string
  content_url: string
  content_id: string
  score: number
}

/** One pending notification (a recommendation the system wants to surface). */
export interface RecommendationNotice {
  article_id: string
  title: string
  reason: string
  media: string
  original_url: string
}

/** Canonical probe action sets (same labels as the mobile web). */
const INTEREST_ACTIONS = [
  { action: 'confirm', label: '确认喜欢', primary: true },
  { action: 'defer', label: '暂时搁置', primary: false },
  { action: 'reject', label: '确认不喜欢', primary: false },
] as const

const AVOIDANCE_ACTIONS = [
  { action: 'confirm', label: '确认避雷', primary: true },
  { action: 'defer', label: '搁置避雷', primary: false },
  { action: 'reject', label: '不是雷点', primary: false },
] as const

/** Dedupe helpers (same key scheme as probe-notification-helpers.js). */
export function probeKey(type: string, domain: string): string {
  const normalized = domain.trim().toLowerCase()
  return normalized === '' ? '' : `${type.startsWith('avoidance.') ? 'avoidance.probe' : 'interest.probe'}:${normalized}`
}

/** One probe message card with inline actions. */
function ProbeMessage(props: {
  base: string
  notice: ProbeNotice
  onHandled: (key: string) => void
  onError: (text: string) => void
}): React.JSX.Element {
  const { base, notice, onHandled, onError } = props
  const [busy, setBusy] = useState('')
  const [requestIds] = useState(() => ({ confirm: stableId(), reject: stableId(), defer: stableId(), chat: stableId() }))
  const isAvoidance = notice.type === 'avoidance.probe'
  const tone = isAvoidance ? 'avoidance' : notice.challenge ? 'challenge' : 'interest'
  const actions = isAvoidance ? AVOIDANCE_ACTIONS : INTEREST_ACTIONS
  const prompt = isAvoidance
    ? '想少看这类，就确认这是雷点；如果猜错了，点不是。'
    : notice.challenge
      ? '这是挑战方向，会把口味往侧边推一点；想继续试探就点喜欢，不准就点不喜欢。'
      : '想继续探索这个方向，就点喜欢；不准就点不喜欢。'

  const answer = useCallback(async (action: string) => {
    setBusy(action)
    try {
      const request_id = requestIds[action as keyof typeof requestIds] ?? stableId()
      if (isAvoidance) await respondAvoidanceProbe(base, { domain: notice.domain, response: action, request_id })
      else await respondInterestProbe(base, { domain: notice.domain, response: action, request_id })
      onHandled(notice.key)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, isAvoidance, notice.domain, notice.key, onError, onHandled, requestIds])

  return (
    <div className={css.messageCard} data-tone={tone}>
      <div className={css.messageType}>
        <SearchIcon />
        {isAvoidance ? '避雷确认' : notice.challenge ? '挑战探针' : '兴趣探测'}
      </div>
      <div className={css.messagePrompt}>{prompt}</div>
      <div className={css.messageTitle}>{notice.domain}</div>
      {notice.reason !== '' ? <div className={css.messageBody}>{notice.reason}</div> : null}
      <div className={css.messageActions}>
        {actions.map(entry => (
          <ActionButton
            key={entry.action}
            label={entry.label}
            primary={entry.primary}
            disabled={busy !== ''}
            onClick={() => void answer(entry.action)}
          />
        ))}
      </div>
    </div>
  )
}

/** One spotlight message card. */
function SpotlightMessage(props: {
  base: string
  notice: SpotlightNotice
  onHandled: (article_id: string) => void
  onError: (text: string) => void
}): React.JSX.Element {
  const { base, notice, onHandled, onError } = props
  const [busy, setBusy] = useState('')
  const [requestIds] = useState(() => ({ view: stableId(), like: stableId(), dislike: stableId(), ignore: stableId(), chat: stableId() }))
  const act = useCallback(async (response: string) => {
    setBusy(response)
    try {
      await respondToSpotlight(base, { article_id: notice.article_id, response, title: notice.title, request_id: requestIds[response as keyof typeof requestIds] ?? stableId() })
      onHandled(notice.article_id)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [base, notice.article_id, notice.title, onError, onHandled, requestIds])

  return (
    <div className={css.messageCard} data-tone="spotlight">
      <div className={css.messageType}>✨ 惊喜推荐</div>
      <div className={css.messageTitle}>{notice.title}</div>
      {notice.reason !== '' ? <div className={css.messageBody}>{notice.reason}</div> : null}
      <div className={css.messageActions}>
        <ActionButton
          label="打开原文"
          primary
          disabled={busy !== '' || notice.content_url === ''}
          onClick={() => {
            // Mark the spotlight seen, while openItem records exactly one
            // article-open learning event.
            void act('view')
            openItem(base, {
              recommendation_id: undefined,
              content_id: notice.content_id !== '' ? notice.content_id : notice.article_id,
              article_id: notice.article_id,
              content_url: notice.content_url,
              media: notice.media,
              title: notice.title,
            }, error => {
              onError('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error)))
            })
          }}
        />
        <ActionButton label="喜欢" disabled={busy !== ''} onClick={() => void act('like')} />
        <ActionButton label="忽略" disabled={busy !== ''} onClick={() => void act('ignore')} />
      </div>
    </div>
  )
}

/** One pending notification recommendation card. */
function NotificationMessage(props: {
  base: string
  notice: RecommendationNotice
  onHandled: (article_id: string) => void
  onError: (text: string) => void
}): React.JSX.Element {
  const { base, notice, onHandled, onError } = props
  const [busy, setBusy] = useState(false)
  const [requestId] = useState(stableId)
  const open = useCallback(() => {
    openItem(
      base,
      { content_id: notice.article_id, article_id: notice.article_id, content_url: notice.original_url, media: notice.media, title: notice.title },
      error => { onError('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error))) },
    )
    setBusy(true)
    void acknowledgeNotification(base, notice.article_id, requestId).then(() => {
      onHandled(notice.article_id)
    }).catch(error => {
      onError('消息已打开，但确认状态保存失败：' + (error instanceof Error ? error.message : String(error)))
    }).finally(() => { setBusy(false) })
  }, [base, notice, onError, onHandled, requestId])
  return (
    <div className={css.messageCard}>
      <div className={css.messageType}>🔔 值得一看</div>
      <div className={css.messageTitle}>{notice.title !== '' ? notice.title : notice.article_id}</div>
      {notice.reason !== '' ? <div className={css.messageBody}>{notice.reason}</div> : null}
      <div className={css.messageActions}>
        <ActionButton
          primary
          disabled={notice.original_url === '' || busy}
          label={busy ? '正在确认…' : '打开原文'}
          onClick={open}
        />
      </div>
    </div>
  )
}

/** The messages drawer (bell overlay). */
export function MessagesDrawer(props: {
  base: string
  probes: ProbeNotice[]
  spotlights: SpotlightNotice[]
  notifications: RecommendationNotice[]
  onClose: () => void
  onProbeHandled: (key: string) => void
  onSpotlightHandled: (article_id: string) => void
  onNotificationHandled: (article_id: string) => void
  onError: (text: string) => void
}): React.JSX.Element {
  const { base, probes, spotlights, notifications, onClose, onProbeHandled, onSpotlightHandled, onNotificationHandled, onError } = props
  const isEmpty = probes.length === 0 && spotlights.length === 0 && notifications.length === 0

  return (
    <div className={css.drawerOverlay} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={css.drawerPanel}>
        <div className={css.drawerHeader}>
          <span className={css.drawerTitle}>消息</span>
          <button type="button" className={css.iconButton} onClick={onClose} title="关闭">
            <CloseIcon size={13} />
          </button>
        </div>
        {isEmpty ? (
          <div className={css.drawerEmpty}>
            <MessageIcon size={34} />
            <span className={css.drawerEmptyTitle}>暂时没有新消息</span>
            <span className={css.drawerEmptySubtitle}>兴趣探测和惊喜推荐会出现在这里</span>
          </div>
        ) : null}
        {notifications.map(notice => (
          <NotificationMessage key={`notif:${notice.article_id}`} base={base} notice={notice} onHandled={onNotificationHandled} onError={onError} />
        ))}
        {probes.map(notice => (
          <ProbeMessage key={notice.key} base={base} notice={notice} onHandled={onProbeHandled} onError={onError} />
        ))}
        {spotlights.map(notice => (
          <SpotlightMessage key={`spotlight:${notice.article_id}`} base={base} notice={notice} onHandled={onSpotlightHandled} onError={onError} />
        ))}
      </div>
    </div>
  )
}

/** Coerce one probe payload into a notice row. */
function toProbeNotice(item: ProbeItem, type: 'interest.probe' | 'avoidance.probe'): ProbeNotice {
  return {
    key: probeKey(type, item.domain),
    type,
    domain: item.domain,
    reason: item.reason,
    challenge: (item.probe_mode ?? '') === 'lateral' || (item.probe_mode ?? '') === 'bridge' || (item.probe_mode ?? '') === 'wildcard' || (item.challenge ?? '') === 'true',
    confidence: item.confidence,
  }
}

/** Build a spotlight notice from a spotlight payload. */
export function toSpotlightNotice(item: SpotlightItem): SpotlightNotice {
  return {
    article_id: item.article_id,
    title: item.title,
    reason: item.spotlight_reason,
    hook: item.spotlight_hook,
    media: item.media,
    content_url: item.content_url,
    content_id: item.content_id,
    score: item.spotlight_score,
  }
}

/** Hydrate the drawer from the REST surfaces (probes + spotlights + notification). */
export async function hydrateDrawer(base: string, handledProbes: ReadonlySet<string>): Promise<{
  probes: ProbeNotice[]
  spotlights: SpotlightNotice[]
  notifications: RecommendationNotice[]
  error: string
  loaded: { interests: boolean; avoidances: boolean; spotlights: boolean; notification: boolean }
}> {
  const results = await Promise.allSettled([
    fetchInterestProbes(base),
    fetchAvoidanceProbes(base),
    fetchSpotlightBatch(base),
    fetchPendingNotification(base),
  ])
  const interests = results[0].status === 'fulfilled' ? results[0].value : []
  const avoidances = results[1].status === 'fulfilled' ? results[1].value : []
  const spotlights = results[2].status === 'fulfilled' ? results[2].value : []
  const notification = results[3].status === 'fulfilled' ? results[3].value : null
  const failed = results.filter(result => result.status === 'rejected').length
  const probeNotice = (p: ProbeItem, type: 'interest.probe' | 'avoidance.probe'): ProbeNotice | null => {
    const key = probeKey(type, p.domain)
    if (key === '' || handledProbes.has(key)) return null
    if ((p.status ?? 'active') !== 'active' && (p.status ?? 'active') !== 'pending') return null
    return toProbeNotice(p, type)
  }
  return {
    probes: [
      ...interests.map(p => probeNotice(p, 'interest.probe')).filter((n): n is ProbeNotice => n !== null),
      ...avoidances.map(p => probeNotice(p, 'avoidance.probe')).filter((n): n is ProbeNotice => n !== null),
    ],
    spotlights: spotlights.map(toSpotlightNotice),
    notifications: notification !== null
      ? [{ article_id: notification.article_id, title: notification.title, reason: notification.reason, media: notification.media, original_url: notification.original_url }]
      : [],
    error: failed === 0 ? '' : failed === results.length
      ? '消息暂时读取失败，请确认新闻爪后端已启动。'
      : '部分消息来源读取失败，当前只展示已成功取得的消息。',
    loaded: {
      interests: results[0].status === 'fulfilled',
      avoidances: results[1].status === 'fulfilled',
      spotlights: results[2].status === 'fulfilled',
      notification: results[3].status === 'fulfilled',
    },
  }
}
