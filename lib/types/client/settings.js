import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Truthful NewsClaw settings summary for the DSH side panel.
 *
 * DSH deliberately does not maintain a second editor for backend settings.
 * It reads the dedicated NewsClaw runtime/source contracts, shows the plugin
 * row connection, and sends full configuration work to the desktop Web UI.
 */
import { useCallback, useEffect, useState } from 'react';
import { applyAutostart, fetchAutostartStatus, fetchNewsRuntime, fetchNewsSources, } from "./api.js";
import { ActionButton } from "./views.js";
import css from './panel.module.css';
const TABS = [
    { key: 'status', label: '运行状态' },
    { key: 'sources', label: '新闻来源' },
    { key: 'connection', label: '插件连接' },
];
function Section({ title, children }) {
    return _jsxs("section", { className: css.settingsSection, children: [_jsx("h3", { children: title }), children] });
}
function formatDate(value) {
    if (value === '')
        return '尚无记录';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false });
}
function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0)
        return '—';
    return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`;
}
function runtimeLabel(state) {
    const normalized = state.toLowerCase();
    if (normalized === 'online' || normalized === 'healthy' || normalized === 'success')
        return '正常';
    if (normalized === 'degraded' || normalized === 'partial')
        return '降级';
    if (normalized === 'offline' || normalized === 'failed' || normalized === 'error')
        return '异常';
    return state === '' ? '待确认' : state;
}
function statusTone(state) {
    const normalized = state.toLowerCase();
    if (normalized === 'online' || normalized === 'healthy' || normalized === 'success')
        return 'online';
    if (normalized === 'degraded' || normalized === 'partial')
        return 'degraded';
    if (normalized === 'offline' || normalized === 'failed' || normalized === 'error')
        return 'offline';
    return 'unknown';
}
function StatusPill({ state }) {
    return _jsx("span", { className: css.settingsStatusPill, "data-state": statusTone(state), children: runtimeLabel(state) });
}
function Metric({ label, value, hint }) {
    return _jsxs("div", { className: css.settingsMetric, children: [_jsx("span", { children: label }), _jsx("strong", { children: value }), hint !== undefined ? _jsx("small", { children: hint }) : null] });
}
function SettingRow({ label, value }) {
    return _jsxs("div", { className: css.settingsValueRow, children: [_jsx("span", { children: label }), _jsx("strong", { children: value })] });
}
function FullSettingsCard({ base }) {
    const openDesktop = () => {
        window.open(`${base.replace(/\/+$/, '')}/web`, '_blank', 'noopener');
    };
    return _jsxs(Section, { title: "\u5B8C\u6574\u914D\u7F6E\u5728\u7535\u8111\u7248", children: [_jsx("p", { className: css.settingsHint, children: "AI \u5B9E\u4F8B\u4E0E\u8DEF\u7531\u3001DeepSeek \u5BC6\u94A5\u3001\u65B0\u95FB\u6E90\u5F00\u5173\u3001\u81EA\u5B9A\u4E49 RSS\u3001\u5237\u65B0\u548C\u91CD\u8BD5\u53C2\u6570\uFF0C\u90FD\u7531\u65B0\u95FB\u722A\u7535\u8111\u7248\u7EDF\u4E00\u7BA1\u7406\u3002DSH \u8FD9\u91CC\u53EA\u5C55\u793A\u540E\u7AEF\u786E\u8BA4\u5DF2\u7ECF\u751F\u6548\u7684\u7ED3\u679C\uFF0C\u4E0D\u518D\u4FDD\u5B58\u4E00\u4EFD\u201C\u770B\u8D77\u6765\u80FD\u6539\u3001\u5B9E\u9645\u4E0D\u751F\u6548\u201D\u7684\u914D\u7F6E\u3002" }), _jsx("div", { className: css.settingsActionRow, children: _jsx(ActionButton, { label: "\u6253\u5F00\u65B0\u95FB\u722A\u7535\u8111\u7248", primary: true, onClick: openDesktop }) })] });
}
function EffectiveSettingsView({ settings }) {
    if (settings === null)
        return _jsx("p", { className: css.settingsHint, children: "\u540E\u7AEF\u5C1A\u672A\u8FD4\u56DE\u751F\u6548\u914D\u7F6E\u3002" });
    return _jsxs("div", { className: css.settingsValueList, children: [_jsx(SettingRow, { label: "\u5019\u9009\u6C60\u76EE\u6807", value: `${settings.pool_target_count} 条` }), _jsx(SettingRow, { label: "\u8C03\u5EA6\u68C0\u67E5", value: `${settings.refresh_poll_minutes} 分钟` }), _jsx(SettingRow, { label: "\u70ED\u95E8\u5237\u65B0", value: `${settings.hot_refresh_minutes} 分钟` }), _jsx(SettingRow, { label: "\u63A2\u7D22\u5237\u65B0", value: `${settings.exploration_refresh_minutes} 分钟` }), _jsx(SettingRow, { label: "\u53CD\u9988\u89E6\u53D1", value: `${settings.feedback_threshold} 次` }), _jsx(SettingRow, { label: "\u4E3B\u52A8\u63A8\u9001", value: settings.proactive_push ? '已开启' : '已关闭' }), _jsx(SettingRow, { label: "\u540E\u53F0 AI", value: settings.background_llm ? '已开启' : '已关闭' }), _jsx(SettingRow, { label: "\u5173\u95ED\u6D4F\u89C8\u5668\u540E", value: settings.browser_close_behavior === 'continue' ? '继续运行' : settings.browser_close_behavior || '—' }), _jsx(SettingRow, { label: "\u5931\u8D25\u91CD\u8BD5", value: `${settings.retry_max_attempts} 次；${formatDuration(settings.retry_base_seconds)} → ${formatDuration(settings.retry_max_seconds)}` })] });
}
function StatusView({ runtime, settings }) {
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: css.settingsRuntimeHero, "data-state": runtime?.status ?? 'offline', children: [_jsxs("div", { children: [_jsx("span", { className: css.settingsEyebrow, children: "NEWSCLAW RUNTIME" }), _jsx("strong", { children: runtime === null ? '正在确认后端状态' : runtime.status === 'online' ? '新闻爪运行正常' : runtime.status === 'degraded' ? '新闻爪正在降级运行' : '新闻爪当前离线' }), _jsx("p", { children: runtime === null ? '正在读取 /api/news/runtime' : `最近刷新：${formatDate(runtime.last_refresh)}` })] }), _jsx(StatusPill, { state: runtime?.status ?? 'unknown' })] }), _jsxs("div", { className: css.settingsMetricGrid, children: [_jsx(Metric, { label: "\u6700\u8FD1\u5165\u6C60", value: runtime?.last_article_count ?? '—', hint: "\u540E\u7AEF\u771F\u5B9E\u8FD4\u56DE" }), _jsx(Metric, { label: "\u8C03\u5EA6\u901A\u9053", value: runtime?.last_schedule_lane === 'exploration' ? '探索' : runtime?.last_schedule_lane === 'hot' ? '热门' : '—' }), _jsx(Metric, { label: "\u753B\u50CF", value: runtime?.profile_ready === true ? '就绪' : '未就绪' }), _jsx(Metric, { label: "\u5237\u65B0\u4EFB\u52A1", value: runtime?.refresh_running === true || runtime?.bootstrap_running === true ? '进行中' : '空闲' })] }), _jsxs(Section, { title: "\u5F53\u524D\u5DF2\u751F\u6548\u7684\u5237\u65B0\u53C2\u6570", children: [_jsx("p", { className: css.settingsHint, children: "\u4EE5\u4E0B\u6570\u503C\u6765\u81EA\u540E\u7AEF\u7684 effective_settings\uFF0C\u4E0D\u662F DSH \u81EA\u5DF1\u731C\u6D4B\u7684\u9ED8\u8BA4\u503C\u3002" }), _jsx(EffectiveSettingsView, { settings: settings })] })] });
}
function SourcesView({ snapshot }) {
    const sources = snapshot?.sources ?? [];
    const healthy = sources.filter(source => statusTone(source.status) === 'online').length;
    return _jsxs(_Fragment, { children: [_jsxs(Section, { title: "\u6765\u6E90\u6982\u51B5", children: [_jsxs("div", { className: css.settingsMetricGrid, children: [_jsx(Metric, { label: "\u5DF2\u63A5\u5165", value: sources.length }), _jsx(Metric, { label: "\u5F53\u524D\u6B63\u5E38", value: healthy })] }), _jsx("p", { className: css.settingsHint, children: "\u6765\u6E90\u72B6\u6001\u76F4\u63A5\u8BFB\u53D6 /api/news/sources\u3002DSH \u4E0D\u4FEE\u6539\u6765\u6E90\u5F00\u5173\u3001\u6743\u91CD\u6216\u5355\u6E90\u9891\u7387\uFF1B\u5B8C\u6574\u8BBE\u7F6E\u8BF7\u5230\u7535\u8111\u7248\u5B8C\u6210\u3002" })] }), sources.length === 0 ? _jsx("div", { className: css.empty, children: "\u540E\u7AEF\u8FD8\u6CA1\u6709\u8FD4\u56DE\u65B0\u95FB\u6765\u6E90\u3002" }) : _jsx("div", { className: css.settingsSourceList, children: sources.map(source => _jsx(SourceCard, { source: source }, source.source_id)) })] });
}
function SourceCard({ source }) {
    return _jsxs("article", { className: css.settingsSourceCard, children: [_jsxs("div", { className: css.settingsSourceHead, children: [_jsxs("div", { children: [_jsx("strong", { children: source.media || source.source_id }), _jsx("span", { children: source.technical_provider || source.kind || '未标注技术提供方' })] }), source.enabled ? _jsx(StatusPill, { state: source.status }) : _jsx("span", { className: css.settingsStatusPill, "data-state": "unknown", children: "\u5DF2\u505C\u7528" })] }), _jsxs("div", { className: css.settingsSourceMeta, children: [_jsx("span", { children: source.enabled ? '已启用' : '已停用' }), _jsx("span", { children: source.custom ? '自定义 RSS' : source.kind === 'rss' ? '官方 RSS/Atom' : source.kind === 'tushare' ? 'Tushare 接口' : source.kind || '新闻接口' }), _jsx("span", { children: source.credential_configured ? '凭据/地址已配置' : '需要配置' })] }), _jsxs("p", { className: css.settingsHint, children: ["\u6700\u540E\u6210\u529F\uFF1A", formatDate(source.last_success_at)] }), source.error !== '' ? _jsxs("p", { className: css.settingsSourceError, children: ["\u5F53\u524D\u9519\u8BEF\uFF1A", source.error] }) : null] });
}
function ConnectionView({ base, timeoutMs, autostart, onAutostart }) {
    return _jsxs(_Fragment, { children: [_jsxs(Section, { title: "\u63D2\u4EF6\u81EA\u8EAB\u8FDE\u63A5", children: [_jsxs("div", { className: css.settingsConnectionValue, children: [_jsx("span", { children: "API \u5730\u5740" }), _jsx("code", { children: base })] }), _jsxs("div", { className: css.settingsConnectionValue, children: [_jsx("span", { children: "Agent \u5DE5\u5177\u5355\u6B21\u603B\u8D85\u65F6" }), _jsxs("code", { children: [timeoutMs, " ms\uFF08", Math.round(timeoutMs / 1000), " \u79D2\uFF09"] })] }), _jsx("p", { className: css.settingsHint, children: "\u8FD9\u4E24\u4E2A\u503C\u6765\u81EA Harness \u63D2\u4EF6\u884C\u7684 apiUrl / timeoutMs\u3002\u9762\u677F\u542F\u52A8\u65F6\u4F1A\u628A\u540C\u4E00\u4E2A apiUrl \u955C\u50CF\u7ED9\u5168\u90E8\u754C\u9762\u8BF7\u6C42\uFF0C22 \u4E2A Agent Bridge \u5DE5\u5177\u4E5F\u4F7F\u7528\u8BE5\u5730\u5740\uFF0C\u907F\u514D\u4E24\u5957\u8FDE\u63A5\u6F02\u79FB\u3002" }), _jsx("p", { className: css.settingsHint, children: "\u4FEE\u6539\u5B83\u4EEC\u9700\u8981\u7F16\u8F91 DSH \u63D2\u4EF6\u914D\u7F6E\u5E76\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\uFF1B\u8FD9\u91CC\u4FDD\u6301\u53EA\u8BFB\uFF0C\u9632\u6B62\u53EA\u6539\u53F3\u4FA7\u680F\u5374\u6CA1\u6709\u6539 Agent \u5DE5\u5177\u3002" })] }), _jsxs(Section, { title: "\u672C\u673A\u542F\u52A8", children: [_jsxs("label", { className: css.settingsToggleRow, children: [_jsx("input", { type: "checkbox", checked: autostart.enabled, disabled: !autostart.loaded || autostart.busy, onChange: event => onAutostart(event.target.checked) }), _jsxs("span", { children: [_jsx("strong", { children: "\u5F00\u673A\u81EA\u52A8\u542F\u52A8\u65B0\u95FB\u722A" }), _jsx("small", { children: !autostart.loaded ? '正在读取真实状态…' : autostart.busy ? '正在应用…' : autostart.enabled ? '当前已开启' : '当前已关闭' })] })] }), _jsx("p", { className: css.settingsHint, children: "\u8BE5\u5F00\u5173\u76F4\u63A5\u8C03\u7528\u65B0\u95FB\u722A\u7684\u672C\u673A\u81EA\u542F\u52A8\u63A5\u53E3\uFF0C\u662F\u672C\u9875\u552F\u4E00\u4F1A\u6539\u52A8\u540E\u7AEF\u72B6\u6001\u7684\u9879\u76EE\u3002" })] }), _jsx(Section, { title: "\u9690\u79C1\u4E0E\u8FB9\u754C", children: _jsx("p", { className: css.settingsHint, children: "\u9875\u9762\u4E0D\u4F1A\u8BFB\u53D6\u6216\u56DE\u663E DeepSeek\u3001Tushare \u7B49 Token\u3002\u63D2\u4EF6\u53EA\u8FDE\u63A5\u672C\u673A\u65B0\u95FB\u722A\uFF0C\u4E0D\u6293\u7F51\u9875\u3001\u4E0D\u8BFB\u53D6\u65B0\u95FB\u7F51\u7AD9 Cookie\uFF0C\u4E5F\u4E0D\u8FDE\u63A5\u5238\u5546\u6216\u6267\u884C\u4EA4\u6613\u3002" }) })] });
}
export function SettingsOverlay({ base, timeoutMs, onClose }) {
    const [tab, setTab] = useState('status');
    const [runtime, setRuntime] = useState(null);
    const [sources, setSources] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [autostart, setAutostart] = useState({ loaded: false, enabled: false, busy: false });
    const load = useCallback(async (signal) => {
        setLoading(true);
        setNotice('');
        const [runtimeResult, sourcesResult, autostartResult] = await Promise.allSettled([
            fetchNewsRuntime(base, signal),
            fetchNewsSources(base, signal),
            fetchAutostartStatus(base, signal),
        ]);
        if (signal?.aborted === true)
            return;
        if (runtimeResult.status === 'fulfilled')
            setRuntime(runtimeResult.value);
        if (sourcesResult.status === 'fulfilled')
            setSources(sourcesResult.value);
        if (autostartResult.status === 'fulfilled')
            setAutostart({ loaded: true, enabled: autostartResult.value.enabled, busy: false });
        else
            setAutostart(value => ({ ...value, loaded: false, busy: false }));
        const failed = [runtimeResult, sourcesResult].filter(result => result.status === 'rejected');
        if (failed.length > 0)
            setNotice(failed.length === 2 ? '新闻爪后端暂时不可达，请确认服务已经启动。' : '部分实时状态读取失败，当前展示的是已成功取得的数据。');
        else if (autostartResult.status === 'rejected')
            setNotice('运行状态已读取，但开机自启动的真实状态暂时无法确认。');
        setLoading(false);
    }, [base]);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => { controller.abort(); };
    }, [load]);
    const toggleAutostart = useCallback(async (enabled) => {
        setAutostart(value => ({ ...value, busy: true }));
        setNotice('');
        try {
            const accepted = await applyAutostart(base, enabled);
            if (!accepted)
                throw new Error('后端没有确认这次自启动修改');
            const verified = await fetchAutostartStatus(base);
            if (verified.enabled !== enabled)
                throw new Error('写入后的真实状态与目标不一致');
            setAutostart({ loaded: true, enabled: verified.enabled, busy: false });
            setNotice(enabled ? '已开启开机自动启动（状态已复核）。' : '已关闭开机自动启动（状态已复核）。');
        }
        catch (error) {
            try {
                const verified = await fetchAutostartStatus(base);
                setAutostart({ loaded: true, enabled: verified.enabled, busy: false });
            }
            catch {
                setAutostart(value => ({ ...value, loaded: false, busy: false }));
            }
            setNotice('自启动设置失败：' + (error instanceof Error ? error.message : String(error)));
        }
    }, [base]);
    const effective = runtime?.effective_settings ?? sources?.settings ?? null;
    return _jsx("div", { className: css.settingsOverlay, onClick: event => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: css.settingsPanel, children: [_jsxs("div", { className: css.settingsHeader, children: [_jsxs("div", { children: [_jsx("h2", { children: "\u65B0\u95FB\u722A\u72B6\u6001\u4E0E\u914D\u7F6E" }), _jsx("p", { children: "DSH \u5C55\u793A\u771F\u5B9E\u72B6\u6001\uFF0C\u5B8C\u6574\u8BBE\u7F6E\u7531\u7535\u8111\u7248\u7EDF\u4E00\u7BA1\u7406" })] }), _jsx("button", { type: "button", className: css.settingsBack, title: "\u8FD4\u56DE", onClick: onClose, children: "\u2190" })] }), _jsx("div", { className: css.settingsTabs, role: "tablist", children: TABS.map(row => _jsx("button", { type: "button", className: css.settingsTab, "data-active": tab === row.key, onClick: () => setTab(row.key), children: row.label }, row.key)) }), _jsxs("div", { className: css.settingsBody, children: [notice !== '' ? _jsx("div", { className: css.settingsNotice, role: "status", children: notice }) : null, loading && runtime === null && sources === null ? _jsx("div", { className: css.empty, children: "\u6B63\u5728\u8BFB\u53D6\u540E\u7AEF\u5B9E\u9645\u72B6\u6001\u2026" }) : _jsxs(_Fragment, { children: [tab === 'status' ? _jsx(StatusView, { runtime: runtime ?? sources?.runtime ?? null, settings: effective }) : null, tab === 'sources' ? _jsx(SourcesView, { snapshot: sources }) : null, tab === 'connection' ? _jsx(ConnectionView, { base: base, timeoutMs: timeoutMs, autostart: autostart, onAutostart: enabled => { void toggleAutostart(enabled); } }) : null, _jsx(FullSettingsCard, { base: base }), _jsxs("div", { className: css.settingsRefreshBar, children: [_jsx("span", { children: loading ? '正在刷新…' : '数据来自新闻爪专用接口' }), _jsx(ActionButton, { label: "\u5237\u65B0\u5B9E\u9645\u72B6\u6001", disabled: loading, onClick: () => { void load(); } })] })] })] })] }) });
}
//# sourceMappingURL=settings.js.map