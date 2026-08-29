import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 消息 drawer — the same message system as the mobile web's messages overlay:
 * probe notifications (interest / avoidance / challenge) with the four-state
 * actions, spotlight surprise messages, and pending notification
 * recommendations. Badge = probe + spotlight + notification count.
 * @module @newsclaw/dsh-plugin
 */
import { useCallback, useState } from 'react';
import { acknowledgeNotification, actOnWebMonitorNotification, fetchAvoidanceProbes, fetchSpotlightBatch, fetchInterestProbes, fetchPendingNotification, fetchWebMonitorNotifications, respondAvoidanceProbe, respondInterestProbe, respondToSpotlight, stableId, } from "./api.js";
import { ActionButton, openItem } from "./views.js";
import { MessageIcon, CloseIcon, SearchIcon } from "./icons.js";
import css from './panel.module.css';
/** Canonical probe action sets (same labels as the mobile web). */
const INTEREST_ACTIONS = [
    { action: 'confirm', label: '确认喜欢', primary: true },
    { action: 'defer', label: '暂时搁置', primary: false },
    { action: 'reject', label: '确认不喜欢', primary: false },
];
const AVOIDANCE_ACTIONS = [
    { action: 'confirm', label: '确认避雷', primary: true },
    { action: 'defer', label: '搁置避雷', primary: false },
    { action: 'reject', label: '不是雷点', primary: false },
];
/** Dedupe helpers (same key scheme as probe-notification-helpers.js). */
export function probeKey(type, domain) {
    const normalized = domain.trim().toLowerCase();
    return normalized === '' ? '' : `${type.startsWith('avoidance.') ? 'avoidance.probe' : 'interest.probe'}:${normalized}`;
}
/** One probe message card with inline actions. */
function ProbeMessage(props) {
    const { base, notice, onHandled, onError } = props;
    const [busy, setBusy] = useState('');
    const [requestIds] = useState(() => ({ confirm: stableId(), reject: stableId(), defer: stableId(), chat: stableId() }));
    const isAvoidance = notice.type === 'avoidance.probe';
    const tone = isAvoidance ? 'avoidance' : notice.challenge ? 'challenge' : 'interest';
    const actions = isAvoidance ? AVOIDANCE_ACTIONS : INTEREST_ACTIONS;
    const prompt = isAvoidance
        ? '想少看这类，就确认这是雷点；如果猜错了，点不是。'
        : notice.challenge
            ? '这是挑战方向，会把口味往侧边推一点；想继续试探就点喜欢，不准就点不喜欢。'
            : '想继续探索这个方向，就点喜欢；不准就点不喜欢。';
    const answer = useCallback(async (action) => {
        setBusy(action);
        try {
            const request_id = requestIds[action] ?? stableId();
            if (isAvoidance)
                await respondAvoidanceProbe(base, { domain: notice.domain, response: action, request_id });
            else
                await respondInterestProbe(base, { domain: notice.domain, response: action, request_id });
            onHandled(notice.key);
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, isAvoidance, notice.domain, notice.key, onError, onHandled, requestIds]);
    return (_jsxs("div", { className: css.messageCard, "data-tone": tone, children: [_jsxs("div", { className: css.messageType, children: [_jsx(SearchIcon, {}), isAvoidance ? '避雷确认' : notice.challenge ? '挑战探针' : '兴趣探测'] }), _jsx("div", { className: css.messagePrompt, children: prompt }), _jsx("div", { className: css.messageTitle, children: notice.domain }), notice.reason !== '' ? _jsx("div", { className: css.messageBody, children: notice.reason }) : null, _jsx("div", { className: css.messageActions, children: actions.map(entry => (_jsx(ActionButton, { label: entry.label, primary: entry.primary, disabled: busy !== '', onClick: () => void answer(entry.action) }, entry.action))) })] }));
}
/** One spotlight message card. */
function SpotlightMessage(props) {
    const { base, notice, onHandled, onError } = props;
    const [busy, setBusy] = useState('');
    const [requestIds] = useState(() => ({ view: stableId(), like: stableId(), dislike: stableId(), ignore: stableId(), chat: stableId() }));
    const act = useCallback(async (response) => {
        setBusy(response);
        try {
            await respondToSpotlight(base, { article_id: notice.article_id, response, title: notice.title, request_id: requestIds[response] ?? stableId() });
            onHandled(notice.article_id);
        }
        catch (err) {
            onError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy('');
        }
    }, [base, notice.article_id, notice.title, onError, onHandled, requestIds]);
    return (_jsxs("div", { className: css.messageCard, "data-tone": "spotlight", children: [_jsx("div", { className: css.messageType, children: "\u2728 \u60CA\u559C\u63A8\u8350" }), _jsx("div", { className: css.messageTitle, children: notice.title }), notice.reason !== '' ? _jsx("div", { className: css.messageBody, children: notice.reason }) : null, _jsxs("div", { className: css.messageActions, children: [_jsx(ActionButton, { label: "\u6253\u5F00\u539F\u6587", primary: true, disabled: busy !== '' || notice.content_url === '', onClick: () => {
                            // Mark the spotlight seen, while openItem records exactly one
                            // article-open learning event.
                            void act('view');
                            openItem(base, {
                                recommendation_id: undefined,
                                content_id: notice.content_id !== '' ? notice.content_id : notice.article_id,
                                article_id: notice.article_id,
                                content_url: notice.content_url,
                                media: notice.media,
                                title: notice.title,
                            }, error => {
                                onError('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error)));
                            });
                        } }), _jsx(ActionButton, { label: "\u559C\u6B22", disabled: busy !== '', onClick: () => void act('like') }), _jsx(ActionButton, { label: "\u5FFD\u7565", disabled: busy !== '', onClick: () => void act('ignore') })] })] }));
}
/** One pending notification recommendation card. */
function NotificationMessage(props) {
    const { base, notice, onHandled, onError } = props;
    const [busy, setBusy] = useState(false);
    const [requestId] = useState(stableId);
    const open = useCallback(() => {
        openItem(base, { content_id: notice.article_id, article_id: notice.article_id, content_url: notice.original_url, media: notice.media, title: notice.title }, error => { onError('原文已打开，但阅读记录未确认保存：' + (error instanceof Error ? error.message : String(error))); });
        setBusy(true);
        void acknowledgeNotification(base, notice.article_id, requestId).then(() => {
            onHandled(notice.article_id);
        }).catch(error => {
            onError('消息已打开，但确认状态保存失败：' + (error instanceof Error ? error.message : String(error)));
        }).finally(() => { setBusy(false); });
    }, [base, notice, onError, onHandled, requestId]);
    return (_jsxs("div", { className: css.messageCard, children: [_jsx("div", { className: css.messageType, children: "\uD83D\uDD14 \u503C\u5F97\u4E00\u770B" }), _jsx("div", { className: css.messageTitle, children: notice.title !== '' ? notice.title : notice.article_id }), notice.reason !== '' ? _jsx("div", { className: css.messageBody, children: notice.reason }) : null, _jsx("div", { className: css.messageActions, children: _jsx(ActionButton, { primary: true, disabled: notice.original_url === '' || busy, label: busy ? '正在确认…' : '打开原文', onClick: open }) })] }));
}
/** One objective webpage/PDF change or delivery-failure notification. */
function MonitorNotificationMessage(props) {
    const { base, notice, onHandled, onError } = props;
    const [busy, setBusy] = useState('');
    const [requestIds] = useState(() => ({ read: stableId(), dismiss: stableId() }));
    const act = useCallback(async (action, open = false) => {
        const pendingWindow = open ? window.open('about:blank', '_blank') : null;
        if (pendingWindow !== null)
            pendingWindow.opener = null;
        setBusy(action);
        try {
            await actOnWebMonitorNotification(base, notice.delivery_id, action, requestIds[action]);
            onHandled(notice.delivery_id);
            if (open) {
                const monitorUrl = `${base}/web/#library/monitoring`;
                if (pendingWindow !== null)
                    pendingWindow.location.replace(monitorUrl);
                else
                    window.open(monitorUrl, '_blank', 'noopener');
            }
        }
        catch (error) {
            if (pendingWindow !== null)
                pendingWindow.close();
            onError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setBusy('');
        }
    }, [base, notice.delivery_id, onError, onHandled, requestIds]);
    const typeLabel = notice.kind === 'failure'
        ? '⚠️ 监控需要处理'
        : notice.kind === 'recovered'
            ? '✓ 监控恢复正常'
            : '↗ 正文发生变化';
    return (_jsxs("div", { className: css.messageCard, "data-tone": notice.kind === 'failure' ? 'avoidance' : 'interest', children: [_jsx("div", { className: css.messageType, children: typeLabel }), _jsx("div", { className: css.messageTitle, children: notice.title || notice.label || notice.display_url }), notice.body !== '' ? _jsx("div", { className: css.messageBody, children: notice.body }) : null, _jsxs("div", { className: css.messageActions, children: [_jsx(ActionButton, { primary: true, disabled: busy !== '', label: busy === 'read' ? '正在确认…' : '查看监控', onClick: () => void act('read', true) }), _jsx(ActionButton, { disabled: busy !== '', label: "\u5FFD\u7565", onClick: () => void act('dismiss') })] })] }));
}
/** The messages drawer (bell overlay). */
export function MessagesDrawer(props) {
    const { base, probes, spotlights, notifications, monitorNotifications, onClose, onProbeHandled, onSpotlightHandled, onNotificationHandled, onMonitorNotificationHandled, onError } = props;
    const isEmpty = probes.length === 0 && spotlights.length === 0 && notifications.length === 0 && monitorNotifications.length === 0;
    return (_jsx("div", { className: css.drawerOverlay, onClick: event => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: css.drawerPanel, children: [_jsxs("div", { className: css.drawerHeader, children: [_jsx("span", { className: css.drawerTitle, children: "\u6D88\u606F" }), _jsx("button", { type: "button", className: css.iconButton, onClick: onClose, title: "\u5173\u95ED", children: _jsx(CloseIcon, { size: 13 }) })] }), isEmpty ? (_jsxs("div", { className: css.drawerEmpty, children: [_jsx(MessageIcon, { size: 34 }), _jsx("span", { className: css.drawerEmptyTitle, children: "\u6682\u65F6\u6CA1\u6709\u65B0\u6D88\u606F" }), _jsx("span", { className: css.drawerEmptySubtitle, children: "\u5174\u8DA3\u63A2\u6D4B\u548C\u60CA\u559C\u63A8\u8350\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC" })] })) : null, notifications.map(notice => (_jsx(NotificationMessage, { base: base, notice: notice, onHandled: onNotificationHandled, onError: onError }, `notif:${notice.article_id}`))), monitorNotifications.map(notice => (_jsx(MonitorNotificationMessage, { base: base, notice: notice, onHandled: onMonitorNotificationHandled, onError: onError }, `monitor:${notice.delivery_id}`))), probes.map(notice => (_jsx(ProbeMessage, { base: base, notice: notice, onHandled: onProbeHandled, onError: onError }, notice.key))), spotlights.map(notice => (_jsx(SpotlightMessage, { base: base, notice: notice, onHandled: onSpotlightHandled, onError: onError }, `spotlight:${notice.article_id}`)))] }) }));
}
/** Coerce one probe payload into a notice row. */
function toProbeNotice(item, type) {
    return {
        key: probeKey(type, item.domain),
        type,
        domain: item.domain,
        reason: item.reason,
        challenge: (item.probe_mode ?? '') === 'lateral' || (item.probe_mode ?? '') === 'bridge' || (item.probe_mode ?? '') === 'wildcard' || (item.challenge ?? '') === 'true',
        confidence: item.confidence,
    };
}
/** Build a spotlight notice from a spotlight payload. */
export function toSpotlightNotice(item) {
    return {
        article_id: item.article_id,
        title: item.title,
        reason: item.spotlight_reason,
        hook: item.spotlight_hook,
        media: item.media,
        content_url: item.content_url,
        content_id: item.content_id,
        score: item.spotlight_score,
    };
}
/** Hydrate the drawer from every durable local message surface. */
export async function hydrateDrawer(base, handledProbes) {
    const results = await Promise.allSettled([
        fetchInterestProbes(base),
        fetchAvoidanceProbes(base),
        fetchSpotlightBatch(base),
        fetchPendingNotification(base),
        fetchWebMonitorNotifications(base),
    ]);
    const interests = results[0].status === 'fulfilled' ? results[0].value : [];
    const avoidances = results[1].status === 'fulfilled' ? results[1].value : [];
    const spotlights = results[2].status === 'fulfilled' ? results[2].value : [];
    const notification = results[3].status === 'fulfilled' ? results[3].value : null;
    const monitorNotifications = results[4].status === 'fulfilled' ? results[4].value.items : [];
    await Promise.allSettled(monitorNotifications.map(item => actOnWebMonitorNotification(base, item.delivery_id, 'delivered', `dsh:monitor:delivered:${item.delivery_id}`)));
    const failed = results.filter(result => result.status === 'rejected').length;
    const probeNotice = (p, type) => {
        const key = probeKey(type, p.domain);
        if (key === '' || handledProbes.has(key))
            return null;
        if ((p.status ?? 'active') !== 'active' && (p.status ?? 'active') !== 'pending')
            return null;
        return toProbeNotice(p, type);
    };
    return {
        probes: [
            ...interests.map(p => probeNotice(p, 'interest.probe')).filter((n) => n !== null),
            ...avoidances.map(p => probeNotice(p, 'avoidance.probe')).filter((n) => n !== null),
        ],
        spotlights: spotlights.map(toSpotlightNotice),
        notifications: notification !== null
            ? [{ article_id: notification.article_id, title: notification.title, reason: notification.reason, media: notification.media, original_url: notification.original_url }]
            : [],
        monitorNotifications,
        error: failed === 0 ? '' : failed === results.length
            ? '消息暂时读取失败，请确认新闻爪后端已启动。'
            : '部分消息来源读取失败，当前只展示已成功取得的消息。',
        loaded: {
            interests: results[0].status === 'fulfilled',
            avoidances: results[1].status === 'fulfilled',
            spotlights: results[2].status === 'fulfilled',
            notification: results[3].status === 'fulfilled',
            monitorNotifications: results[4].status === 'fulfilled',
        },
    };
}
//# sourceMappingURL=notifications.js.map