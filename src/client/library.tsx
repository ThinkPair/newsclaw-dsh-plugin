/** NewsClaw local library: later, favorites and recent reading history. */
import { useCallback, useEffect, useState } from 'react'
import {
  fetchContentHistory, fetchSaved, fetchSavedStatus, removeSaved, saveItem,
  sendBehaviorEvents, stableId,
  type ContentHistoryItem, type SavedItem,
} from './api.ts'
import { ActionButton, EmptyState, ErrorNote, MetaRow, Thumb } from './views.tsx'
import css from './panel.module.css'

type LibraryTab = 'watch_later' | 'favorite' | 'history'
type HistoryCategory = 'clicked' | 'shown' | 'removed'

const LIBRARY_TABS: Array<{ key: LibraryTab; label: string }> = [
  { key: 'watch_later', label: '稍后读' },
  { key: 'favorite', label: '收藏' },
  { key: 'history', label: '阅读记录' },
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

async function postSavedFeedback(base: string, item: SavedItem, feedbackType: string, note = ''): Promise<void> {
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
    event_id: stableId(),
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
  const [otherSaved, setOtherSaved] = useState(false)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchSavedStatus(base, otherKind, item.item_key)
      .then(saved => { if (!cancelled) setOtherSaved(saved) })
      .catch(() => { if (!cancelled) setOtherSaved(false) })
    return () => { cancelled = true }
  }, [base, item.item_key, otherKind])

  const toggleOther = useCallback(async () => {
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
      setOtherSaved(value => !value)
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
      await postSavedFeedback(base, item, kind, note)
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
          <ActionButton label="打开原文" primary disabled={anyBusy || item.content_url === ''} onClick={() => { window.open(item.content_url, '_blank', 'noopener') }} />
          <ActionButton label="移除" danger disabled={anyBusy} onClick={() => onRemove(item.item_key)} />
        </div>
        <div className={css.savedFeedbackRow}>
          <ActionButton label="喜欢" disabled={anyBusy} onClick={() => void feedback('like')} />
          <ActionButton label="不感兴趣" disabled={anyBusy} onClick={() => void feedback('dislike')} />
          <ActionButton label="聊一聊" disabled={anyBusy} onClick={comment} />
          <ActionButton
            label={otherKind === 'favorite' ? (otherSaved ? '取消收藏' : '收藏') : (otherSaved ? '取消稍后读' : '稍后读')}
            disabled={anyBusy}
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
              <ActionButton label="打开原文" primary disabled={item.content_url === ''} onClick={() => { window.open(item.content_url, '_blank', 'noopener') }} />
            </div>
          </div>
        </div>
      ))}
      {hasMore ? <button type="button" className={css.loadMore} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? '加载中…' : '加载更多'}</button> : null}
    </>
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
    </>
  )
}
