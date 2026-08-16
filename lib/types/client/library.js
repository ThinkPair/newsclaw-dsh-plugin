import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** NewsClaw local library: later, favorites and recent reading history. */
import { useCallback, useEffect, useState } from 'react';
import { fetchContentHistory, fetchSaved, fetchSavedStatus, removeSaved, saveItem, sendBehaviorEvents, stableId, } from "./api.js";
import { ActionButton, EmptyState, ErrorNote, MetaRow, Thumb } from "./views.js";
import css from './panel.module.css';
const LIBRARY_TABS = [
    { key: 'watch_later', label: '稍后读' },
    { key: 'favorite', label: '收藏' },
    { key: 'history', label: '阅读记录' },
];
const HISTORY_CATEGORIES = [
    { key: 'clicked', label: '打开过' },
    { key: 'shown', label: '展示过' },
    { key: 'removed', label: '移除的' },
];
function articleId(item) {
    if (item.article_id !== '')
        return item.article_id;
    if (item.content_id !== '')
        return item.content_id;
    return item.item_key;
}
async function postSavedFeedback(base, item, feedbackType, note = '') {
    const id = articleId(item);
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
        }]);
    if (result.accepted < 1)
        throw new Error(result.rejected[0]?.reason || '反馈没有保存，请稍后重试。');
}
function SavedCard(props) {
    const { base, listKind, item, removing, onRemove } = props;
    const otherKind = listKind === 'favorite' ? 'watch_later' : 'favorite';
    const [otherSaved, setOtherSaved] = useState(false);
    const [busy, setBusy] = useState('');
    const [status, setStatus] = useState('');
    useEffect(() => {
        let cancelled = false;
        void fetchSavedStatus(base, otherKind, item.item_key)
            .then(saved => { if (!cancelled)
            setOtherSaved(saved); })
            .catch(() => { if (!cancelled)
            setOtherSaved(false); });
        return () => { cancelled = true; };
    }, [base, item.item_key, otherKind]);
    const toggleOther = useCallback(async () => {
        setBusy('other');
        setStatus('');
        try {
            if (otherSaved) {
                await removeSaved(base, otherKind, item.item_key);
            }
            else {
                await saveItem(base, otherKind, {
                    article_id: articleId(item),
                    media: item.media,
                    original_url: item.content_url,
                    title: item.title,
                    author_name: item.author_name,
                    cover_url: item.cover_url,
                });
            }
            setOtherSaved(value => !value);
            setStatus(otherSaved ? '已从另一列表移除。' : otherKind === 'favorite' ? '已加入收藏。' : '已加入稍后读。');
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        }
        finally {
            setBusy('');
        }
    }, [base, item, otherKind, otherSaved]);
    const feedback = useCallback(async (kind, note = '') => {
        setBusy(kind);
        setStatus('');
        try {
            await postSavedFeedback(base, item, kind, note);
            setStatus('这条反馈已用于更新你的画像。');
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        }
        finally {
            setBusy('');
        }
    }, [base, item]);
    const comment = useCallback(() => {
        const value = window.prompt('这条新闻为什么对你有用，或哪里不符合你的需要？')?.trim() ?? '';
        if (value !== '')
            void feedback('comment', value);
    }, [feedback]);
    const anyBusy = removing !== '' || busy !== '';
    return (_jsxs("div", { className: css.card, children: [_jsx(Thumb, { base: base, url: item.cover_url, title: item.title, kind: "article", media: item.media }), _jsxs("div", { className: css.cardBody, children: [_jsx("div", { className: css.cardTitle, children: item.title || item.item_key }), _jsx(MetaRow, { media: item.media, author: item.author_name, time: item.added_at }), _jsxs("div", { className: css.cardActions, children: [_jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: anyBusy || item.content_url === '', onClick: () => { window.open(item.content_url, '_blank', 'noopener'); } }), _jsx(ActionButton, { label: "\u79FB\u9664", danger: true, disabled: anyBusy, onClick: () => onRemove(item.item_key) })] }), _jsxs("div", { className: css.savedFeedbackRow, children: [_jsx(ActionButton, { label: "\u559C\u6B22", disabled: anyBusy, onClick: () => void feedback('like') }), _jsx(ActionButton, { label: "\u4E0D\u611F\u5174\u8DA3", disabled: anyBusy, onClick: () => void feedback('dislike') }), _jsx(ActionButton, { label: "\u804A\u4E00\u804A", disabled: anyBusy, onClick: comment }), _jsx(ActionButton, { label: otherKind === 'favorite' ? (otherSaved ? '取消收藏' : '收藏') : (otherSaved ? '取消稍后读' : '稍后读'), disabled: anyBusy, onClick: () => void toggleOther() })] }), status !== '' ? _jsx("div", { className: css.feedbackStatus, children: status }) : null] })] }));
}
function SavedList(props) {
    const { base, listKind } = props;
    const [items, setItems] = useState(null);
    const [error, setError] = useState('');
    const [removing, setRemoving] = useState('');
    const reload = useCallback(async () => {
        setError('');
        try {
            setItems((await fetchSaved(base, listKind)).items);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [base, listKind]);
    useEffect(() => { void reload(); }, [reload]);
    const remove = useCallback(async (itemKey) => {
        setRemoving(itemKey);
        try {
            await removeSaved(base, listKind, itemKey);
            await reload();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            setRemoving('');
        }
    }, [base, listKind, reload]);
    return (_jsxs(_Fragment, { children: [error !== '' ? _jsx(ErrorNote, { text: error }) : null, items !== null && items.length === 0
                ? _jsx(EmptyState, { text: listKind === 'favorite' ? '还没有收藏。' : '还没有稍后读的新闻。' })
                : null, items?.map(item => (_jsx(SavedCard, { base: base, listKind: listKind, item: item, removing: removing, onRemove: key => void remove(key) }, item.item_key)))] }));
}
function historyLabel(context) {
    if (context === 'favorite')
        return '收藏';
    if (context === 'watch_later')
        return '稍后读';
    if (context === 'dismiss' || context === 'ignore')
        return '不再推荐';
    if (context === 'dislike')
        return '不感兴趣';
    return context;
}
function HistoryContextBadges({ item }) {
    const contexts = item.contexts.length > 0 ? item.contexts : item.context !== '' ? [{ context: item.context, occurred_at: item.occurred_at, restored: item.restored }] : [];
    if (contexts.length === 0)
        return null;
    return (_jsx("div", { className: css.badgeRow, children: contexts.map(context => (_jsxs("span", { className: css.contextBadge, "data-kind": context.restored ? 'restored' : undefined, children: [historyLabel(context.context), context.restored ? ' · 已恢复' : ''] }, `${context.context}:${context.occurred_at}`))) }));
}
function HistoryList({ base }) {
    const [category, setCategory] = useState('clicked');
    const [items, setItems] = useState(null);
    const [total, setTotal] = useState(0);
    const [cursor, setCursor] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(async (nextCursor = '', append = false) => {
        setError('');
        try {
            const page = await fetchContentHistory(base, category, nextCursor);
            setItems(previous => append && previous !== null ? [...previous, ...page.items] : page.items);
            setTotal(page.total);
            setCursor(page.nextCursor);
            setHasMore(page.hasMore);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [base, category]);
    useEffect(() => { void load(); }, [load]);
    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore)
            return;
        setLoadingMore(true);
        await load(cursor, true);
        setLoadingMore(false);
    }, [cursor, hasMore, load, loadingMore]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: css.subTabs, children: HISTORY_CATEGORIES.map(row => (_jsx("button", { type: "button", className: css.subTab, "data-active": category === row.key, onClick: () => setCategory(row.key), children: row.label }, row.key))) }), _jsxs("div", { className: css.hint, children: ["\u8FD1 30 \u5929 \u00B7 \u5171 ", total, " \u6761"] }), error !== '' ? _jsx(ErrorNote, { text: error }) : null, items !== null && items.length === 0 ? _jsx(EmptyState, { text: "\u8FD9\u4E2A\u5206\u7C7B\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002" }) : null, items?.map(item => (_jsxs("div", { className: css.card, children: [_jsx(Thumb, { base: base, url: item.cover_url, title: item.title, kind: "article", media: item.media }), _jsxs("div", { className: css.cardBody, children: [_jsx("div", { className: css.cardTitle, children: item.title || item.body_text.slice(0, 60) || item.item_key }), _jsx(MetaRow, { media: item.media, author: item.author_name, time: item.occurred_at }), _jsx(HistoryContextBadges, { item: item }), _jsx("div", { className: css.cardActions, children: _jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: item.content_url === '', onClick: () => { window.open(item.content_url, '_blank', 'noopener'); } }) })] })] }, `${item.item_key}:${item.occurred_at}`))), hasMore ? _jsx("button", { type: "button", className: css.loadMore, disabled: loadingMore, onClick: () => void loadMore(), children: loadingMore ? '加载中…' : '加载更多' }) : null] }));
}
export function LibraryView({ base }) {
    const [tab, setTab] = useState('watch_later');
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: css.subTabs, children: LIBRARY_TABS.map(row => (_jsx("button", { type: "button", className: css.subTab, "data-active": tab === row.key, onClick: () => setTab(row.key), children: row.label }, row.key))) }), tab === 'watch_later' ? _jsx(SavedList, { base: base, listKind: "watch_later" }, `later-${base}`) : null, tab === 'favorite' ? _jsx(SavedList, { base: base, listKind: "favorite" }, `favorite-${base}`) : null, tab === 'history' ? _jsx(HistoryList, { base: base }, `history-${base}`) : null] }));
}
//# sourceMappingURL=library.js.map