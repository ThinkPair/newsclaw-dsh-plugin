import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * NewsClaw sidebar panel shell: brand header with the message bell
 * (badge + 消息 drawer), tab bar with SVG icons, and the active view. Live
 * runtime-stream events feed the probe/spotlight notifications and tab badges.
 * @module @newsclaw/dsh-plugin
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { actOnWebMonitorNotification, fetchHealthState, fetchWebMonitorNotifications, } from "./api.js";
import { BRAND_ICON } from "./brandIcon.js";
import { LiveClient } from "./live.js";
import { ActivityFooter, RecommendView } from "./views.js";
import { LibraryView } from "./library.js";
import { ChatView } from "./dialogue.js";
import { ProfileView } from "./profile.js";
import { hydrateDrawer, MessagesDrawer, probeKey, } from "./notifications.js";
import { MessageIcon, ChatIcon, CollapseIcon, GearIcon, LibraryIcon, MonitorIcon, ProfileIcon, SparkleIcon } from "./icons.js";
import { SettingsOverlay } from "./settings.js";
import css from './panel.module.css';
/** Canonical tab structure (same IA as the mobile web + extension popup). */
const TABS = [
    { key: 'recommend', label: '推荐', icon: SparkleIcon },
    { key: 'library', label: '内容库', icon: LibraryIcon },
    { key: 'profile', label: '画像', icon: ProfileIcon },
    { key: 'chat', label: '对话', icon: ChatIcon },
];
/**
 * The panel column body: NewsClaw user-consumption panel.
 * @param props - injected actions (close + theme).
 */
export function NewsClawPanel({ closePanel, isDark, onThemeChange, apiUrl, timeoutMs }) {
    const [dark, setDark] = useState(() => isDark());
    useEffect(() => onThemeChange(setDark), [onThemeChange]);
    const base = apiUrl;
    const [connection, setConnection] = useState('offline');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [tab, setTab] = useState('recommend');
    const [badges, setBadges] = useState({});
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [probes, setProbes] = useState([]);
    const [spotlights, setSpotlights] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [monitorNotifications, setMonitorNotifications] = useState([]);
    const [drawerError, setDrawerError] = useState('');
    const handledProbes = useRef(new Set());
    const handledMonitorNotifications = useRef(new Set());
    const monitorNotificationGeneration = useRef(0);
    const commitMonitorNotifications = useCallback((items, generation) => {
        if (generation !== monitorNotificationGeneration.current)
            return;
        setMonitorNotifications(items.filter(item => !handledMonitorNotifications.current.has(item.delivery_id)));
    }, []);
    const probeRef = useRef([]);
    probeRef.current = probes;
    const spotlightRef = useRef([]);
    spotlightRef.current = spotlights;
    // Connection probe: HTTP health is the single source of truth for the
    // status dot (the WebSocket alone flaps in background tabs and must not
    // flip the status on its own). The dot only goes offline after two
    // consecutive failed probes (~24s of real downtime), so one slow request
    // or a busy backend moment never flickers the status.
    const healthProbeRef = useRef(null);
    const failStreakRef = useRef(0);
    const probeNow = useCallback(() => {
        void fetchHealthState(base).then(state => {
            if (state !== 'offline') {
                failStreakRef.current = 0;
                setConnection(state);
            }
            else {
                failStreakRef.current += 1;
                if (failStreakRef.current >= 2)
                    setConnection('offline');
            }
        });
    }, [base]);
    healthProbeRef.current = probeNow;
    useEffect(() => {
        probeNow();
        const timer = window.setInterval(probeNow, 12_000);
        return () => { window.clearInterval(timer); };
    }, [probeNow]);
    // Hydrate persisted notifications on mount (badge eager-load, like the mobile shell).
    useEffect(() => {
        let cancelled = false;
        const generation = ++monitorNotificationGeneration.current;
        void hydrateDrawer(base, handledProbes.current).then(result => {
            if (cancelled)
                return;
            setProbes(result.probes);
            if (result.loaded.spotlights)
                setSpotlights(result.spotlights);
            if (result.loaded.notification)
                setNotifications(result.notifications);
            if (result.loaded.monitorNotifications)
                commitMonitorNotifications(result.monitorNotifications, generation);
            setDrawerError(result.error);
        }).catch(error => {
            if (!cancelled)
                setDrawerError(error instanceof Error ? error.message : String(error));
        });
        return () => {
            cancelled = true;
            monitorNotificationGeneration.current += 1;
        };
    }, [base, commitMonitorNotifications]);
    // P5 notifications are durable database rows rather than transient stream
    // events. Poll only while this local panel is visible; deterministic
    // delivery request ids make reconnects safe.
    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            if (document.visibilityState === 'hidden')
                return;
            const generation = ++monitorNotificationGeneration.current;
            try {
                const result = await fetchWebMonitorNotifications(base);
                if (cancelled)
                    return;
                commitMonitorNotifications(result.items, generation);
                await Promise.allSettled(result.items.map(item => actOnWebMonitorNotification(base, item.delivery_id, 'delivered', `dsh:monitor:delivered:${item.delivery_id}`)));
            }
            catch {
                // The health probe and drawer surface the actionable failure; a badge
                // poll must never take the host panel down.
            }
        };
        const onVisibility = () => { if (document.visibilityState === 'visible')
            void refresh(); };
        const timer = window.setInterval(() => { void refresh(); }, 60_000);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [base, commitMonitorNotifications]);
    // Live stream: probe/spotlight notifications + tab badges.
    const [liveTick, setLiveTick] = useState(0);
    useEffect(() => {
        const client = new LiveClient(base);
        const offEvent = client.onEvent((event) => {
            const payload = event.payload;
            if (event.type === 'interest.probe' || event.type === 'avoidance.probe') {
                const domain = typeof payload.domain === 'string' ? payload.domain : '';
                const key = probeKey(event.type, domain);
                if (key === '' || handledProbes.current.has(key))
                    return;
                if (probeRef.current.some(probe => probe.key === key))
                    return;
                const probeMode = typeof payload.probe_mode === 'string' ? payload.probe_mode : '';
                const challenge = probeMode === 'lateral' || probeMode === 'bridge' || probeMode === 'wildcard';
                const notice = {
                    key,
                    type: event.type === 'avoidance.probe' ? 'avoidance.probe' : 'interest.probe',
                    domain,
                    reason: typeof payload.reason === 'string' ? payload.reason : '',
                    challenge,
                    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
                };
                probeRef.current = [...probeRef.current, notice];
                setProbes(probeRef.current);
                setBadges(prev => ({ ...prev, profile: (prev.profile ?? 0) + 1 }));
                setLiveTick(tick => tick + 1);
            }
            else if (event.type === 'spotlight.candidate') {
                const article_id = typeof payload.article_id === 'string' ? payload.article_id : '';
                if (article_id === '')
                    return;
                if (spotlightRef.current.some(item => item.article_id === article_id))
                    return;
                const notice = {
                    article_id,
                    title: typeof payload.title === 'string' ? payload.title : '',
                    reason: typeof payload.spotlight_reason === 'string' ? payload.spotlight_reason : '',
                    hook: typeof payload.spotlight_hook === 'string' ? payload.spotlight_hook : '',
                    media: typeof payload.media === 'string' ? payload.media : '未知媒体',
                    content_url: typeof payload.original_url === 'string'
                        ? payload.original_url
                        : typeof payload.content_url === 'string' ? payload.content_url : '',
                    content_id: typeof payload.content_id === 'string' ? payload.content_id : article_id,
                    score: typeof payload.spotlight_score === 'number' ? payload.spotlight_score : 0,
                };
                spotlightRef.current = [...spotlightRef.current, notice];
                setSpotlights(spotlightRef.current);
                setBadges(prev => ({ ...prev, recommend: (prev.recommend ?? 0) + 1 }));
                setLiveTick(tick => tick + 1);
            }
            else if (event.type.startsWith('interest.') || event.type.startsWith('avoidance.')) {
                // Result events (confirmed/rejected/deferred) — drop the matching probe card.
                const domain = typeof payload.domain === 'string' ? payload.domain : '';
                const key = probeKey(event.type, domain);
                if (key !== '') {
                    handledProbes.current.add(key);
                    setProbes(prev => prev.filter(p => p.key !== key));
                }
            }
            else if (event.type === 'spotlight.liked' || event.type === 'spotlight.disliked' || event.type === 'spotlight.refreshed') {
                const article_id = typeof payload.article_id === 'string' ? payload.article_id : '';
                if (article_id !== '')
                    setSpotlights(prev => prev.filter(d => d.article_id !== article_id));
            }
        });
        const offStatus = client.onStatusChange(() => { healthProbeRef.current?.(); });
        client.connect();
        return () => {
            offEvent();
            offStatus();
            client.dispose();
        };
    }, [base]);
    const selectTab = useCallback((key) => {
        setTab(key);
        setBadges(prev => ({ ...prev, [key]: 0 }));
        if (key === 'recommend' || key === 'profile')
            setLiveTick(tick => tick + 1);
    }, []);
    const openDrawer = useCallback(() => {
        setDrawerOpen(true);
        setDrawerError('');
        const generation = ++monitorNotificationGeneration.current;
        void hydrateDrawer(base, handledProbes.current).then(result => {
            setProbes(prev => mergeProbes(prev, result.probes));
            if (result.loaded.spotlights)
                setSpotlights(result.spotlights);
            if (result.loaded.notification)
                setNotifications(result.notifications);
            if (result.loaded.monitorNotifications)
                commitMonitorNotifications(result.monitorNotifications, generation);
            setDrawerError(result.error);
        }).catch(error => {
            setDrawerError(error instanceof Error ? error.message : String(error));
        });
    }, [base, commitMonitorNotifications]);
    const onProbeHandled = useCallback((key) => {
        handledProbes.current.add(key);
        setProbes(prev => prev.filter(p => p.key !== key));
    }, []);
    const onSpotlightHandled = useCallback((article_id) => {
        setSpotlights(prev => prev.filter(d => d.article_id !== article_id));
    }, []);
    const onNotificationHandled = useCallback((article_id) => {
        setNotifications(prev => prev.filter(n => n.article_id !== article_id));
    }, []);
    const onMonitorNotificationHandled = useCallback((deliveryId) => {
        handledMonitorNotifications.current.add(deliveryId);
        monitorNotificationGeneration.current += 1;
        setMonitorNotifications(prev => prev.filter(n => n.delivery_id !== deliveryId));
    }, []);
    const messageCount = probes.length + spotlights.length + notifications.length + monitorNotifications.length;
    return (_jsxs("div", { className: css.panel, "data-dark": dark, children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { className: css.brand, children: [_jsx("img", { className: css.brandMark, src: BRAND_ICON, alt: "", "aria-hidden": "true" }), _jsxs("span", { className: css.brandCopy, children: [_jsx("span", { className: css.brandTitle, children: "NewsClaw" }), _jsxs("span", { className: css.status, title: connection === 'online' ? '在线' : connection === 'degraded' ? '降级运行' : '离线', children: [_jsx("span", { className: css.statusDot, "data-state": connection }), _jsx("span", { className: css.statusText, children: connection === 'online' ? '在线' : connection === 'degraded' ? '降级' : '离线' })] })] })] }), _jsx("button", { type: "button", className: css.iconButton, title: "\u7535\u8111\u7248\uFF1A\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 Web \u7248", onClick: () => { window.open(`${base}/web`, '_blank', 'noopener'); }, children: _jsx(MonitorIcon, { size: 15 }) }), _jsxs("button", { type: "button", className: css.iconButton, title: "\u6D88\u606F", onClick: openDrawer, children: [_jsx(MessageIcon, { size: 15 }), messageCount > 0 ? _jsx("span", { className: css.bellBadge, children: messageCount > 99 ? '99+' : messageCount }) : null] }), _jsx("button", { type: "button", className: css.iconButton, title: "\u8BBE\u7F6E", onClick: () => setSettingsOpen(open => !open), children: _jsx(GearIcon, { size: 14 }) }), _jsx("button", { type: "button", className: css.iconButton, title: "\u6536\u8D77", onClick: closePanel, children: _jsx(CollapseIcon, { size: 14 }) })] }), settingsOpen ? (_jsx(SettingsOverlay, { base: base, timeoutMs: timeoutMs, onClose: () => setSettingsOpen(false) })) : null, _jsx("div", { className: css.tabBar, children: TABS.map(item => {
                    const badgeCount = badges[item.key];
                    const Icon = item.icon;
                    return (_jsxs("button", { type: "button", className: css.tab, "data-active": tab === item.key, onClick: () => selectTab(item.key), children: [_jsx(Icon, { size: 15 }), _jsxs("span", { children: [item.label, badgeCount !== undefined && badgeCount > 0 ? _jsx("span", { className: css.badge, children: badgeCount }) : null] })] }, item.key));
                }) }), _jsxs("div", { className: css.body, children: [tab === 'recommend' ? _jsx(RecommendView, { base: base, refreshKey: liveTick }, `recommend-${base}`) : null, tab === 'library' ? _jsx(LibraryView, { base: base }, `library-${base}`) : null, tab === 'chat' ? _jsx(ChatView, { base: base }, `chat-${base}`) : null, tab === 'profile' ? _jsx(ProfileView, { base: base }, `profile-${base}-${liveTick}`) : null] }), _jsx("div", { className: css.pinnedFooter, children: _jsx(ActivityFooter, { base: base }) }), drawerOpen ? (_jsx(MessagesDrawer, { base: base, probes: probes, spotlights: spotlights, notifications: notifications, monitorNotifications: monitorNotifications, onClose: () => setDrawerOpen(false), onProbeHandled: onProbeHandled, onSpotlightHandled: onSpotlightHandled, onNotificationHandled: onNotificationHandled, onMonitorNotificationHandled: onMonitorNotificationHandled, onError: setDrawerError })) : null, drawerError !== '' && drawerOpen ? _jsx("div", { className: css.error, style: { position: 'absolute', bottom: 8, left: 14, right: 14, zIndex: 11 }, children: drawerError }) : null] }));
}
/** Merge persisted probes into live ones, deduped by key. */
function mergeProbes(current, persisted) {
    const seen = new Set();
    const merged = [];
    for (const p of [...persisted, ...current]) {
        if (seen.has(p.key))
            continue;
        seen.add(p.key);
        merged.push(p);
    }
    return merged;
}
//# sourceMappingURL=NewsClawPanel.js.map