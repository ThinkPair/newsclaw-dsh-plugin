/**
 * NewsClaw REST client for the browser half. Talks to the user's local
 * backend directly (CORS is permissive). The Harness row config is the
 * primary connection source and is mirrored to localStorage for legacy view
 * fallbacks. Settings reads the dedicated NewsClaw runtime/source contracts;
 * it never writes the legacy generic config endpoint.
 * @module @newsclaw/dsh-plugin
 */
/** localStorage key for the API base URL. */
export const API_BASE_KEY = 'newsclaw.apiBase';
/** Default local backend address. */
export const DEFAULT_API_BASE = 'http://127.0.0.1:8430';
/** Read the persisted API base URL (falling back to the default). */
export function readApiBase() {
    try {
        const saved = localStorage.getItem(API_BASE_KEY);
        if (saved !== null && saved.trim() !== '')
            return saved.trim().replace(/\/+$/, '');
    }
    catch {
        // localStorage unavailable (private mode etc.) — use the default.
    }
    return DEFAULT_API_BASE;
}
/** Persist the API base URL. */
export function writeApiBase(base) {
    try {
        localStorage.setItem(API_BASE_KEY, base.trim().replace(/\/+$/, ''));
    }
    catch {
        // ignore persistence failures
    }
}
/**
 * Build a concise human-readable summary from a backend error `detail` so the
 * failure toast shows WHICH field failed validation, not just `failed: 422`.
 * FastAPI wraps validation errors as `{ detail: [{ loc, msg, ... }] }` (or a
 * plain string), so unwrap that envelope and render each entry as `loc.path: msg`.
 */
function summarizeDetail(detail) {
    let value = detail;
    if (typeof value === 'object' && value !== null && 'detail' in value) {
        value = value.detail;
    }
    if (typeof value === 'string') {
        return value.trim() === '' ? '' : value.trim();
    }
    if (Array.isArray(value)) {
        const parts = [];
        for (const entry of value) {
            if (typeof entry !== 'object' || entry === null)
                continue;
            const rec = entry;
            const msg = typeof rec.msg === 'string' ? rec.msg : '';
            if (msg === '')
                continue;
            const loc = Array.isArray(rec.loc)
                ? rec.loc.filter((seg) => typeof seg === 'string').join('.')
                : '';
            parts.push(loc === '' ? msg : `${loc}: ${msg}`);
        }
        return parts.join('; ');
    }
    return '';
}
/** Request error carrying the HTTP status and server detail. */
export class ApiError extends Error {
    status;
    detail;
    constructor(path, status, detail) {
        const summary = summarizeDetail(detail);
        super(`${path} failed: ${status}${summary === '' ? '' : ` — ${summary}`}`);
        this.status = status;
        this.detail = detail;
    }
}
/** Minimal timeout helper: AbortController + cleanup. */
function withTimeout(ms, outer) {
    if (ms <= 0)
        return { cleanup() { } };
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (outer !== undefined) {
        if (outer.aborted)
            controller.abort();
        else
            outer.addEventListener('abort', onOuterAbort, { once: true });
    }
    const timer = window.setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cleanup() {
            window.clearTimeout(timer);
            outer?.removeEventListener('abort', onOuterAbort);
        },
    };
}
/** One raw JSON request against the NewsClaw backend. */
export async function requestJson(base, path, options = {}) {
    const { method = 'GET', body, headers, timeoutMs = 15_000, signal } = options;
    const timeout = withTimeout(timeoutMs, signal);
    try {
        const res = await fetch(`${base}${path}`, {
            method,
            credentials: 'omit',
            signal: timeout.signal,
            headers: body === undefined && headers === undefined ? undefined : { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) {
            let detail = null;
            try {
                detail = await res.json();
            }
            catch {
                detail = null;
            }
            throw new ApiError(path, res.status, detail);
        }
        return res.json();
    }
    finally {
        timeout.cleanup();
    }
}
function asItems(value) {
    if (typeof value !== 'object' || value === null)
        return [];
    const items = value.items;
    return Array.isArray(items) ? items : [];
}
function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
/** Decode HTML entities occasionally returned by RSS/API source payloads;
 *  `&amp;` is decoded last so double-escaped text unwraps once. */
function decodeEntities(value) {
    if (value.indexOf('&') === -1)
        return value;
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}
function str(value) {
    return typeof value === 'string' ? decodeEntities(value) : '';
}
/**
 * Normalize one remote cover URL before it is handed to the image proxy.
 * Some source adapters still emit protocol-relative or HTTP CDN URLs; HTTPS
 * is required here because the DSH page itself is commonly served securely.
 */
export function normalizeImageUrl(value) {
    const url = str(value).trim();
    if (url === '')
        return '';
    if (url.startsWith('//'))
        return `https:${url}`;
    if (/^http:\/\//i.test(url))
        return `https://${url.slice('http://'.length)}`;
    return url;
}
/**
 * Build the same backend image-proxy URL used by the browser and PC Web
 * clients. Keeping the remote URL behind the local backend avoids hotlink,
 * referrer and media-CDN CORS failures.
 */
export function imageProxyUrl(base, value) {
    const url = normalizeImageUrl(value);
    if (url === '')
        return '';
    try {
        new URL(url);
    }
    catch {
        return '';
    }
    const apiBase = base.trim().replace(/\/+$/, '');
    return apiBase === '' ? '' : `${apiBase}/api/image-proxy?url=${encodeURIComponent(url)}`;
}
/** Mark cross-origin proxy images so the backend can apply its CORS policy. */
export function imageProxyCrossOrigin(base) {
    if (typeof window === 'undefined')
        return undefined;
    try {
        return new URL(base, window.location.href).origin === window.location.origin ? undefined : 'anonymous';
    }
    catch {
        return undefined;
    }
}
/** Return the first non-empty text field, preserving the backend's fallbacks. */
function firstText(...values) {
    for (const value of values) {
        const text = str(value).trim();
        if (text !== '')
            return text;
    }
    return '';
}
/** Cover fields used by current and older source payloads. */
function coverUrl(row) {
    return normalizeImageUrl(firstText(row.cover_url, row.cover, row.pic, row.thumbnail_url, row.thumbnail, row.image_url));
}
/** Defensive coercion of one recommendation row. */
function toRecommendation(row) {
    return {
        id: num(row.id),
        article_id: firstText(row.article_id, row.content_id, row.item_key),
        item_key: firstText(row.item_key, row.article_id, row.content_id),
        title: str(row.title),
        publisher_name: firstText(row.publisher_name, row.author_name, row.media),
        technical_provider: firstText(row.technical_provider, row.provider),
        cover_url: coverUrl(row),
        expression: firstText(row.why_for_you, row.expression, row.recommendation_reason),
        why_for_you: firstText(row.why_for_you, row.expression, row.recommendation_reason),
        impact_chain: Array.isArray(row.impact_chain) ? row.impact_chain.map(String) : [],
        observation_points: Array.isArray(row.observation_points) ? row.observation_points.map(String) : [],
        topic_label: str(row.topic_label),
        content_id: firstText(row.content_id, row.article_id),
        content_url: firstText(row.original_url, row.content_url),
        original_url: firstText(row.original_url, row.content_url),
        media: str(row.media),
        body_level: firstText(row.body_level, row.content_level, 'title'),
        content_type: firstText(row.content_type, 'article'),
        body_text: firstText(row.body_text, row.body, row.content, row.summary),
        published_label: str(row.published_label),
        published_at: str(row.published_at),
        presented: row.presented === true,
    };
}
/** Defensive coercion of one spotlight row. */
function toSpotlight(row) {
    return {
        article_id: firstText(row.article_id, row.content_id, row.item_key),
        item_key: firstText(row.item_key, row.article_id, row.content_id),
        content_id: firstText(row.content_id, row.article_id),
        title: str(row.title),
        spotlight_reason: str(row.spotlight_reason),
        spotlight_score: num(row.spotlight_score),
        spotlight_hook: str(row.spotlight_hook),
        cover_url: coverUrl(row),
        content_url: firstText(row.original_url, row.content_url),
        original_url: firstText(row.original_url, row.content_url),
        media: str(row.media),
        technical_provider: firstText(row.technical_provider, row.provider),
        body_level: firstText(row.body_level, row.content_level, 'title'),
        impact_chain: Array.isArray(row.impact_chain) ? row.impact_chain.map(String) : [],
        observation_points: Array.isArray(row.observation_points) ? row.observation_points.map(String) : [],
        published_label: str(row.published_label),
        content_type: str(row.content_type),
        body_text: str(row.body_text),
        state: str(row.state),
    };
}
/** Defensive coercion of one probe row. */
function toProbe(row) {
    return {
        domain: str(row.domain),
        reason: str(row.reason),
        confidence: num(row.confidence),
        status: str(row.status),
        probe_mode: str(row.probe_mode),
        challenge: str(row.challenge),
    };
}
/** Defensive coercion of one saved row. */
function toSaved(row) {
    return {
        item_key: firstText(row.item_key, row.article_id, row.content_id),
        article_id: firstText(row.article_id, row.content_id, row.item_key),
        media: str(row.media),
        content_id: firstText(row.content_id, row.article_id),
        content_url: firstText(row.original_url, row.content_url),
        content_type: str(row.content_type),
        title: str(row.title),
        author_name: str(row.author_name),
        cover_url: coverUrl(row),
        note: str(row.note),
        added_at: str(row.added_at),
    };
}
// ── Endpoints (user-consumption surface only) ───────────────────────────────
/** GET /api/recommendations — the current recommendation snapshot. */
export async function fetchRecommendations(base, signal) {
    const data = await requestJson(base, '/api/recommendations', { timeoutMs: 20_000, signal });
    return asItems(data).map(toRecommendation);
}
/** POST /api/recommendations/reshuffle — replace the current page. */
export async function reshuffleRecommendations(base, opts = {}, signal) {
    const body = {};
    if (opts.media !== undefined && opts.media !== '')
        body.media = opts.media;
    if (opts.excludedArticleIds !== undefined && opts.excludedArticleIds.length > 0)
        body.excluded_article_ids = opts.excludedArticleIds;
    const data = await requestJson(base, '/api/recommendations/reshuffle', { method: 'POST', body, timeoutMs: 20_000, signal });
    return asItems(data).map(toRecommendation);
}
/** POST /api/recommendations/append — append another page. */
export async function appendRecommendations(base, opts = {}, signal) {
    const body = {};
    if (opts.media !== undefined && opts.media !== '')
        body.media = opts.media;
    if (opts.excludedArticleIds !== undefined && opts.excludedArticleIds.length > 0)
        body.excluded_article_ids = opts.excludedArticleIds;
    const data = await requestJson(base, '/api/recommendations/append', { method: 'POST', body, timeoutMs: 20_000, signal });
    return asItems(data).map(toRecommendation);
}
/** POST /api/recommendation-click — record a click-through (stable request_id). */
export async function reportClick(base, payload, signal) {
    await requestJson(base, '/api/recommendation-click', { method: 'POST', body: { ...payload }, timeoutMs: 10_000, signal });
}
/** POST /api/feedback — durable card feedback (stable request_id). */
export async function submitFeedback(base, payload, signal) {
    await requestJson(base, '/api/feedback', { method: 'POST', body: { ...payload }, timeoutMs: 10_000, signal });
}
/** POST /api/events — ingest behavior events (e.g. saved-card feedback). */
export async function sendBehaviorEvents(base, events, signal) {
    const data = await requestJson(base, '/api/events', {
        method: 'POST',
        body: { events },
        timeoutMs: 15_000,
        signal,
    });
    const row = typeof data === 'object' && data !== null ? data : {};
    return {
        accepted: num(row.accepted),
        rejected: Array.isArray(row.rejected)
            ? row.rejected.map(r => ({
                index: num(r.index),
                type: str(r.type),
                reason: str(r.reason),
            }))
            : [],
    };
}
/** GET /api/spotlight/pending-batch — the full un-notified spotlight queue. */
export async function fetchSpotlightBatch(base, signal) {
    const data = await requestJson(base, '/api/spotlight/pending-batch?limit=20', { timeoutMs: 15_000, signal });
    return asItems(data).map(toSpotlight);
}
/** GET /api/notifications/pending — one notification-worthy recommendation. */
export async function fetchPendingNotification(base, signal) {
    try {
        const data = await requestJson(base, '/api/notifications/pending', { timeoutMs: 8_000, signal });
        if (typeof data !== 'object' || data === null)
            return null;
        const row = data.item;
        if (typeof row !== 'object' || row === null)
            return null;
        const item = row;
        return {
            recommendation_id: num(item.recommendation_id),
            article_id: str(item.article_id),
            title: str(item.title),
            reason: str(item.reason),
            media: str(item.media),
            original_url: firstText(item.original_url, item.content_url),
        };
    }
    catch {
        return null;
    }
}
/** POST /api/spotlight/respond — view/like/dislike/dismiss/chat (stable request_id). */
export async function respondToSpotlight(base, payload, signal) {
    return requestJson(base, '/api/spotlight/respond', { method: 'POST', body: { ...payload }, timeoutMs: 20_000, signal });
}
/** GET /api/interest-probes/pending — active speculative interests. */
export async function fetchInterestProbes(base, signal) {
    const data = await requestJson(base, '/api/interest-probes/pending', { timeoutMs: 10_000, signal });
    return asItems(data).map(toProbe);
}
/** POST /api/interest-probes/respond — confirm/reject/defer/chat, idempotent. */
export async function respondInterestProbe(base, payload, signal) {
    const body = { domain: payload.domain, response: payload.response, request_id: payload.request_id };
    if (payload.message !== undefined && payload.message !== '')
        body.message = payload.message;
    return requestJson(base, '/api/interest-probes/respond', { method: 'POST', body, timeoutMs: 20_000, signal });
}
/** GET /api/avoidance-probes/pending — active speculative avoidances. */
export async function fetchAvoidanceProbes(base, signal) {
    const data = await requestJson(base, '/api/avoidance-probes/pending', { timeoutMs: 10_000, signal });
    return asItems(data).map(toProbe);
}
/** POST /api/avoidance-probes/respond — confirm/reject/defer/chat, idempotent. */
export async function respondAvoidanceProbe(base, payload, signal) {
    const body = { domain: payload.domain, response: payload.response, request_id: payload.request_id };
    if (payload.message !== undefined && payload.message !== '')
        body.message = payload.message;
    return requestJson(base, '/api/avoidance-probes/respond', { method: 'POST', body, timeoutMs: 20_000, signal });
}
/** POST /api/chat — one Socratic dialogue exchange (returns { reply }). */
export async function sendChat(base, message, signal) {
    const data = await requestJson(base, '/api/chat', { method: 'POST', body: { message }, timeoutMs: 300_000, signal });
    const reply = typeof data === 'object' && data !== null ? str(data.reply) : '';
    return { reply };
}
/** Defensive coercion of one chat turn row. */
function toChatTurn(row) {
    return {
        turn_id: str(row.turn_id),
        session: str(row.session),
        scope: str(row.scope),
        message: str(row.message),
        reply: str(row.reply),
        status: str(row.status),
        error: str(row.error),
        subject_title: str(row.subject_title),
        created_at: str(row.created_at),
        updated_at: str(row.updated_at),
        reply_to_turn_id: str(row.reply_to_turn_id),
        payload: typeof row.payload === 'object' && row.payload !== null ? row.payload : undefined,
    };
}
/** GET /api/chat/turns — durable dialogue history. */
export async function fetchChatTurns(base, session = 'dsh', signal) {
    const data = await requestJson(base, `/api/chat/turns?session=${encodeURIComponent(session)}&limit=50`, { timeoutMs: 10_000, signal });
    return asItems(data).map(toChatTurn);
}
/** POST /api/chat/turns — start one durable dialogue turn (returns the pending turn). */
export async function startChatTurn(base, message, session = 'dsh', replyToTurnId, signal) {
    const body = { session, scope: 'chat', message };
    if (replyToTurnId !== undefined && replyToTurnId !== '')
        body.reply_to_turn_id = replyToTurnId;
    const data = await requestJson(base, '/api/chat/turns', {
        method: 'POST',
        body,
        timeoutMs: 20_000,
        signal,
    });
    if (typeof data !== 'object' || data === null)
        throw new Error('chat/turns: unexpected response');
    return toChatTurn(data);
}
/** GET /api/chat/turns/{turn_id} — poll one durable turn until it settles. */
export async function fetchChatTurn(base, turnId, signal) {
    const data = await requestJson(base, `/api/chat/turns/${encodeURIComponent(turnId)}`, { timeoutMs: 15_000, signal });
    if (typeof data !== 'object' || data === null)
        throw new Error('chat/turns: unexpected response');
    return toChatTurn(data);
}
/** GET /api/chat/pending-confirmations — hypotheses/confusions waiting for the user. */
export async function fetchPendingConfirmations(base, signal) {
    const data = await requestJson(base, '/api/chat/pending-confirmations', { timeoutMs: 10_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    const items = Array.isArray(row.items) ? row.items : [];
    return {
        count: num(row.count),
        items: items.map(item => ({
            ref: str(item.ref),
            kind: str(item.kind),
            title: str(item.title ?? item.hypothesis),
            confidence: num(item.confidence),
            evidence: Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [],
            status: str(item.status),
            observation: str(item.observation),
            interpretation: str(item.interpretation),
        })),
    };
}
/** POST /api/chat/pending-confirmations/{ref}/open — turn a confirmation into a chat turn. */
export async function openPendingConfirmation(base, ref, signal) {
    const data = await requestJson(base, `/api/chat/pending-confirmations/${encodeURIComponent(ref)}/open`, {
        method: 'POST',
        body: { session: 'dsh' },
        timeoutMs: 20_000,
        signal,
    });
    if (typeof data !== 'object' || data === null)
        throw new Error('pending-confirmations/open: unexpected response');
    return toChatTurn(data);
}
/** POST /api/chat/cards/{turn_id}/action — confirm/reject/discuss/defer a hypothesis card.
 *  Returns the settlement response (state/verdict are authoritative). */
export async function actOnChatCard(base, turnId, action, signal) {
    return requestJson(base, `/api/chat/cards/${encodeURIComponent(turnId)}/action`, {
        method: 'POST',
        body: { action },
        timeoutMs: 20_000,
        signal,
    });
}
/** GET /api/content-history — one paginated 30-day history category. */
export async function fetchContentHistory(base, category, cursor = '', signal) {
    const params = new URLSearchParams({ category, limit: '12' });
    if (cursor !== '')
        params.set('cursor', cursor);
    const data = await requestJson(base, `/api/content-history?${params.toString()}`, { timeoutMs: 15_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return {
        items: (Array.isArray(row.items) ? row.items : []).map(item => ({
            item_key: str(item.item_key),
            media: str(item.media),
            content_id: str(item.content_id),
            content_url: str(item.content_url),
            content_type: str(item.content_type),
            title: str(item.title),
            author_name: str(item.author_name),
            cover_url: coverUrl(item),
            body_text: str(item.body_text),
            recommendation_id: item.recommendation_id === null || item.recommendation_id === undefined ? null : num(item.recommendation_id),
            occurred_at: str(item.occurred_at),
            context: str(item.context),
            restored: item.restored === true,
            contexts: Array.isArray(item.contexts)
                ? item.contexts.map(ctx => ({
                    context: str(ctx.context),
                    occurred_at: str(ctx.occurred_at),
                    restored: ctx.restored === true,
                }))
                : [],
        })),
        total: num(row.total),
        hasMore: row.has_more === true,
        nextCursor: str(row.next_cursor),
        retentionDays: num(row.retention_days),
    };
}
/** GET /api/saved/{listKind}/status — saved state for one item (toggle display). */
export async function fetchSavedStatus(base, listKind, itemKey, signal) {
    const data = await requestJson(base, `/api/saved/${listKind}/status?item_key=${encodeURIComponent(itemKey)}`, { timeoutMs: 8_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return row.saved === true;
}
/** GET /api/saved/{listKind} — favorite or watch_later memberships plus total. */
export async function fetchSaved(base, listKind, signal) {
    const data = await requestJson(base, `/api/saved/${listKind}`, { timeoutMs: 10_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return { items: asItems(data).map(toSaved), total: num(row.total) };
}
/** POST /api/saved/{listKind} — add one membership. */
export async function saveItem(base, listKind, payload, signal) {
    await requestJson(base, `/api/saved/${listKind}`, {
        method: 'POST',
        body: { ...payload, content_type: 'article' },
        timeoutMs: 10_000,
        signal,
    });
}
/** POST /api/saved/{listKind}/remove — remove one membership. */
export async function removeSaved(base, listKind, itemKey, signal) {
    await requestJson(base, `/api/saved/${listKind}/remove`, { method: 'POST', body: { item_key: itemKey }, timeoutMs: 10_000, signal });
}
/** GET /api/runtime-status — backend readiness and counts. */
export async function fetchRuntimeStatus(base, signal) {
    try {
        const data = await requestJson(base, '/api/runtime-status', { timeoutMs: 8_000, signal });
        if (typeof data !== 'object' || data === null)
            return null;
        const row = data;
        return {
            initialized: row.initialized === true,
            recommendation_count: num(row.recommendation_count),
            unread_count: num(row.unread_count),
            last_refresh_at: str(row.last_refresh_at),
            pool_available_count: num(row.pool_available_count),
            pool_target_count: num(row.pool_target_count),
            pool_pending_count: num(row.pool_pending_count),
            last_replenished_count: num(row.last_replenished_count),
            last_discovered_count: num(row.last_discovered_count),
            recent_pool_topics: Array.isArray(row.recent_pool_topics) ? row.recent_pool_topics.map(String) : [],
            manual_refresh_state: str(row.manual_refresh_state),
            ...row,
        };
    }
    catch {
        return null;
    }
}
function parseEffectiveSettings(value) {
    const row = typeof value === 'object' && value !== null ? value : {};
    return {
        version: num(row.version),
        pool_target_count: num(row.pool_target_count),
        refresh_poll_minutes: num(row.refresh_poll_minutes),
        hot_refresh_minutes: num(row.hot_refresh_minutes),
        exploration_refresh_minutes: num(row.exploration_refresh_minutes),
        feedback_threshold: num(row.feedback_threshold),
        proactive_push: row.proactive_push === true,
        background_llm: row.background_llm === true,
        browser_close_behavior: str(row.browser_close_behavior),
        retry_max_attempts: num(row.retry_max_attempts),
        retry_base_seconds: num(row.retry_base_seconds),
        retry_max_seconds: num(row.retry_max_seconds),
    };
}
function parseNewsSource(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const row = value;
    const health = typeof row.health === 'object' && row.health !== null ? row.health : {};
    const sourceId = firstText(row.source_id, row.id);
    const media = firstText(row.media, row.name, sourceId);
    if (sourceId === '' && media === '')
        return null;
    return {
        source_id: sourceId || media,
        kind: str(row.kind),
        media,
        technical_provider: firstText(row.technical_provider, row.provider),
        enabled: row.enabled === true,
        custom: row.custom === true,
        credential_configured: row.credential_configured === true,
        status: firstText(row.status, health.status, health.available === true ? 'healthy' : ''),
        last_success_at: firstText(row.last_success_at, health.last_success_at),
        error: firstText(row.error, health.error_message, health.error_code),
    };
}
function parseNewsRuntime(value) {
    const row = typeof value === 'object' && value !== null ? value : {};
    const rawStatus = firstText(row.status, row.last_refresh_status).toLowerCase();
    const status = rawStatus === '' || rawStatus === 'offline'
        ? 'offline'
        : rawStatus === 'degraded' || rawStatus === 'partial' || rawStatus === 'error' || rawStatus === 'failed'
            ? 'degraded'
            : 'online';
    return {
        status,
        last_article_count: num(row.last_article_count),
        last_refresh: str(row.last_refresh),
        last_refresh_status: str(row.last_refresh_status),
        last_schedule_lane: str(row.last_schedule_lane),
        last_schedule_status: str(row.last_schedule_status),
        last_scheduler_check: str(row.last_scheduler_check),
        profile_ready: row.profile_ready === true,
        refresh_running: row.refresh_running === true,
        bootstrap_running: row.bootstrap_running === true,
        effective_settings: parseEffectiveSettings(row.effective_settings),
    };
}
/** GET /api/news/runtime — real NewsClaw runtime and effective settings. */
export async function fetchNewsRuntime(base, signal) {
    const data = await requestJson(base, '/api/news/runtime', { timeoutMs: 10_000, signal });
    return parseNewsRuntime(data);
}
/** GET /api/news/sources — real source inventory and source health. */
export async function fetchNewsSources(base, signal) {
    const data = await requestJson(base, '/api/news/sources', { timeoutMs: 10_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    const sources = Array.isArray(row.sources)
        ? row.sources.map(parseNewsSource).filter((item) => item !== null)
        : [];
    return {
        sources,
        settings: parseEffectiveSettings(row.settings),
        runtime: parseNewsRuntime(row.runtime),
    };
}
/** GET /api/health — reachability plus partial-source degradation. */
export async function fetchHealthState(base, signal) {
    try {
        const data = await requestJson(base, '/api/health', { timeoutMs: 5_000, signal });
        if (typeof data !== 'object' || data === null)
            return 'degraded';
        const row = data;
        const state = str(row.state || row.status).toLowerCase();
        if (state === 'offline')
            return 'offline';
        if (state === 'degraded' || state === 'partial' || state === 'error' || state === 'failed' || row.degraded === true || row.ok === false)
            return 'degraded';
        const sources = row.sources ?? row.source_health;
        const sourceRows = Array.isArray(sources)
            ? sources
            : typeof sources === 'object' && sources !== null ? Object.values(sources) : [];
        if (sourceRows.some(source => {
            if (typeof source !== 'object' || source === null)
                return false;
            const sourceState = str(source.state || source.status).toLowerCase();
            return sourceState === 'degraded' || sourceState === 'offline' || sourceState === 'error' || sourceState === 'failed';
        }))
            return 'degraded';
        return 'online';
    }
    catch {
        return 'offline';
    }
}
/** Read source health through the same versioned Agent Bridge as DSH tools. */
export async function fetchSourceAvailability(base, signal) {
    const reply = await requestJson(base, '/api/agent-bridge', {
        method: 'POST',
        body: { command: 'source-availability', argv: [] },
        timeoutMs: 10_000,
        signal,
    });
    const root = typeof reply === 'object' && reply !== null ? reply : {};
    if (root.ok !== true)
        throw new Error(firstText(root.error, root.message, '新闻源状态读取失败'));
    const data = root.data;
    const dataRow = typeof data === 'object' && data !== null ? data : {};
    const rawItems = Array.isArray(data)
        ? data
        : Array.isArray(dataRow.items) ? dataRow.items
            : Array.isArray(dataRow.sources) ? dataRow.sources
                : Object.entries(dataRow).map(([id, value]) => ({ id, ...((typeof value === 'object' && value !== null) ? value : {}) }));
    return rawItems.map(value => {
        const row = typeof value === 'object' && value !== null ? value : {};
        const rawState = firstText(row.state, row.status, row.health).toLowerCase();
        const state = rawState === 'online' || rawState === 'degraded' || rawState === 'offline' ? rawState : 'unknown';
        return {
            id: firstText(row.id, row.source_id, row.media),
            media: firstText(row.media, row.name, row.id),
            technical_provider: firstText(row.technical_provider, row.provider),
            state,
            last_success_at: firstText(row.last_success_at, row.last_success),
            error: firstText(row.error, row.last_error),
        };
    }).filter(item => item.id !== '' || item.media !== '');
}
/** GET /api/profile-summary — the AI profile summary (canonical surface shape). */
export async function fetchProfileSummary(base, opts = {}) {
    try {
        const params = new URLSearchParams();
        params.set('limit', String(opts.limit ?? 5));
        if (opts.cursor !== undefined && opts.cursor !== '')
            params.set('cursor', opts.cursor);
        const data = await requestJson(base, `/api/profile-summary?${params.toString()}`, { timeoutMs: 10_000, signal: opts.signal });
        if (typeof data !== 'object' || data === null)
            return null;
        const row = data;
        const mbti = typeof row.mbti === 'object' && row.mbti !== null ? row.mbti : {};
        const toDomain = (raw) => {
            if (typeof raw !== 'object' || raw === null)
                return { domain: '', weight: 0, specifics: [] };
            const d = raw;
            return {
                domain: str(d.domain),
                weight: num(d.weight),
                specifics: Array.isArray(d.specifics)
                    ? d.specifics.map(s => ({ name: str(s.name), weight: num(s.weight) }))
                    : [],
            };
        };
        const toProbe = (raw) => {
            if (typeof raw !== 'object' || raw === null)
                return null;
            const p = raw;
            return {
                domain: str(p.domain),
                reason: str(p.reason),
                confidence: num(p.confidence),
                status: str(p.status),
                specifics: Array.isArray(p.specifics) ? p.specifics : [],
                confirmation_count: num(p.confirmation_count),
                confirmation_threshold: num(p.confirmation_threshold),
                probe_mode: str(p.probe_mode),
                challenge: p.challenge === true,
            };
        };
        return {
            initialized: row.initialized === true,
            personality_portrait: str(row.personality_portrait),
            core_traits: Array.isArray(row.core_traits) ? row.core_traits.map(String) : [],
            deep_needs: Array.isArray(row.deep_needs) ? row.deep_needs.map(String) : [],
            mbti: {
                type: str(mbti.type),
                confidence: num(mbti.confidence),
                dimensions: typeof mbti.dimensions === 'object' && mbti.dimensions !== null
                    ? mbti.dimensions
                    : undefined,
            },
            values: Array.isArray(row.values) ? row.values.map(String) : [],
            motivational_drivers: Array.isArray(row.motivational_drivers) ? row.motivational_drivers.map(String) : [],
            likes: Array.isArray(row.likes) ? row.likes.map(toDomain) : [],
            dislikes: Array.isArray(row.dislikes) ? row.dislikes.map(toDomain) : [],
            favorite_sources: Array.isArray(row.favorite_sources) ? row.favorite_sources.map(String) : [],
            life_stage: str(row.life_stage),
            current_phase: str(row.current_phase),
            cognitive_style: Array.isArray(row.cognitive_style) ? row.cognitive_style.map(String) : [],
            exploration_openness: num(row.exploration_openness),
            style: (() => {
                const s = typeof row.style === 'object' && row.style !== null ? row.style : {};
                return {
                    preferred_duration: str(s.preferred_duration),
                    preferred_pace: str(s.preferred_pace),
                    quality_sensitivity: num(s.quality_sensitivity),
                    humor_preference: num(s.humor_preference),
                    depth_preference: num(s.depth_preference),
                };
            })(),
            context: (() => {
                const c = typeof row.context === 'object' && row.context !== null ? row.context : {};
                return {
                    weekday_patterns: str(c.weekday_patterns),
                    weekend_patterns: str(c.weekend_patterns),
                    time_of_day_patterns: str(c.time_of_day_patterns),
                    session_type: str(c.session_type),
                };
            })(),
            speculative_interests: Array.isArray(row.speculative_interests) ? row.speculative_interests.map(toProbe).filter((p) => p !== null) : [],
            speculative_avoidances: Array.isArray(row.speculative_avoidances) ? row.speculative_avoidances.map(toProbe).filter((p) => p !== null) : [],
            recent_cognition_updates: Array.isArray(row.recent_cognition_updates)
                ? row.recent_cognition_updates.map(c => ({
                    summary: str(c.summary),
                    context_line: str(c.context_line),
                    impact: str(c.impact),
                    reasoning: str(c.reasoning),
                    evidence: str(c.evidence),
                    source: str(c.source),
                    source_label: str(c.source_label),
                    expand_hint: str(c.expand_hint),
                    created_at: str(c.created_at),
                }))
                : [],
            has_more_cognition_updates: row.has_more_cognition_updates === true,
            next_cognition_cursor: str(row.next_cognition_cursor),
            overrides: typeof row.overrides === 'object' && row.overrides !== null ? row.overrides : {},
            active_insights: Array.isArray(row.active_insights)
                ? row.active_insights.map(i => ({
                    hypothesis: str(i.hypothesis),
                    evidence: Array.isArray(i.evidence) ? i.evidence.map(String) : [],
                    confidence: num(i.confidence),
                    validated: i.validated === true,
                    created_at: str(i.created_at),
                }))
                : [],
            recent_awareness: Array.isArray(row.recent_awareness)
                ? row.recent_awareness.map(a => ({
                    date: str(a.date),
                    observation: str(a.observation),
                    trend: str(a.trend),
                    emotion_guess: str(a.emotion_guess),
                }))
                : [],
        };
    }
    catch {
        return null;
    }
}
/** GET /api/activity-feed — recent activity entries (cursor pagination). */
export async function fetchActivityFeed(base, opts = {}, signal) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined)
        params.set('limit', String(Math.max(1, Math.min(100, opts.limit))));
    if (opts.before !== undefined && opts.before !== '')
        params.set('before', opts.before);
    const qs = params.toString();
    const data = await requestJson(base, `/api/activity-feed${qs !== '' ? `?${qs}` : ''}`, { timeoutMs: 10_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return {
        items: asItems(data),
        liveSummary: str(row.live_summary),
        headline: str(row.headline),
        hasMore: row.has_more === true,
        nextCursor: str(row.next_cursor),
    };
}
/** Generate one stable idempotency key for a UI action (uuid v4). */
export function stableId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Read boot-autostart state. */
export async function fetchAutostartStatus(base, signal) {
    const data = await requestJson(base, '/api/autostart-status', { timeoutMs: 10_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return { enabled: row.enabled === true };
}
/** Apply boot-autostart on/off. */
export async function applyAutostart(base, enabled, signal) {
    const data = await requestJson(base, '/api/autostart/apply', {
        method: 'POST',
        timeoutMs: 15_000,
        signal,
        headers: { 'X-NewsClaw-Auth': '1' },
        body: { enabled: Boolean(enabled) },
    });
    const row = typeof data === 'object' && data !== null ? data : {};
    return row.ok === true || row.enabled === enabled;
}
/** Read init status. */
export async function fetchInitStatus(base, signal) {
    const data = await requestJson(base, '/api/init-status', { timeoutMs: 45_000, signal });
    const row = typeof data === 'object' && data !== null ? data : {};
    return { initialized: row.initialized === true, running: row.running === true };
}
/** Restart initialization (rebuild profile + discovery pool). */
export async function startInit(base, payload, signal) {
    await requestJson(base, '/api/init', { method: 'POST', timeoutMs: 60_000, signal, body: payload });
}
//# sourceMappingURL=api.js.map