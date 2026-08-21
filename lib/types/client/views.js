import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Shared card pieces plus the 推荐 (recommend) view — mirroring the canonical
 * NewsClaw surfaces (mobile web + extension popup): header card with
 * 换一批, pool status chips, spotlight banner, recommendation cards with the
 * full action set (打开原文/喜欢/稍后读/收藏/不感兴趣/评论), and the
 * expandable activity footer.
 * @module @newsclaw/dsh-plugin
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { appendRecommendations, fetchActivityFeed, fetchNewsBootstrapStatus, fetchSpotlightBatch, fetchRuntimeStatus, fetchSavedStatus, fetchRecommendations, removeSaved, reportClick, reshuffleRecommendations, respondToSpotlight, saveItem, imageProxyCrossOrigin, imageProxyUrl, readApiBase, stableId, submitFeedback, } from "./api.js";
import { ClockIcon, StarIcon } from "./icons.js";
import css from './panel.module.css';
/** Canonical media display names for provider codes. */
export function mediaLabel(media) {
    const key = media.trim().toLowerCase();
    const labels = {
        cls: '财联社', yicai: '第一财经', eastmoney: '东方财富', '10jqka': '同花顺',
        wallstreetcn: '华尔街见闻', sina: '新浪财经', cctv: '央视新闻',
        xinhua: '新华网', caixin: '财新网', cs: '中证网', rss: 'RSS',
    };
    return labels[key] ?? (media || '未知媒体');
}
/** Format a raw count into a compact display number. */
export function formatCount(value) {
    if (value >= 1_000_000_000)
        return `${(value / 1_000_000_000).toFixed(1)}亿`;
    if (value >= 10_000)
        return `${(value / 10_000).toFixed(1)}万`;
    if (value >= 1_000)
        return `${(value / 1_000).toFixed(1)}k`;
    return String(value);
}
/**
 * Normalize a news card's identity and URLs for the local saved-list payload.
 * URLs must be absolute HTTP(S); protocol-relative cover URLs are promoted to
 * `https:` and malformed values are dropped.
 */
function normalizeSaveIdentity(item) {
    const asAbsoluteUrl = (url, promoteProtocolRelative) => {
        if (/^https?:\/\//i.test(url))
            return url;
        if (promoteProtocolRelative && /^\/\//.test(url))
            return `https:${url}`;
        return '';
    };
    const fallback = item.article_id !== '' ? item.article_id : item.item_key;
    return {
        article_id: fallback,
        original_url: asAbsoluteUrl(item.content_url, false),
        cover_url: asAbsoluteUrl(item.cover_url, true),
    };
}
/** Image with the shared backend proxy and a deterministic local fallback. */
function CoverImage(props) {
    const src = imageProxyUrl(props.base, props.url);
    const [failedSource, setFailedSource] = useState('');
    if (src === '' || failedSource === src)
        return _jsx(_Fragment, { children: props.fallback });
    return (_jsx("img", { className: props.className, src: src, alt: props.alt ?? '', loading: props.loading ?? 'lazy', decoding: "async", referrerPolicy: "no-referrer", crossOrigin: imageProxyCrossOrigin(props.base), onError: () => {
            setFailedSource(src);
            props.onError?.();
        } }));
}
/** Small cover thumbnail with an optional media corner label. */
export function Thumb(props) {
    const base = props.base ?? readApiBase();
    const media = (props.url !== ''
        ? _jsx(CoverImage, { base: base, url: props.url, className: css.thumb, fallback: _jsx("div", { className: css.thumbFallback, children: "\uD83D\uDCF0" }) })
        : _jsx("div", { className: css.thumbFallback, children: "\uD83D\uDCF0" }));
    if (props.media !== undefined && props.media !== '') {
        return (_jsxs("div", { className: css.coverWrap, children: [media, _jsx("span", { className: css.coverCorner, children: mediaLabel(props.media) })] }));
    }
    return media;
}
/** Media tag + publisher/time meta row. */
export function MetaRow(props) {
    const parts = [];
    if (props.media !== '')
        parts.push(_jsx("span", { children: mediaLabel(props.media) }, "m"));
    if (props.author !== undefined && props.author !== '')
        parts.push(_jsx("span", { children: props.author }, "a"));
    if (props.time !== undefined && props.time !== '')
        parts.push(_jsx("span", { children: formatTime(props.time) }, "t"));
    if (parts.length === 0)
        return null;
    return _jsx("div", { className: css.cardMeta, children: parts });
}
/** Compact timestamp formatter. */
export function formatTime(iso) {
    if (iso === '')
        return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return iso.slice(0, 10);
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 3_600_000)
        return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
    if (diff < 86_400_000)
        return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 2_592_000_000)
        return `${Math.floor(diff / 86_400_000)} 天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** Small action button. */
export function ActionButton(props) {
    return (_jsx("button", { type: "button", className: css.actionButton, "data-primary": props.primary === true || undefined, "data-danger": props.danger === true || undefined, disabled: props.disabled === true, title: props.title, onClick: props.onClick, children: props.label }));
}
/** Empty state line. */
export function EmptyState(props) {
    return _jsx("div", { className: css.empty, children: props.text });
}
/** Error note. */
export function ErrorNote(props) {
    return _jsx("div", { className: css.error, children: props.text });
}
/** Stable idempotency key per (item identity × action): reuse on retries only. */
export function useActionId(identity, action) {
    const ref = useRef(new Map());
    const key = `${identity}::${action}`;
    let id = ref.current.get(key);
    if (id === undefined) {
        id = stableId();
        ref.current.set(key, id);
    }
    return id;
}
/** Pending click ids survive an ambiguous timeout, so a user's retry is idempotent. */
const pendingClickIds = new Map();
/** Open a content URL immediately, then report whether the weak open signal persisted. */
export function openItem(base, item, onPersistError) {
    const url = item.content_url;
    if (url === '')
        return;
    const identity = `${item.recommendation_id ?? ''}:${item.article_id || item.content_id}:${url}`;
    const requestId = pendingClickIds.get(identity) ?? stableId();
    pendingClickIds.set(identity, requestId);
    void reportClick(base, {
        recommendation_id: item.recommendation_id,
        article_id: item.article_id !== '' ? item.article_id : item.content_id,
        content_url: item.content_url,
        media: item.media,
        title: item.title,
        request_id: requestId,
    }).then(() => {
        if (pendingClickIds.get(identity) === requestId)
            pendingClickIds.delete(identity);
    }).catch(error => {
        // Reading the original article remains available during degradation, but
        // the user must know that this learning signal was not confirmed.
        onPersistError?.(error);
    });
    window.open(url, '_blank', 'noopener');
}
/** Pool status chips, mirroring the popup's getPoolStatusSummary language. */
function poolStatus(status) {
    if (status === null)
        return [];
    const available = status.pool_available_count;
    const replenished = typeof status.last_replenished_count === 'number' ? status.last_replenished_count : 0;
    const pending = status.pool_pending_count;
    return [
        { label: '候选池', value: `${available} 条可推荐` },
        { label: '处理中', value: `${pending} 条` },
        { label: '本轮新增', value: `${replenished} 条` },
    ];
}
/** One recommendation card (canonical action set incl. comment composer). */
function RecommendationCard({ base, item, onDismissed, onError }) {
    const likeId = useActionId(String(item.id), 'like');
    const dislikeId = useActionId(String(item.id), 'dislike');
    const dismissId = useActionId(String(item.id), 'dismiss');
    const [busy, setBusy] = useState(null);
    const [status, setStatus] = useState('');
    const [statusTone, setStatusTone] = useState('info');
    const [comment, setComment] = useState('');
    const [composerOpen, setComposerOpen] = useState(false);
    const [saved, setSaved] = useState(null);
    const commentIds = useRef(new Map());
    // Saved toggle state for this card.
    useEffect(() => {
        let cancelled = false;
        const key = item.item_key !== '' ? item.item_key : item.article_id;
        if (key === '')
            return;
        setSaved(null);
        void Promise.all([
            fetchSavedStatus(base, 'favorite', key),
            fetchSavedStatus(base, 'watch_later', key),
        ]).then(([favorite, watch_later]) => {
            if (!cancelled)
                setSaved({ favorite, watch_later });
        }).catch(err => {
            if (!cancelled) {
                setSaved(null);
                setStatus('收藏状态读取失败：' + (err instanceof Error ? err.message : String(err)));
                setStatusTone('error');
            }
        });
        return () => { cancelled = true; };
    }, [base, item.item_key, item.article_id]);
    const act = useCallback(async (action, run, done = '', doneTone = 'info') => {
        setBusy(action);
        setStatus('提交中…');
        setStatusTone('info');
        try {
            await run();
            setStatus(done);
            setStatusTone(doneTone);
        }
        catch (err) {
            setStatus('没记上：' + (err instanceof Error ? err.message : String(err)));
            setStatusTone('error');
        }
        finally {
            setBusy(null);
        }
    }, []);
    const feedback = (type, requestId, done) => (submitFeedback(base, { recommendation_id: item.id, feedback_type: type, request_id: requestId }).then(() => {
        setStatus(done);
    }));
    const toggleSave = (listKind) => {
        const key = item.item_key !== '' ? item.item_key : item.article_id;
        const currently = saved?.[listKind] === true;
        const run = async () => {
            if (currently)
                await removeSaved(base, listKind, key);
            else {
                await saveItem(base, listKind, {
                    media: item.media,
                    ...normalizeSaveIdentity(item),
                    title: item.title,
                    author_name: item.publisher_name,
                });
            }
            setSaved(prev => prev === null ? prev : ({ ...prev, [listKind]: !currently }));
        };
        return run();
    };
    const submitComment = () => {
        const note = comment.trim();
        if (note === '')
            return;
        let commentId = commentIds.current.get(note);
        if (commentId === undefined) {
            commentId = stableId();
            commentIds.current.set(note, commentId);
        }
        void act('comment', async () => {
            await submitFeedback(base, { recommendation_id: item.id, feedback_type: 'comment', note, request_id: commentId });
            commentIds.current.delete(note);
            setComment('');
        }, '评论已记下。', 'success');
    };
    const anyBusy = busy !== null;
    const key = item.item_key !== '' ? item.item_key : item.article_id;
    const isText = item.cover_url === '';
    const open = () => {
        openItem(base, {
            recommendation_id: item.id,
            content_id: item.content_id,
            article_id: item.article_id,
            content_url: item.content_url,
            media: item.media,
            title: item.title,
        }, err => {
            setStatus('原文已打开，但阅读记录未确认保存：' + (err instanceof Error ? err.message : String(err)));
            setStatusTone('error');
        });
    };
    return (_jsxs("div", { className: css.recCard, children: [_jsxs("button", { type: "button", className: css.recCover, onClick: open, "aria-label": item.title, children: [!isText && item.cover_url !== ''
                        ? _jsx(CoverImage, { base: base, url: item.cover_url, fallback: _jsx("span", { className: css.recCoverText, children: item.title || item.body_text || '封面暂时加载失败' }) })
                        : _jsx("span", { className: css.recCoverText, children: isText && item.body_text !== '' ? item.body_text : item.title }), _jsx("span", { className: css.coverCorner, children: mediaLabel(item.media) })] }), _jsxs("div", { className: css.recBody, children: [_jsxs("div", { className: css.badgeRow, children: [item.topic_label !== '' ? _jsx("span", { className: css.topicBadge, children: item.topic_label }) : null, _jsx("span", { className: css.stateBadge, children: item.body_level === 'title' ? '标题级信息' : item.presented ? '已展示' : '新抓到' })] }), _jsx("div", { className: css.recTitle, children: item.title !== '' ? item.title : (item.body_text !== '' ? item.body_text.slice(0, 80) : item.article_id) }), item.why_for_you !== '' ? _jsxs("div", { className: css.expression, children: ["\u4E3A\u4EC0\u4E48\u9002\u5408\u4F60\uFF1A", item.why_for_you] }) : null, item.impact_chain.length > 0 ? _jsxs("div", { className: css.expression, children: ["\u53EF\u80FD\u5F71\u54CD\u94FE\uFF1A", item.impact_chain.join(' → ')] }) : null, item.observation_points.length > 0 ? _jsxs("div", { className: css.expression, children: ["\u540E\u7EED\u89C2\u5BDF\uFF1A", item.observation_points.join('；')] }) : null, _jsx(MetaRow, { media: item.media, author: item.publisher_name || item.technical_provider, time: item.published_label || item.published_at }), _jsxs("div", { className: css.cardActions, children: [_jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: anyBusy || item.original_url === '', onClick: open }), _jsx(ActionButton, { label: "\u559C\u6B22", disabled: anyBusy, onClick: () => void act('like', () => feedback('like', likeId, '记下了，这类新闻可以多来点。'), '记下了，这类新闻可以多来点。', 'success') }), _jsx("button", { type: "button", className: `${css.savedToggle} ${css.watchToggle}`, "data-pressed": saved?.watch_later === true, "aria-pressed": saved?.watch_later === true, title: "\u7A0D\u540E\u8BFB", disabled: anyBusy || saved === null, onClick: () => void act('watch_later', () => toggleSave('watch_later')), children: _jsx(ClockIcon, { size: 14 }) }), _jsx("button", { type: "button", className: `${css.savedToggle} ${css.starToggle}`, "data-pressed": saved?.favorite === true, "aria-pressed": saved?.favorite === true, title: "\u6536\u85CF", disabled: anyBusy || saved === null, onClick: () => void act('favorite', () => toggleSave('favorite')), children: _jsx(StarIcon, { size: 14 }) }), _jsx(ActionButton, { label: "\u4E0D\u611F\u5174\u8DA3", danger: true, disabled: anyBusy, onClick: () => void act('dislike', () => feedback('dislike', dislikeId, '记下了，这类新闻先少来点。'), '记下了，这类新闻先少来点。', 'success') }), _jsx(ActionButton, { label: "\u5FFD\u7565", disabled: anyBusy, onClick: () => void act('ignore', () => feedback('ignore', dismissId, '已移出推荐。').then(() => { onDismissed(item.id); }), '已移出推荐。', 'success') }), _jsx(ActionButton, { label: composerOpen ? '收起' : '说说原因', disabled: anyBusy, onClick: () => setComposerOpen(open => !open) })] }), composerOpen ? (_jsxs("div", { className: css.commentComposer, children: [_jsx("textarea", { rows: 3, placeholder: "\u5199\u4E00\u53E5\u4E3A\u4EC0\u4E48\u8FD9\u6761\u65B0\u95FB\u5BF9\u4F60\u6709\u7528\uFF0C\u6216\u54EA\u91CC\u4E0D\u7B26\u5408\u9700\u8981", value: comment, disabled: anyBusy, onChange: event => setComment(event.target.value) }), _jsx(ActionButton, { label: "\u53D1\u9001", primary: true, disabled: anyBusy || comment.trim() === '', onClick: submitComment })] })) : null, status !== '' ? _jsx("div", { className: css.feedbackStatus, "data-tone": statusTone, children: status }) : null] }), _jsx("span", { style: { display: 'none' }, children: key })] }));
}
/** Spotlight banner — popup structure: collapsed row (16:9 thumb + kicker pills
 *  + clamped title + chevron) with a right-edge × column; clicking the row
 *  expands the body (reason + actions + chat composer). */
function SpotlightBanner(props) {
    const { base, onError } = props;
    const [queue, setQueue] = useState(null);
    const [index, setIndex] = useState(0);
    const [expanded, setExpanded] = useState(true);
    const [composerOpen, setComposerOpen] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [chatStatus, setChatStatus] = useState('');
    const [busy, setBusy] = useState('');
    const [reaction, setReaction] = useState(null);
    const [saved, setSaved] = useState(null);
    const [failedCoverKey, setFailedCoverKey] = useState('');
    const actionIds = useRef(new Map());
    const reload = useCallback(async () => {
        try {
            const items = await fetchSpotlightBatch(base);
            setQueue(items);
            setIndex(0);
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
    }, [base, onError]);
    useEffect(() => { void reload(); }, [reload]);
    const item = queue === null ? null : queue[Math.min(index, queue.length - 1)];
    // Saved toggle state for the current spotlight.
    useEffect(() => {
        let cancelled = false;
        if (item === undefined || item === null)
            return;
        const key = item.item_key !== '' ? item.item_key : item.article_id;
        if (key === '')
            return;
        setSaved(null);
        void Promise.all([
            fetchSavedStatus(base, 'favorite', key),
            fetchSavedStatus(base, 'watch_later', key),
        ]).then(([favorite, watch_later]) => {
            if (!cancelled)
                setSaved({ favorite, watch_later });
        }).catch(err => {
            if (!cancelled) {
                setSaved(null);
                onError('收藏状态读取失败：' + (err instanceof Error ? err.message : String(err)));
            }
        });
        return () => { cancelled = true; };
    }, [base, item]);
    const respond = useCallback(async (target, response, message = '') => {
        setBusy(response);
        try {
            const key = `${target.article_id}:${response}:${message}`;
            let request_id = actionIds.current.get(key);
            if (request_id === undefined) {
                request_id = stableId();
                actionIds.current.set(key, request_id);
            }
            await respondToSpotlight(base, { article_id: target.article_id, response, title: target.title, message, request_id });
            if (response === 'ignore') {
                setQueue(prev => (prev ?? []).filter(candidate => candidate.article_id !== target.article_id));
                setExpanded(false);
            }
            else if (response === 'like') {
                setReaction({ kind: 'like', text: '已记下，这类惊喜多来点。' });
            }
            else if (response === 'dislike') {
                setReaction({ kind: 'dislike', text: '记下了，这类惊喜先少来点。' });
            }
            else if (response === 'open') {
                setReaction({ kind: 'open', text: '已记录打开。' });
            }
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, onError]);
    const toggleSave = useCallback(async (listKind) => {
        if (item === undefined || item === null)
            return;
        const key = item.item_key !== '' ? item.item_key : item.article_id;
        const currently = saved?.[listKind] === true;
        setBusy(listKind);
        try {
            if (currently)
                await removeSaved(base, listKind, key);
            else {
                await saveItem(base, listKind, {
                    media: item.media,
                    ...normalizeSaveIdentity(item),
                    title: item.title,
                });
            }
            setSaved(prev => prev === null ? prev : ({ ...prev, [listKind]: !currently }));
            setReaction({ kind: listKind, text: currently ? '已从列表移除。' : (listKind === 'favorite' ? '已收藏。' : '已加入稍后读。') });
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, item, onError, saved]);
    const sendChat = useCallback(async () => {
        if (item === undefined || item === null)
            return;
        const message = chatDraft.trim();
        if (message === '')
            return;
        setBusy('chat');
        setChatStatus('');
        try {
            const key = `${item.article_id}:chat:${message}`;
            let request_id = actionIds.current.get(key);
            if (request_id === undefined) {
                request_id = stableId();
                actionIds.current.set(key, request_id);
            }
            await respondToSpotlight(base, { article_id: item.article_id, response: 'chat', title: item.title, message, request_id });
            actionIds.current.delete(key);
            setChatDraft('');
            setChatStatus('已转达给新闻爪，它会继续追问和学习。');
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, chatDraft, item, onError]);
    if (queue === null)
        return null;
    if (queue.length === 0)
        return null;
    if (item === undefined || item === null)
        return null;
    const anyBusy = busy !== '';
    const isText = item.cover_url === '';
    const coverKey = `${item.item_key}:${item.article_id}:${item.cover_url}`;
    const coverFailed = failedCoverKey === coverKey;
    const open = () => {
        // `view` only marks the spotlight card seen; openItem records the single
        // weak article-open learning signal. Using `open` here as well would
        // double-count the click under two request ids.
        void respond(item, 'view');
        openItem(base, {
            recommendation_id: undefined,
            content_id: item.content_id !== '' ? item.content_id : item.article_id,
            article_id: item.article_id,
            content_url: item.content_url,
            media: item.media,
            title: item.title,
        }, err => {
            onError('原文已打开，但阅读记录未确认保存：' + (err instanceof Error ? err.message : String(err)));
        });
    };
    return (_jsxs("div", { className: css.spotlightCard, "data-expanded": expanded, children: [_jsxs("div", { className: css.spotlightHeader, children: [_jsx("span", { className: css.spotlightKicker, children: "\u2728 \u60CA\u559C\u63A8\u8350" }), _jsx("span", { className: css.spotlightMedia, children: mediaLabel(item.media) }), _jsx("span", { className: css.spacer }), queue.length > 1 ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.spotlightNav, title: "\u4E0A\u4E00\u6761", disabled: index <= 0 || anyBusy, onClick: () => { setIndex(i => Math.max(0, i - 1)); setReaction(null); }, children: "\u2039" }), _jsxs("span", { className: css.spotlightCounter, children: [index + 1, "/", queue.length] }), _jsx("button", { type: "button", className: css.spotlightNav, title: "\u4E0B\u4E00\u6761", disabled: index >= queue.length - 1 || anyBusy, onClick: () => { setIndex(i => Math.min(queue.length - 1, i + 1)); setReaction(null); }, children: "\u203A" })] })) : null, _jsx("button", { type: "button", className: css.spotlightDismiss, title: "\u5FFD\u7565\u5E76\u4E0D\u518D\u63A8\u8350", disabled: anyBusy, onClick: () => void respond(item, 'ignore'), children: "\u00D7" })] }), _jsxs("button", { type: "button", className: css.spotlightMain, onClick: () => setExpanded(v => !v), "aria-expanded": expanded, children: [_jsxs("span", { className: css.spotlightCover, children: [item.cover_url !== ''
                                ? _jsx(CoverImage, { base: base, url: item.cover_url, className: css.spotlightHero, fallback: _jsx("span", { className: css.spotlightHeroFallback, children: isText && item.body_text !== '' ? item.body_text.slice(0, 120) : '✨' }), onError: () => setFailedCoverKey(coverKey) })
                                : _jsx("span", { className: css.spotlightHeroFallback, children: isText && item.body_text !== '' ? item.body_text.slice(0, 120) : '✨' }), _jsx("span", { className: css.spotlightCoverScrim, "aria-hidden": "true" }), !coverFailed && item.cover_url !== '' && item.spotlight_score > 0 ? (_jsxs("span", { className: css.spotlightScorePill, children: ["\uD83D\uDC97 ", Math.round(item.spotlight_score * 100), "% \u5339\u914D"] })) : null] }), _jsxs("span", { className: css.spotlightTitleWrap, children: [_jsx("span", { className: css.spotlightTitle, children: item.title !== '' ? item.title : (item.body_text !== '' ? item.body_text.slice(0, 80) : item.article_id) }), _jsx("span", { className: css.spotlightChevron, "aria-hidden": "true", children: expanded ? '▾' : '▸' })] })] }), expanded ? (_jsxs("div", { className: css.spotlightBody, children: [item.spotlight_reason !== '' ? (_jsxs("div", { className: css.spotlightReason, children: [_jsxs("span", { className: css.spotlightScore, children: [Math.round(item.spotlight_score * 100), "%"] }), " \u00B7 ", item.spotlight_reason] })) : null, item.body_level === 'title' ? _jsx("div", { className: css.hint, children: "\u6807\u9898\u7EA7\u4FE1\u606F" }) : null, item.impact_chain.length > 0 ? _jsxs("div", { className: css.expression, children: ["\u53EF\u80FD\u5F71\u54CD\u94FE\uFF1A", item.impact_chain.join(' → ')] }) : null, item.observation_points.length > 0 ? _jsxs("div", { className: css.expression, children: ["\u540E\u7EED\u89C2\u5BDF\uFF1A", item.observation_points.join('；')] }) : null, _jsxs("div", { className: css.spotlightActions, children: [_jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: anyBusy || item.original_url === '', onClick: open }), _jsx(ActionButton, { label: reaction?.kind === 'like' ? '已喜欢' : '喜欢', primary: reaction?.kind === 'like', disabled: anyBusy || reaction?.kind === 'like', onClick: () => void respond(item, 'like') }), _jsx(ActionButton, { label: saved?.watch_later === true ? '已稍后读' : '稍后读', disabled: anyBusy || saved === null, onClick: () => void toggleSave('watch_later') }), _jsx(ActionButton, { label: saved?.favorite === true ? '已收藏' : '收藏', disabled: anyBusy || saved === null, onClick: () => void toggleSave('favorite') }), _jsx(ActionButton, { label: "\u4E0D\u611F\u5174\u8DA3", danger: true, disabled: anyBusy, onClick: () => void respond(item, 'dislike') }), _jsx(ActionButton, { label: composerOpen ? '收起' : '聊一聊', disabled: anyBusy, onClick: () => setComposerOpen(v => !v) })] }), composerOpen ? (_jsxs("div", { className: css.spotlightComposer, children: [_jsx("textarea", { className: css.chatInput, rows: 2, placeholder: "\u8BF4\u8BF4\u4F60\u4E3A\u4EC0\u4E48\u60F3\u70B9\u5F00\uFF0C\u6216\u8005\u54EA\u91CC\u8FD8\u62FF\u4E0D\u51C6", value: chatDraft, disabled: anyBusy, onChange: event => setChatDraft(event.target.value) }), _jsx("button", { type: "button", className: css.chatSend, disabled: anyBusy || chatDraft.trim() === '', onClick: () => void sendChat(), children: "\u53D1\u9001" })] })) : null, chatStatus !== '' ? _jsx("div", { className: css.feedbackStatus, children: chatStatus }) : null, reaction !== null ? (_jsx("div", { className: css.feedbackStatus, "data-tone": reaction.kind === 'dislike' ? 'error' : 'success', children: reaction.text })) : null] })) : null] }));
}
// ── activity footer ────────────────────────────────────────────────────
/** Activity footer — popup-style: collapsed line (summary + headline) with a
 *  更多/收起 toggle; expanded rows are footer-item cards with a kind pill,
 *  time and summary, plus a dashed load-more button. */
export function ActivityFooter(props) {
    const { base } = props;
    const [feed, setFeed] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {
        setError('');
        try {
            setFeed(await fetchActivityFeed(base, { limit: 5 }));
        }
        catch (err) {
            setFeed(null);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [base]);
    useEffect(() => { void reload(); }, [reload]);
    const loadMore = useCallback(async () => {
        if (feed === null || !feed.hasMore || loadingMore)
            return;
        setLoadingMore(true);
        setError('');
        try {
            const next = await fetchActivityFeed(base, { limit: 5, before: feed.nextCursor });
            setFeed(prev => prev === null ? next : {
                ...next,
                items: [...prev.items, ...next.items],
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setLoadingMore(false);
        }
    }, [base, feed, loadingMore]);
    if (feed === null)
        return error === '' ? null : _jsx(ErrorNote, { text: `后台动态读取失败：${error}` });
    if (feed.items.length === 0 && feed.liveSummary === '' && feed.headline === '')
        return null;
    const summaryOf = (item) => {
        if (typeof item.summary === 'string' && item.summary !== '')
            return item.summary;
        const kind = typeof item.kind === 'string' ? item.kind : '';
        return kind !== '' ? kind.replace(/[._]/g, ' ') : JSON.stringify(item).slice(0, 120);
    };
    const kindOf = (item) => (typeof item.kind === 'string' && item.kind !== '' ? item.kind : '动态');
    return (_jsxs("div", { className: css.activityFooter, children: [_jsxs("div", { className: css.footerHead, children: [_jsxs("div", { className: css.footerCopy, children: [_jsx("p", { className: css.footerHint, children: feed.liveSummary !== '' ? feed.liveSummary : '新闻爪正在替你留意新信息。' }), _jsx("p", { className: css.footerHeadline, children: feed.headline !== '' ? feed.headline : '最近还没新动静，先多刷一阵。' })] }), feed.items.length > 0 ? (_jsx("button", { type: "button", className: css.footerToggle, "aria-expanded": expanded, onClick: () => setExpanded(v => !v), children: expanded ? '收起' : '更多' })) : null] }), error !== '' ? _jsx(ErrorNote, { text: `加载更多失败：${error}` }) : null, expanded && feed.items.length > 0 ? (_jsxs("div", { className: css.footerHistory, children: [feed.items.map((item, i) => (_jsxs("div", { className: css.footerItem, children: [_jsxs("div", { className: css.footerItemMeta, children: [_jsx("span", { className: css.footerItemKind, children: kindOf(item) }), _jsx("span", { children: typeof item.occurred_at === 'string' && item.occurred_at !== '' ? formatTime(item.occurred_at) : '' })] }), _jsx("div", { className: css.footerItemSummary, children: summaryOf(item) })] }, String(item.id ?? i)))), feed.hasMore ? _jsx(ActionButton, { label: "\u52A0\u8F7D\u66F4\u591A", disabled: loadingMore, onClick: () => void loadMore() }) : null] })) : null] }));
}
/** Read-only first-setup handoff. DSH never force-rebuilds an existing profile. */
function InitPrompt(props) {
    const { base, status, onRefresh, busy } = props;
    const failed = status.status === 'failed';
    const running = status.running || status.status === 'running';
    return (_jsxs("div", { className: css.initPrompt, children: [_jsxs("div", { className: css.initPromptCopy, children: [_jsx("strong", { children: running ? '首次设置正在进行' : failed ? '首次设置需要重试' : '先完成新闻爪首次设置' }), _jsx("span", { children: running ? '新闻爪正在抓取首批真实新闻并建立画像。' : '兴趣方向与数据源需要在电脑版填写；已有画像不会被这里重建。' }), status.detail !== '' ? _jsx("span", { className: css.initPromptStatus, role: "status", children: status.detail }) : null] }), running
                ? _jsx(ActionButton, { label: busy ? '刷新中…' : '刷新进度', primary: true, disabled: busy, onClick: onRefresh })
                : _jsx(ActionButton, { label: failed ? '去电脑版检查并重试' : '去电脑版完成首次设置', primary: true, onClick: () => { window.open(`${base}/web`, '_blank', 'noopener'); } })] }));
}
/** 推荐 tab: header + pool status + spotlight + recommendation cards + activity. */
export function RecommendView(props) {
    const { base, refreshKey } = props;
    const [items, setItems] = useState(null);
    const [status, setStatus] = useState(null);
    const [bootstrap, setBootstrap] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [excluded, setExcluded] = useState([]);
    const reload = useCallback(async () => {
        setBusy('refresh');
        setError('');
        const [recs, runtime, bootstrapState] = await Promise.allSettled([
            fetchRecommendations(base),
            fetchRuntimeStatus(base),
            fetchNewsBootstrapStatus(base),
        ]);
        if (recs.status === 'fulfilled') {
            setItems(recs.value);
            setExcluded([]);
        }
        else {
            setError(recs.reason instanceof Error ? recs.reason.message : String(recs.reason));
        }
        if (runtime.status === 'fulfilled')
            setStatus(runtime.value);
        if (bootstrapState.status === 'fulfilled')
            setBootstrap(bootstrapState.value);
        const auxiliaryFailures = [runtime, bootstrapState].filter(result => result.status === 'rejected').length;
        if (recs.status === 'fulfilled' && auxiliaryFailures > 0)
            setError('推荐已刷新，但部分运行状态读取失败；请稍后再试。');
        setBusy('');
    }, [base]);
    useEffect(() => { void reload(); }, [reload]);
    const run = useCallback(async (label, action) => {
        setBusy(label);
        setError('');
        try {
            const next = await action();
            setItems(next);
            setExcluded([]);
            await fetchRuntimeStatus(base).then(setStatus).catch(() => {
                setError('内容已更新，但运行状态暂时读取失败。');
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base]);
    const visibleIds = items?.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean) ?? [];
    const excludeAll = [...excluded, ...visibleIds];
    const [exhausted, setExhausted] = useState(false);
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
    const sentinelRef = useRef(null);
    const [appendBlocked, setAppendBlocked] = useState(false);
    const appendMore = useCallback(async () => {
        if (items === null || busy !== '' || exhausted || appendBlocked)
            return;
        setBusy('append-auto');
        setError('');
        try {
            const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean)] });
            if (next.length === 0)
                setExhausted(true);
            else {
                setItems(prev => [...(prev ?? []), ...next]);
                setExcluded(prev => [...prev, ...items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean)]);
            }
            await fetchRuntimeStatus(base).then(setStatus).catch(() => {
                setError('新闻已追加，但运行状态暂时读取失败。');
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setAppendBlocked(true);
        }
        finally {
            setBusy('');
        }
    }, [base, busy, exhausted, appendBlocked, items, excluded]);
    const appendManual = useCallback(async () => {
        if (items === null || busy !== '')
            return;
        setBusy('append');
        setError('');
        try {
            const currentIds = items.map(item => item.item_key !== '' ? item.item_key : item.article_id).filter(Boolean);
            const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...currentIds] });
            if (next.length === 0) {
                setExhausted(true);
            }
            else {
                const seen = new Set(currentIds);
                const fresh = next.filter(item => {
                    const key = item.item_key !== '' ? item.item_key : item.article_id;
                    if (key === '' || seen.has(key))
                        return false;
                    seen.add(key);
                    return true;
                });
                if (fresh.length === 0)
                    setExhausted(true);
                else {
                    setItems(prev => [...(prev ?? []), ...fresh]);
                    setExcluded(prev => [...prev, ...currentIds]);
                    setExhausted(false);
                }
            }
            await fetchRuntimeStatus(base).then(setStatus).catch(() => {
                setError('新闻已追加，但运行状态暂时读取失败。');
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, busy, excluded, items]);
    const appendMoreRef = useRef(async () => undefined);
    appendMoreRef.current = appendMore;
    useEffect(() => {
        const el = sentinelRef.current;
        if (el === null)
            return;
        // The panel scrolls in its own container (`.body`), so that container must
        // be the observer root — a viewport root's margin is clipped by it.
        const root = el.parentElement;
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting)
                    void appendMoreRef.current();
            }
        }, { root, rootMargin: '800px 0px 800px 0px' });
        observer.observe(el);
        return () => { observer.disconnect(); };
    }, []);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.recHeader, children: [_jsxs("div", { className: css.recHeaderCopy, children: [_jsx("div", { className: css.recKicker, children: "For You" }), _jsx("div", { className: css.recHeaderTitle, children: "\u4ECA\u5929\u503C\u5F97\u4F60\u7406\u89E3\u7684\u65B0\u95FB" }), status !== null ? (_jsx("div", { className: css.poolChips, children: poolStatus(status).map(chip => (_jsxs("div", { className: css.poolChip, children: [_jsx("span", { className: css.poolChipLabel, children: chip.label }), _jsx("span", { className: css.poolChipValue, children: chip.value })] }, chip.label))) })) : null] }), _jsxs("div", { className: css.recHeaderActions, children: [_jsx(ActionButton, { label: "\u5237\u65B0", disabled: busy !== '', onClick: () => { setExhausted(false); setAppendBlocked(false); void reload(); } }), _jsx(ActionButton, { label: "\u6362\u4E00\u6279", disabled: busy !== '', onClick: () => { setExhausted(false); setAppendBlocked(false); void run('reshuffle', () => reshuffleRecommendations(base, { excludedArticleIds: excludeAll })); } })] })] }), error !== '' ? _jsx(ErrorNote, { text: error }) : null, bootstrap !== null && !bootstrap.profile_ready ? _jsx(InitPrompt, { base: base, status: bootstrap, onRefresh: () => void reload(), busy: busy !== '' }) : null, _jsx(SpotlightBanner, { base: base, onError: setError }, `spotlight-${refreshKey}`), items !== null && items.length === 0
                ? _jsx(EmptyState, { text: "\u63A8\u8350\u6C60\u6682\u65F6\u4E3A\u7A7A\u3002\u53EF\u4EE5\u5148\u5B8C\u6210\u9996\u6B21\u8BBE\u7F6E\uFF0C\u6216\u7B49\u65B0\u95FB\u6E90\u4E0B\u4E00\u8F6E\u5237\u65B0\u3002" })
                : null, items?.map(item => (_jsx(RecommendationCard, { base: base, item: item, onDismissed: id => setItems(prev => (prev ?? []).filter(card => card.id !== id)), onError: setError }, item.id))), items !== null && items.length > 0 ? (_jsxs("div", { className: css.cardActions, children: [_jsx(ActionButton, { label: "\u8FFD\u52A0\u4E00\u6279", disabled: busy !== '' || exhausted, onClick: () => { setAppendBlocked(false); void appendManual(); } }), _jsx(ActionButton, { label: "\u5237\u65B0", disabled: busy !== '', onClick: () => { setExhausted(false); setAppendBlocked(false); void reload(); } })] })) : null, exhausted ? _jsx("div", { className: css.hint, style: { textAlign: 'center' }, children: "\u8FD9\u6C60\u5148\u7FFB\u5230\u5934\u4E86\uFF0C\u540E\u53F0\u8FD8\u5728\u7EE7\u7EED\u8865\u8D27\u3002" }) : null, busy === 'append-auto' || busy === 'append' ? (_jsxs("div", { className: css.loadingRow, role: "status", children: [_jsx("span", { className: css.spinner, "aria-hidden": "true" }), "\u6B63\u5728\u52A0\u8F7D\u4E0B\u4E00\u6279\u2026"] })) : null, _jsx("div", { ref: sentinelRef, style: { height: 2 }, "aria-hidden": "true" })] }));
}
//# sourceMappingURL=views.js.map