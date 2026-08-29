import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** NewsClaw local library: later, favorites and recent reading history. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkWebMonitor, createWebMonitor, fetchWebMonitorHistory, fetchWebMonitors, fetchContentHistory, fetchSaved, fetchSavedStatus, removeSaved, saveItem, sendBehaviorEvents, setWebMonitorState, stableId, } from "./api.js";
import { ActionButton, EmptyState, ErrorNote, MetaRow, openItem, Thumb } from "./views.js";
import css from './panel.module.css';
const LIBRARY_TABS = [
    { key: 'watch_later', label: '稍后读' },
    { key: 'favorite', label: '收藏' },
    { key: 'history', label: '阅读记录' },
    { key: 'monitoring', label: '网页监控' },
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
async function postSavedFeedback(base, item, feedbackType, note, eventId) {
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
            event_id: eventId,
        }]);
    if (result.accepted < 1)
        throw new Error(result.rejected[0]?.reason || '反馈没有保存，请稍后重试。');
}
function SavedCard(props) {
    const { base, listKind, item, removing, onRemove } = props;
    const otherKind = listKind === 'favorite' ? 'watch_later' : 'favorite';
    const [otherSaved, setOtherSaved] = useState(null);
    const [busy, setBusy] = useState('');
    const [status, setStatus] = useState('');
    const actionIds = useRef(new Map());
    useEffect(() => {
        let cancelled = false;
        setOtherSaved(null);
        setStatus('');
        void fetchSavedStatus(base, otherKind, item.item_key)
            .then(saved => { if (!cancelled)
            setOtherSaved(saved); })
            .catch(error => {
            if (!cancelled) {
                setOtherSaved(null);
                setStatus('另一列表状态读取失败：' + (error instanceof Error ? error.message : String(error)));
            }
        });
        return () => { cancelled = true; };
    }, [base, item.item_key, otherKind]);
    const toggleOther = useCallback(async () => {
        if (otherSaved === null)
            return;
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
            setOtherSaved(value => value === null ? null : !value);
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
            const key = `${kind}:${note}`;
            let eventId = actionIds.current.get(key);
            if (eventId === undefined) {
                eventId = stableId();
                actionIds.current.set(key, eventId);
            }
            await postSavedFeedback(base, item, kind, note, eventId);
            actionIds.current.delete(key);
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
    return (_jsxs("div", { className: css.card, children: [_jsx(Thumb, { base: base, url: item.cover_url, title: item.title, kind: "article", media: item.media }), _jsxs("div", { className: css.cardBody, children: [_jsx("div", { className: css.cardTitle, children: item.title || item.item_key }), _jsx(MetaRow, { media: item.media, author: item.author_name, time: item.added_at }), _jsxs("div", { className: css.cardActions, children: [_jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: anyBusy || item.content_url === '', onClick: () => {
                                    openItem(base, { content_id: item.content_id, article_id: articleId(item), content_url: item.content_url, media: item.media, title: item.title }, error => { setStatus('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error))); });
                                } }), _jsx(ActionButton, { label: "\u79FB\u9664", danger: true, disabled: anyBusy, onClick: () => onRemove(item.item_key) })] }), _jsxs("div", { className: css.savedFeedbackRow, children: [_jsx(ActionButton, { label: "\u559C\u6B22", disabled: anyBusy, onClick: () => void feedback('like') }), _jsx(ActionButton, { label: "\u4E0D\u611F\u5174\u8DA3", disabled: anyBusy, onClick: () => void feedback('dislike') }), _jsx(ActionButton, { label: "\u804A\u4E00\u804A", disabled: anyBusy, onClick: comment }), _jsx(ActionButton, { label: otherKind === 'favorite' ? (otherSaved ? '取消收藏' : '收藏') : (otherSaved ? '取消稍后读' : '稍后读'), disabled: anyBusy || otherSaved === null, onClick: () => void toggleOther() })] }), status !== '' ? _jsx("div", { className: css.feedbackStatus, children: status }) : null] })] }));
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
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: css.subTabs, children: HISTORY_CATEGORIES.map(row => (_jsx("button", { type: "button", className: css.subTab, "data-active": category === row.key, onClick: () => setCategory(row.key), children: row.label }, row.key))) }), _jsxs("div", { className: css.hint, children: ["\u8FD1 30 \u5929 \u00B7 \u5171 ", total, " \u6761"] }), error !== '' ? _jsx(ErrorNote, { text: error }) : null, items !== null && items.length === 0 ? _jsx(EmptyState, { text: "\u8FD9\u4E2A\u5206\u7C7B\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002" }) : null, items?.map(item => (_jsxs("div", { className: css.card, children: [_jsx(Thumb, { base: base, url: item.cover_url, title: item.title, kind: "article", media: item.media }), _jsxs("div", { className: css.cardBody, children: [_jsx("div", { className: css.cardTitle, children: item.title || item.body_text.slice(0, 60) || item.item_key }), _jsx(MetaRow, { media: item.media, author: item.author_name, time: item.occurred_at }), _jsx(HistoryContextBadges, { item: item }), _jsx("div", { className: css.cardActions, children: _jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: item.content_url === '', onClick: () => {
                                        openItem(base, {
                                            recommendation_id: item.recommendation_id ?? undefined,
                                            content_id: item.content_id,
                                            article_id: item.content_id !== '' ? item.content_id : item.item_key,
                                            content_url: item.content_url,
                                            media: item.media,
                                            title: item.title,
                                        }, cause => { setError('原文已打开，但阅读记录未确认保存：' + (cause instanceof Error ? cause.message : String(cause))); });
                                    } }) })] })] }, `${item.item_key}:${item.occurred_at}`))), hasMore ? _jsx("button", { type: "button", className: css.loadMore, disabled: loadingMore, onClick: () => void loadMore(), children: loadingMore ? '加载中…' : '加载更多' }) : null] }));
}
function monitorStatus(status) {
    if (status === 'active')
        return '监控中';
    if (status === 'paused')
        return '已暂停';
    if (status === 'retry_wait')
        return '等待重试';
    if (status === 'needs_attention')
        return '需要处理';
    return status || '状态未知';
}
function shortTime(value) {
    if (value === '')
        return '尚未检查';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function MonitorHistoryFold({ history }) {
    const meaningful = history.diffs.filter(item => item.classification === 'meaningful').slice(0, 3);
    const totalVersions = Math.max(history.monitor.current_version, history.versions.length);
    return (_jsxs("div", { className: css.monitorHistory, children: [_jsxs("div", { className: css.monitorHistoryHead, children: ["\u5DF2\u7559\u5B58 ", totalVersions, " \u4E2A\u7248\u672C"] }), meaningful.length === 0
                ? _jsx("div", { className: css.monitorQuiet, children: "\u8FD8\u6CA1\u6709\u786E\u8BA4\u7684\u6B63\u6587\u53D8\u5316\u3002" })
                : meaningful.map(item => (_jsxs("div", { className: css.monitorDiff, children: [_jsx("span", { children: item.summary || '正文发生变化' }), _jsx("time", { children: shortTime(item.created_at) })] }, item.diff_id)))] }));
}
function WebMonitoringView({ base }) {
    const [items, setItems] = useState(null);
    const [url, setUrl] = useState('');
    const [label, setLabel] = useState('');
    const [adding, setAdding] = useState(false);
    const [busyIds, setBusyIds] = useState(() => new Set());
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [expanded, setExpanded] = useState('');
    const [history, setHistory] = useState({});
    const [historyErrors, setHistoryErrors] = useState({});
    const actionIds = useRef(new Map());
    const reloadGeneration = useRef(0);
    const busyIdsRef = useRef(new Set());
    const expandedRef = useRef('');
    const historySignatures = useRef(new Map());
    const historyLoadGenerations = useRef(new Map());
    expandedRef.current = expanded;
    const setMonitorBusy = useCallback((monitorId, value) => {
        const next = new Set(busyIdsRef.current);
        if (value)
            next.add(monitorId);
        else
            next.delete(monitorId);
        busyIdsRef.current = next;
        setBusyIds(next);
    }, []);
    const reload = useCallback(async () => {
        const generation = ++reloadGeneration.current;
        setError('');
        try {
            const next = await fetchWebMonitors(base);
            if (generation === reloadGeneration.current)
                setItems(next);
        }
        catch (cause) {
            if (generation === reloadGeneration.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [base]);
    useEffect(() => {
        void reload();
        const interval = window.setInterval(() => { void reload(); }, 30_000);
        return () => {
            window.clearInterval(interval);
            reloadGeneration.current += 1;
        };
    }, [reload]);
    const add = useCallback(async () => {
        const target = url.trim();
        if (target === '' || adding)
            return;
        setAdding(true);
        setError('');
        setStatus('正在读取正文并建立首个基线…');
        try {
            const created = await createWebMonitor(base, { url: target, label: label.trim(), requestId: stableId() });
            setUrl('');
            setLabel('');
            if (created.initialCheckStatus === 'baseline' || created.item.has_baseline) {
                setStatus('已建立基线；以后只有正文发生真实变化才会提醒。');
            }
            else {
                setStatus('监控已保存，但首次读取没有建立基线；可在列表中查看原因并重新检查。');
            }
            await reload();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setStatus('');
        }
        finally {
            setAdding(false);
        }
    }, [adding, base, label, reload, url]);
    const act = useCallback(async (item, action) => {
        if (busyIdsRef.current.has(item.monitor_id))
            return;
        if (action === 'remove' && !window.confirm(`移除“${item.label || item.display_url}”的监控？历史版本不会删除。`))
            return;
        const key = `${item.monitor_id}:${action}`;
        let requestId = actionIds.current.get(key);
        if (requestId === undefined) {
            requestId = stableId();
            actionIds.current.set(key, requestId);
        }
        setMonitorBusy(item.monitor_id, true);
        setError('');
        setStatus(action === 'check' ? '正在检查正文变化…' : '');
        try {
            const checkResult = action === 'check'
                ? await checkWebMonitor(base, item.monitor_id, requestId)
                : null;
            if (action !== 'check')
                await setWebMonitorState(base, item.monitor_id, action);
            actionIds.current.delete(key);
            const historyWasOpen = expandedRef.current === item.monitor_id;
            if (action === 'check' && historyWasOpen) {
                setHistory(previous => {
                    const next = { ...previous };
                    delete next[item.monitor_id];
                    return next;
                });
                setHistoryErrors(previous => {
                    const next = { ...previous };
                    delete next[item.monitor_id];
                    return next;
                });
            }
            await reload();
            if (action === 'check' && historyWasOpen) {
                try {
                    const refreshed = await fetchWebMonitorHistory(base, item.monitor_id);
                    historySignatures.current.set(item.monitor_id, `${refreshed.monitor.current_version}:${refreshed.monitor.change_count}`);
                    setHistory(previous => ({ ...previous, [item.monitor_id]: refreshed }));
                    setHistoryErrors(previous => {
                        const next = { ...previous };
                        delete next[item.monitor_id];
                        return next;
                    });
                }
                catch (historyError) {
                    const message = historyError instanceof Error ? historyError.message : String(historyError);
                    setHistoryErrors(previous => ({ ...previous, [item.monitor_id]: message }));
                    setError('检查已完成，但版本列表刷新失败：' + message);
                }
            }
            if (action === 'check') {
                const checkStatus = checkResult?.status ?? '';
                if (checkStatus === 'changed')
                    setStatus('发现正文变化，已写入事件档案和消息。');
                else if (checkStatus === 'baseline')
                    setStatus('已建立正文基线。');
                else if (checkStatus === 'unchanged' || checkStatus === 'noise_only')
                    setStatus('检查完成，正文没有确认变化。');
                else if (checkStatus === 'retry_wait') {
                    setStatus('本次读取失败，系统会自动重试。');
                    setError(checkResult?.error || '本次读取失败，系统会自动重试。');
                }
                else if (checkStatus === 'failed') {
                    setStatus('本次检查失败，需要处理。');
                    setError(checkResult?.error || '本次检查失败，需要处理。');
                }
                else if (checkStatus === 'cancelled')
                    setStatus('本次检查已取消。');
                else {
                    setStatus('');
                    setError('检查结果状态未知，请刷新后查看。');
                }
            }
            else
                setStatus('');
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setStatus('');
        }
        finally {
            setMonitorBusy(item.monitor_id, false);
        }
    }, [base, history, reload, setMonitorBusy]);
    const toggleHistory = useCallback(async (item, force = false) => {
        const monitorId = item.monitor_id;
        if (busyIdsRef.current.has(monitorId))
            return;
        if (expandedRef.current === monitorId && !force) {
            const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1;
            historyLoadGenerations.current.set(monitorId, generation);
            expandedRef.current = '';
            setExpanded('');
            return;
        }
        expandedRef.current = monitorId;
        setExpanded(monitorId);
        const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1;
        historyLoadGenerations.current.set(monitorId, generation);
        historySignatures.current.delete(monitorId);
        setHistory(previous => {
            const next = { ...previous };
            delete next[monitorId];
            return next;
        });
        setHistoryErrors(previous => {
            const next = { ...previous };
            delete next[monitorId];
            return next;
        });
        setMonitorBusy(monitorId, true);
        try {
            const value = await fetchWebMonitorHistory(base, monitorId);
            if (historyLoadGenerations.current.get(monitorId) !== generation)
                return;
            historySignatures.current.set(monitorId, `${value.monitor.current_version}:${value.monitor.change_count}`);
            setHistory(previous => ({ ...previous, [monitorId]: value }));
        }
        catch (cause) {
            if (historyLoadGenerations.current.get(monitorId) !== generation)
                return;
            setHistoryErrors(previous => ({
                ...previous,
                [monitorId]: cause instanceof Error ? cause.message : String(cause),
            }));
        }
        finally {
            setMonitorBusy(monitorId, false);
        }
    }, [base, setMonitorBusy]);
    useEffect(() => {
        if (expanded === '' || items === null || busyIds.has(expanded))
            return;
        const item = items.find(row => row.monitor_id === expanded);
        const cached = history[expanded];
        if (item === undefined || cached === undefined)
            return;
        if (item.current_version > cached.monitor.current_version
            || item.change_count > cached.monitor.change_count) {
            void toggleHistory(item, true);
        }
    }, [busyIds, expanded, history, items, toggleHistory]);
    const totalChanges = items?.reduce((sum, item) => sum + item.change_count, 0) ?? 0;
    const attention = items?.filter(item => item.status === 'needs_attention' || item.status === 'retry_wait').length ?? 0;
    return (_jsxs("div", { className: css.monitoring, children: [_jsxs("div", { className: css.monitorIntro, children: [_jsx("strong", { children: "\u76EF\u4F4F\u53D8\u5316\uFF0C\u4E0D\u91CD\u590D\u8BFB\u6574\u7BC7" }), _jsx("span", { children: "\u6DFB\u52A0\u516C\u5F00\u7F51\u9875\u6216 PDF\uFF1B\u9996\u8F6E\u53EA\u5EFA\u57FA\u7EBF\uFF0C\u4E4B\u540E\u6B63\u6587\u771F\u53D8\u4E86\u624D\u8FDB\u5165\u4E8B\u4EF6\u6863\u6848\u3002" })] }), _jsxs("div", { className: css.monitorForm, children: [_jsx("input", { "aria-label": "\u7F51\u9875\u6216 PDF \u5730\u5740", placeholder: "\u7C98\u8D34\u516C\u5F00\u7F51\u9875\u6216 PDF \u5730\u5740", value: url, onChange: event => setUrl(event.currentTarget.value) }), _jsx("input", { "aria-label": "\u76D1\u63A7\u540D\u79F0", placeholder: "\u540D\u79F0\uFF08\u53EF\u4E0D\u586B\uFF09", value: label, onChange: event => setLabel(event.currentTarget.value) }), _jsx("button", { type: "button", disabled: adding || url.trim() === '', onClick: () => void add(), children: adding ? '建立中…' : '开始监控' })] }), _jsxs("div", { className: css.monitorStats, children: [items === null
                        ? _jsx("span", { children: "\u8BB0\u5F55\u5C1A\u672A\u8F7D\u5165" })
                        : _jsxs(_Fragment, { children: [_jsxs("span", { children: [items.length, " \u4E2A\u76D1\u63A7"] }), _jsxs("span", { children: [totalChanges, " \u6B21\u786E\u8BA4\u53D8\u5316"] }), _jsxs("span", { children: [attention, " \u4E2A\u5F85\u5904\u7406"] })] }), _jsx("button", { type: "button", disabled: adding, onClick: () => void reload(), children: "\u5237\u65B0" })] }), status !== '' ? _jsx("div", { className: css.monitorQuiet, children: status }) : null, error !== '' ? _jsx(ErrorNote, { text: error }) : null, items !== null && items.length === 0 ? _jsx(EmptyState, { text: "\u8FD8\u6CA1\u6709\u7F51\u9875\u76D1\u63A7\u3002\u5148\u6DFB\u52A0\u4E00\u4E2A\u7ECF\u5E38\u66F4\u65B0\u7684\u653F\u7B56\u9875\u3001\u516C\u544A\u9875\u6216 PDF\u3002" }) : null, items?.map(item => {
                const itemBusy = busyIds.has(item.monitor_id);
                const folded = history[item.monitor_id];
                const historyError = historyErrors[item.monitor_id] ?? '';
                return (_jsxs("div", { className: css.monitorCard, "data-status": item.status, children: [_jsxs("div", { className: css.monitorTop, children: [_jsx("span", { className: css.monitorState, children: monitorStatus(item.status) }), _jsxs("span", { className: css.monitorMetrics, children: ["V", item.current_version || '—', " \u00B7 ", item.change_count, " \u6B21\u53D8\u5316"] })] }), _jsx("div", { className: css.monitorTitle, children: item.label || item.display_url }), _jsx("div", { className: css.monitorUrl, children: item.display_url }), _jsxs("div", { className: css.monitorMeta, children: ["\u4E0A\u6B21\u6210\u529F\uFF1A", shortTime(item.last_success_at), " \u00B7 \u4E0B\u6B21\uFF1A", shortTime(item.next_check_at)] }), item.last_error !== '' ? _jsx("div", { className: css.monitorError, children: item.last_error }) : null, _jsxs("div", { className: css.monitorActions, children: [_jsx("button", { type: "button", disabled: itemBusy || item.status === 'paused', onClick: () => void act(item, 'check'), children: "\u7ACB\u5373\u68C0\u67E5" }), _jsx("button", { type: "button", disabled: itemBusy, onClick: () => void act(item, item.status === 'paused' ? 'resume' : 'pause'), children: item.status === 'paused' ? '继续' : '暂停' }), _jsx("button", { type: "button", disabled: itemBusy, onClick: () => void toggleHistory(item), children: expanded === item.monitor_id ? '收起版本' : '版本记录' }), _jsx("button", { type: "button", disabled: itemBusy, onClick: () => void act(item, 'remove'), children: "\u79FB\u9664" })] }), expanded === item.monitor_id
                            ? folded !== undefined
                                ? _jsx(MonitorHistoryFold, { history: folded })
                                : historyError !== ''
                                    ? _jsxs("div", { className: css.monitorHistoryError, children: [_jsx("span", { children: historyError }), _jsx("button", { type: "button", onClick: () => void toggleHistory(item, true), children: "\u91CD\u65B0\u8BFB\u53D6" })] })
                                    : _jsx("div", { className: css.monitorQuiet, children: "\u6B63\u5728\u8BFB\u53D6\u7248\u672C\u2026" })
                            : null] }, item.monitor_id));
            })] }));
}
export function LibraryView({ base }) {
    const [tab, setTab] = useState('watch_later');
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: css.subTabs, children: LIBRARY_TABS.map(row => (_jsx("button", { type: "button", className: css.subTab, "data-active": tab === row.key, onClick: () => setTab(row.key), children: row.label }, row.key))) }), tab === 'watch_later' ? _jsx(SavedList, { base: base, listKind: "watch_later" }, `later-${base}`) : null, tab === 'favorite' ? _jsx(SavedList, { base: base, listKind: "favorite" }, `favorite-${base}`) : null, tab === 'history' ? _jsx(HistoryList, { base: base }, `history-${base}`) : null, tab === 'monitoring' ? _jsx(WebMonitoringView, { base: base }, `monitoring-${base}`) : null] }));
}
//# sourceMappingURL=library.js.map