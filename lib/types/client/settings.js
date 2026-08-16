import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** NewsClaw settings surface: AI, sources, refresh, recommendation, profile, general and logs. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_API_BASE, applyAutostart, fetchAutostartStatus, fetchConfig, fetchSourceAvailability, readApiBase, updateConfig, writeApiBase, } from "./api.js";
import { ActionButton } from "./views.js";
import css from './panel.module.css';
const TABS = [
    { key: 'ai', label: 'AI 模型' },
    { key: 'sources', label: '新闻源' },
    { key: 'refresh', label: '刷新' },
    { key: 'recommendation', label: '推荐' },
    { key: 'profile', label: '画像' },
    { key: 'general', label: '通用' },
    { key: 'logs', label: '日志' },
];
function dict(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function text(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function boolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}
function firstInstance(llm) {
    const instances = dict(llm.instances);
    const first = Object.values(instances).find(value => typeof value === 'object' && value !== null);
    return dict(first);
}
function parseSources(raw, availability) {
    const value = raw.news_sources ?? raw.sources;
    const rows = Array.isArray(value)
        ? value.map((row, index) => [text(dict(row).id, `source-${index + 1}`), dict(row)])
        : Object.entries(dict(value)).map(([id, row]) => [id, dict(row)]);
    const ids = new Set(rows.map(([id]) => id));
    for (const source of availability) {
        if (!ids.has(source.id))
            rows.push([source.id || source.media, { media: source.media }]);
    }
    return rows.map(([id, row]) => {
        const runtime = availability.find(source => source.id === id || source.media === text(row.name ?? row.media, id));
        const healthValue = text(runtime?.state ?? row.health ?? row.state ?? row.status, 'unknown').toLowerCase();
        const health = healthValue === 'online' || healthValue === 'degraded' || healthValue === 'offline' ? healthValue : 'unknown';
        return {
            id,
            name: text(row.name ?? row.media, runtime?.media || id),
            provider: runtime?.technical_provider || text(row.technical_provider ?? row.provider),
            enabled: boolean(row.enabled, true),
            weight: number(row.weight, 1),
            refreshMinutes: number(row.refresh_minutes ?? row.refresh_interval_minutes, 5),
            health,
            lastSuccess: runtime?.last_success_at || text(row.last_success_at ?? row.last_success),
            error: runtime?.error || text(row.error ?? row.last_error),
        };
    });
}
function buildDraft(raw, availability = []) {
    const llm = dict(raw.llm);
    const instance = firstInstance(llm);
    const scheduler = dict(raw.scheduler);
    const recommendation = dict(raw.recommendation);
    const profile = dict(raw.profile);
    const storage = dict(raw.storage);
    const logging = dict(raw.logging);
    return {
        ai: {
            provider: text(instance.provider_type ?? llm.provider, 'deepseek'),
            model: text(instance.model ?? llm.model, 'deepseek-chat'),
            baseUrl: text(instance.base_url ?? llm.base_url),
            apiKey: '',
            apiKeyConfigured: text(instance.api_key ?? llm.api_key) !== '' || boolean(instance.api_key_configured ?? llm.api_key_configured),
            concurrency: number(llm.concurrency, 4),
            timeout: number(llm.timeout, 120),
        },
        sources: parseSources(raw, availability),
        refresh: {
            poolTarget: number(scheduler.pool_target_count, 300),
            pollSeconds: number(scheduler.refresh_check_interval_seconds, 60),
            hotMinutes: number(scheduler.trending_refresh_minutes, 3),
            exploreMinutes: number(scheduler.explore_refresh_minutes, 15),
            feedbackThreshold: number(scheduler.feedback_batch_threshold, 3),
            proactivePush: boolean(scheduler.proactive_push_enabled, true),
            pushSeconds: number(scheduler.proactive_push_interval_seconds, 120),
            backgroundLlm: boolean(scheduler.background_llm_enabled, true),
            continueAfterClose: boolean(scheduler.continue_after_browser_close, true),
            retryBaseSeconds: number(scheduler.retry_base_seconds, 5),
            retryMaxSeconds: number(scheduler.retry_max_seconds, 300),
            sourceShareLimit: number(scheduler.source_share_limit, 0.4),
        },
        recommendation: {
            explorationRatio: number(recommendation.exploration_ratio, 0.15),
            candidateTtlHours: number(recommendation.candidate_ttl_hours, 48),
            dedupeThreshold: number(recommendation.semantic_dedupe_threshold, 0.88),
            sourceDiversity: boolean(recommendation.source_diversity_enabled, true),
            hardNegativeFilter: boolean(recommendation.hard_negative_filter_enabled, true),
        },
        profile: {
            probeThreshold: number(profile.probe_confirmation_threshold, 3),
            maxActiveProbes: number(profile.max_active_probes, 5),
            manualOverrideWins: true,
        },
        general: {
            language: text(raw.language, 'zh'),
            dataDir: text(raw.data_dir, 'data'),
            dbPath: text(storage.db_path, 'data/newsclaw.db'),
        },
        logs: {
            level: text(logging.level, 'INFO'),
            fileLevel: text(logging.file_level, 'DEBUG'),
            path: `${text(logging.directory, 'logs')}/${text(logging.filename, 'newsclaw.log')}`,
        },
    };
}
function buildPayload(draft) {
    const slash = Math.max(draft.logs.path.lastIndexOf('/'), draft.logs.path.lastIndexOf('\\'));
    const directory = slash >= 0 ? draft.logs.path.slice(0, slash) : 'logs';
    const filename = slash >= 0 ? draft.logs.path.slice(slash + 1) : draft.logs.path;
    const llm = {
        provider: draft.ai.provider,
        model: draft.ai.model,
        base_url: draft.ai.baseUrl,
        concurrency: draft.ai.concurrency,
        timeout: draft.ai.timeout,
    };
    if (draft.ai.apiKey.trim() !== '' && !draft.ai.apiKey.includes('*'))
        llm.api_key = draft.ai.apiKey.trim();
    return {
        llm,
        news_sources: Object.fromEntries(draft.sources.map(source => [source.id, {
                enabled: source.enabled,
                weight: source.weight,
                refresh_minutes: source.refreshMinutes,
            }])),
        scheduler: {
            pool_target_count: draft.refresh.poolTarget,
            refresh_check_interval_seconds: draft.refresh.pollSeconds,
            trending_refresh_minutes: draft.refresh.hotMinutes,
            explore_refresh_minutes: draft.refresh.exploreMinutes,
            feedback_batch_threshold: draft.refresh.feedbackThreshold,
            proactive_push_enabled: draft.refresh.proactivePush,
            proactive_push_interval_seconds: draft.refresh.pushSeconds,
            background_llm_enabled: draft.refresh.backgroundLlm,
            continue_after_browser_close: draft.refresh.continueAfterClose,
            retry_base_seconds: draft.refresh.retryBaseSeconds,
            retry_max_seconds: draft.refresh.retryMaxSeconds,
            source_share_limit: draft.refresh.sourceShareLimit,
        },
        recommendation: {
            exploration_ratio: draft.recommendation.explorationRatio,
            candidate_ttl_hours: draft.recommendation.candidateTtlHours,
            semantic_dedupe_threshold: draft.recommendation.dedupeThreshold,
            source_diversity_enabled: draft.recommendation.sourceDiversity,
            hard_negative_filter_enabled: draft.recommendation.hardNegativeFilter,
        },
        profile: {
            probe_confirmation_threshold: draft.profile.probeThreshold,
            max_active_probes: draft.profile.maxActiveProbes,
            manual_override_wins: true,
        },
        language: draft.general.language,
        data_dir: draft.general.dataDir,
        storage: { db_path: draft.general.dbPath },
        logging: { level: draft.logs.level, file_level: draft.logs.fileLevel, directory, filename: filename || 'newsclaw.log' },
    };
}
function Field({ label, hint, children }) {
    return _jsxs("div", { className: css.settingsField, children: [_jsx("label", { children: label }), children, hint !== undefined ? _jsx("p", { className: css.settingsHint, children: hint }) : null] });
}
function Section({ title, children }) {
    return _jsxs("section", { className: css.settingsSection, children: [_jsx("h3", { children: title }), children] });
}
function TextInput({ value, onChange, type = 'text', placeholder }) {
    return _jsx("input", { className: css.settingsInput, type: type, value: value, placeholder: placeholder, onChange: event => onChange(event.target.value) });
}
function NumberInput({ value, onChange, min, max, step = 1 }) {
    return _jsx("input", { className: css.settingsInput, type: "number", value: value, min: min, max: max, step: step, onChange: event => onChange(number(event.target.value, value)) });
}
function Toggle({ label, checked, onChange, hint }) {
    return _jsxs("div", { className: css.settingsField, children: [_jsxs("div", { className: css.settingsFieldRow, children: [_jsx("input", { type: "checkbox", checked: checked, onChange: event => onChange(event.target.checked) }), _jsx("label", { children: label })] }), hint !== undefined ? _jsx("p", { className: css.settingsHint, children: hint }) : null] });
}
function AiTab({ draft, patch }) {
    const set = (key, value) => patch({ ...draft, ai: { ...draft.ai, [key]: value } });
    return _jsxs(Section, { title: "\u9ED8\u8BA4 AI \u6A21\u578B", children: [_jsx(Field, { label: "\u63D0\u4F9B\u65B9", children: _jsx(TextInput, { value: draft.ai.provider, onChange: value => set('provider', value) }) }), _jsx(Field, { label: "\u6A21\u578B", children: _jsx(TextInput, { value: draft.ai.model, onChange: value => set('model', value) }) }), _jsx(Field, { label: "Base URL", children: _jsx(TextInput, { value: draft.ai.baseUrl, onChange: value => set('baseUrl', value) }) }), _jsx(Field, { label: "API Key", hint: draft.ai.apiKeyConfigured ? '已配置（值已隐藏）；留空会保留后端现有密钥。' : '尚未配置；页面不会读取或回显真实密钥。', children: _jsx(TextInput, { type: "password", value: draft.ai.apiKey, placeholder: draft.ai.apiKeyConfigured ? '已配置，值已隐藏' : '输入新密钥', onChange: value => set('apiKey', value) }) }), _jsx(Field, { label: "\u5E76\u53D1", children: _jsx(NumberInput, { value: draft.ai.concurrency, min: 1, max: 16, onChange: value => set('concurrency', value) }) }), _jsx(Field, { label: "\u8D85\u65F6\uFF08\u79D2\uFF09", children: _jsx(NumberInput, { value: draft.ai.timeout, min: 10, max: 1800, onChange: value => set('timeout', value) }) })] });
}
function SourcesTab({ draft, patch }) {
    const update = (index, partial) => patch({ ...draft, sources: draft.sources.map((source, i) => i === index ? { ...source, ...partial } : source) });
    if (draft.sources.length === 0)
        return _jsx(Section, { title: "\u65B0\u95FB\u6765\u6E90", children: _jsx("p", { className: css.settingsHint, children: "\u540E\u7AEF\u8FD8\u6CA1\u6709\u8FD4\u56DE\u65B0\u95FB\u6E90\u914D\u7F6E\u3002\u9996\u6B21\u542F\u52A8\u4F1A\u9A8C\u8BC1 Tushare \u4E0E RSS \u5951\u7EA6\u3002" }) });
    return _jsx(_Fragment, { children: draft.sources.map((source, index) => _jsxs(Section, { title: source.name, children: [_jsxs("p", { className: css.settingsHint, children: ["\u6280\u672F\u63D0\u4F9B\u65B9\uFF1A", source.provider || '未标注', " \u00B7 \u72B6\u6001\uFF1A", source.health === 'online' ? '在线' : source.health === 'degraded' ? '降级' : source.health === 'offline' ? '离线' : '待验证'] }), _jsx(Toggle, { label: "\u542F\u7528", checked: source.enabled, onChange: enabled => update(index, { enabled }) }), _jsx(Field, { label: "\u6743\u91CD", children: _jsx(NumberInput, { value: source.weight, min: 0, max: 10, step: 0.1, onChange: weight => update(index, { weight }) }) }), _jsx(Field, { label: "\u5237\u65B0\u9891\u7387\uFF08\u5206\u949F\uFF09", children: _jsx(NumberInput, { value: source.refreshMinutes, min: 1, max: 1440, onChange: refreshMinutes => update(index, { refreshMinutes }) }) }), source.lastSuccess !== '' ? _jsxs("p", { className: css.settingsHint, children: ["\u6700\u540E\u6210\u529F\uFF1A", source.lastSuccess] }) : null, source.error !== '' ? _jsxs("p", { className: css.settingsHint, children: ["\u5F53\u524D\u9519\u8BEF\uFF1A", source.error] }) : null] }, source.id)) });
}
function RefreshTab({ draft, patch }) {
    const set = (key, value) => patch({ ...draft, refresh: { ...draft.refresh, [key]: value } });
    const r = draft.refresh;
    return _jsxs(_Fragment, { children: [_jsxs(Section, { title: "\u5019\u9009\u6C60\u4E0E\u5237\u65B0", children: [_jsx(Field, { label: "\u5019\u9009\u6C60\u76EE\u6807\u6570", children: _jsx(NumberInput, { value: r.poolTarget, min: 20, max: 2000, onChange: value => set('poolTarget', value) }) }), _jsx(Field, { label: "\u5237\u65B0\u8F6E\u8BE2\uFF08\u79D2\uFF09", children: _jsx(NumberInput, { value: r.pollSeconds, min: 15, max: 3600, onChange: value => set('pollSeconds', value) }) }), _jsx(Field, { label: "\u70ED\u95E8\u5237\u65B0\uFF08\u5206\u949F\uFF09", children: _jsx(NumberInput, { value: r.hotMinutes, min: 1, max: 1440, onChange: value => set('hotMinutes', value) }) }), _jsx(Field, { label: "\u63A2\u7D22\u5237\u65B0\uFF08\u5206\u949F\uFF09", children: _jsx(NumberInput, { value: r.exploreMinutes, min: 1, max: 1440, onChange: value => set('exploreMinutes', value) }) }), _jsx(Field, { label: "\u53CD\u9988\u89E6\u53D1\u9608\u503C", children: _jsx(NumberInput, { value: r.feedbackThreshold, min: 1, max: 100, onChange: value => set('feedbackThreshold', value) }) }), _jsx(Field, { label: "\u5355\u4E00\u6765\u6E90\u6700\u9AD8\u5360\u6BD4", children: _jsx(NumberInput, { value: r.sourceShareLimit, min: 0.1, max: 1, step: 0.05, onChange: value => set('sourceShareLimit', value) }) })] }), _jsxs(Section, { title: "\u540E\u53F0\u4E0E\u91CD\u8BD5", children: [_jsx(Toggle, { label: "\u4E3B\u52A8\u63A8\u9001", checked: r.proactivePush, onChange: value => set('proactivePush', value) }), _jsx(Field, { label: "\u63A8\u9001\u8F6E\u8BE2\uFF08\u79D2\uFF09", children: _jsx(NumberInput, { value: r.pushSeconds, min: 30, max: 86400, onChange: value => set('pushSeconds', value) }) }), _jsx(Toggle, { label: "\u540E\u53F0\u8FD0\u884C AI", checked: r.backgroundLlm, onChange: value => set('backgroundLlm', value) }), _jsx(Toggle, { label: "\u5173\u95ED\u6D4F\u89C8\u5668\u540E\u7EE7\u7EED\u5237\u65B0", checked: r.continueAfterClose, onChange: value => set('continueAfterClose', value) }), _jsx(Field, { label: "\u91CD\u8BD5\u8D77\u59CB\uFF08\u79D2\uFF09", children: _jsx(NumberInput, { value: r.retryBaseSeconds, min: 1, max: 300, onChange: value => set('retryBaseSeconds', value) }) }), _jsx(Field, { label: "\u91CD\u8BD5\u4E0A\u9650\uFF08\u79D2\uFF09", children: _jsx(NumberInput, { value: r.retryMaxSeconds, min: 10, max: 3600, onChange: value => set('retryMaxSeconds', value) }) })] })] });
}
function RecommendationTab({ draft, patch }) {
    const set = (key, value) => patch({ ...draft, recommendation: { ...draft.recommendation, [key]: value } });
    const r = draft.recommendation;
    return _jsxs(Section, { title: "\u63A8\u8350\u6C60\u89C4\u5219", children: [_jsx(Field, { label: "\u63A2\u7D22\u6BD4\u4F8B", children: _jsx(NumberInput, { value: r.explorationRatio, min: 0, max: 1, step: 0.05, onChange: value => set('explorationRatio', value) }) }), _jsx(Field, { label: "\u5019\u9009\u65F6\u6548\uFF08\u5C0F\u65F6\uFF09", children: _jsx(NumberInput, { value: r.candidateTtlHours, min: 1, max: 720, onChange: value => set('candidateTtlHours', value) }) }), _jsx(Field, { label: "\u8BED\u4E49\u53BB\u91CD\u9608\u503C", children: _jsx(NumberInput, { value: r.dedupeThreshold, min: 0.5, max: 1, step: 0.01, onChange: value => set('dedupeThreshold', value) }) }), _jsx(Toggle, { label: "\u6765\u6E90\u591A\u6837\u6027", checked: r.sourceDiversity, onChange: value => set('sourceDiversity', value) }), _jsx(Toggle, { label: "\u8D1F\u53CD\u9988\u7ACB\u5373\u51FA\u6C60", checked: r.hardNegativeFilter, onChange: value => set('hardNegativeFilter', value) })] });
}
function ProfileTab({ draft, patch }) {
    const set = (key, value) => patch({ ...draft, profile: { ...draft.profile, [key]: value } });
    return _jsxs(Section, { title: "\u4E94\u5C42\u753B\u50CF", children: [_jsx("p", { className: css.settingsHint, children: "\u4E8B\u4EF6 \u2192 \u504F\u597D \u2192 \u89C9\u5BDF \u2192 \u6D1E\u5BDF \u2192 \u7075\u9B42\u3002\u624B\u5DE5\u4FEE\u6539\u6C38\u8FDC\u8986\u76D6 AI \u63A8\u65AD\u3002" }), _jsx(Field, { label: "\u63A2\u6D4B\u786E\u8BA4\u9608\u503C", children: _jsx(NumberInput, { value: draft.profile.probeThreshold, min: 1, max: 20, onChange: value => set('probeThreshold', value) }) }), _jsx(Field, { label: "\u540C\u65F6\u6D3B\u8DC3\u63A2\u6D4B\u6570", children: _jsx(NumberInput, { value: draft.profile.maxActiveProbes, min: 1, max: 50, onChange: value => set('maxActiveProbes', value) }) }), _jsx(Toggle, { label: "\u624B\u5DE5\u4FEE\u6539\u4F18\u5148", checked: true, onChange: () => undefined, hint: "\u56FA\u5B9A\u5F00\u542F\uFF0C\u4E0D\u80FD\u88AB AI \u8986\u76D6\u3002" })] });
}
function GeneralTab({ draft, patch, base, onBaseChange, toast }) {
    const [apiBase, setApiBase] = useState(() => readApiBase());
    const [autostart, setAutostart] = useState({ loaded: false, enabled: false, busy: false });
    useEffect(() => {
        let cancelled = false;
        void fetchAutostartStatus(base).then(value => { if (!cancelled)
            setAutostart({ loaded: true, enabled: value.enabled, busy: false }); }).catch(() => { if (!cancelled)
            setAutostart({ loaded: true, enabled: false, busy: false }); });
        return () => { cancelled = true; };
    }, [base]);
    const saveBase = () => {
        const next = (apiBase.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
        writeApiBase(next);
        onBaseChange(next);
        toast('后端地址已保存。');
    };
    const toggleAutostart = async (enabled) => {
        setAutostart(value => ({ ...value, busy: true }));
        try {
            await applyAutostart(base, enabled);
            setAutostart({ loaded: true, enabled, busy: false });
        }
        catch (error) {
            toast(error instanceof Error ? error.message : String(error));
            setAutostart(value => ({ ...value, busy: false }));
        }
    };
    return _jsxs(_Fragment, { children: [_jsxs(Section, { title: "\u8FDE\u63A5", children: [_jsx(Field, { label: "\u540E\u7AEF\u5730\u5740", children: _jsx(TextInput, { value: apiBase, placeholder: DEFAULT_API_BASE, onChange: setApiBase }) }), _jsx(ActionButton, { label: "\u4FDD\u5B58\u5730\u5740", primary: true, onClick: saveBase })] }), _jsxs(Section, { title: "\u672C\u5730\u6570\u636E", children: [_jsx(Field, { label: "\u8BED\u8A00", children: _jsx(TextInput, { value: draft.general.language, onChange: value => patch({ ...draft, general: { ...draft.general, language: value } }) }) }), _jsx(Field, { label: "\u6570\u636E\u76EE\u5F55", children: _jsx(TextInput, { value: draft.general.dataDir, onChange: value => patch({ ...draft, general: { ...draft.general, dataDir: value } }) }) }), _jsx(Field, { label: "\u6570\u636E\u5E93", children: _jsx(TextInput, { value: draft.general.dbPath, onChange: value => patch({ ...draft, general: { ...draft.general, dbPath: value } }) }) }), _jsx(Toggle, { label: "\u5F00\u673A\u81EA\u52A8\u542F\u52A8\u65B0\u95FB\u722A", checked: autostart.enabled, onChange: value => void toggleAutostart(value), hint: !autostart.loaded ? '正在读取状态…' : autostart.busy ? '正在应用…' : undefined })] })] });
}
function LogsTab({ draft, patch }) {
    return _jsxs(Section, { title: "\u65E5\u5FD7", children: [_jsx(Field, { label: "\u63A7\u5236\u53F0\u7EA7\u522B", children: _jsx(TextInput, { value: draft.logs.level, onChange: value => patch({ ...draft, logs: { ...draft.logs, level: value } }) }) }), _jsx(Field, { label: "\u6587\u4EF6\u7EA7\u522B", children: _jsx(TextInput, { value: draft.logs.fileLevel, onChange: value => patch({ ...draft, logs: { ...draft.logs, fileLevel: value } }) }) }), _jsx(Field, { label: "\u65E5\u5FD7\u8DEF\u5F84", hint: "\u65E5\u5FD7\u4E0D\u5F97\u5305\u542B Token\u3001API Key \u6216\u672A\u8131\u654F\u914D\u7F6E\u3002", children: _jsx(TextInput, { value: draft.logs.path, onChange: value => patch({ ...draft, logs: { ...draft.logs, path: value } }) }) })] });
}
export function SettingsOverlay({ base, onBaseChange, onClose }) {
    const [tab, setTab] = useState('ai');
    const [draft, setDraft] = useState(null);
    const [saved, setSaved] = useState('');
    const [toast, setToast] = useState('');
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        try {
            const [config, availability] = await Promise.all([
                fetchConfig(base),
                fetchSourceAvailability(base).catch(() => []),
            ]);
            const next = buildDraft(config, availability);
            setDraft(next);
            setSaved(JSON.stringify(next));
        }
        catch (error) {
            setToast('配置读取失败：' + (error instanceof Error ? error.message : String(error)));
            const next = buildDraft({});
            setDraft(next);
            setSaved(JSON.stringify(next));
        }
    }, [base]);
    useEffect(() => { void load(); }, [load]);
    const dirty = useMemo(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved]);
    const save = useCallback(async () => {
        if (draft === null)
            return;
        setSaving(true);
        try {
            await updateConfig(base, buildPayload(draft));
            setToast('配置已保存并热更新。');
            await load();
        }
        catch (error) {
            setToast('保存失败，后端应继续使用最后一份可用配置：' + (error instanceof Error ? error.message : String(error)));
        }
        finally {
            setSaving(false);
        }
    }, [base, draft, load]);
    return _jsx("div", { className: css.settingsOverlay, onClick: event => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: css.settingsPanel, children: [_jsxs("div", { className: css.settingsHeader, children: [_jsx("h2", { children: "\u65B0\u95FB\u722A\u8BBE\u7F6E" }), _jsx("button", { type: "button", className: css.settingsBack, title: "\u8FD4\u56DE", onClick: onClose, children: "\u2190" })] }), _jsx("div", { className: css.settingsTabs, role: "tablist", children: TABS.map(row => _jsx("button", { type: "button", className: css.settingsTab, "data-active": tab === row.key, onClick: () => setTab(row.key), children: row.label }, row.key)) }), _jsxs("div", { className: css.settingsBody, children: [toast !== '' ? _jsx("div", { className: css.settingsToastBar, role: "status", children: toast }) : null, draft === null ? _jsx("div", { className: css.empty, children: "\u914D\u7F6E\u52A0\u8F7D\u4E2D\u2026" }) : _jsxs(_Fragment, { children: [tab === 'ai' ? _jsx(AiTab, { draft: draft, patch: setDraft }) : null, tab === 'sources' ? _jsx(SourcesTab, { draft: draft, patch: setDraft }) : null, tab === 'refresh' ? _jsx(RefreshTab, { draft: draft, patch: setDraft }) : null, tab === 'recommendation' ? _jsx(RecommendationTab, { draft: draft, patch: setDraft }) : null, tab === 'profile' ? _jsx(ProfileTab, { draft: draft, patch: setDraft }) : null, tab === 'general' ? _jsx(GeneralTab, { draft: draft, patch: setDraft, base: base, onBaseChange: onBaseChange, toast: setToast }) : null, tab === 'logs' ? _jsx(LogsTab, { draft: draft, patch: setDraft }) : null, _jsxs("div", { className: css.settingsSavebar, children: [_jsx("span", { className: css.settingsSavebarMsg, children: dirty ? '有未保存的修改' : '已保存' }), _jsx(ActionButton, { label: "\u4FDD\u5B58\u914D\u7F6E", primary: true, disabled: !dirty || saving, onClick: () => void save() })] })] })] })] }) });
}
//# sourceMappingURL=settings.js.map