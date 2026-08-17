/**
 * NewsClaw REST client for the browser half. Talks to the user's local
 * backend directly (CORS is permissive). The Harness row config is the
 * primary connection source and is mirrored to localStorage for legacy view
 * fallbacks. Settings reads the dedicated NewsClaw runtime/source contracts;
 * it never writes the legacy generic config endpoint.
 * @module @newsclaw/dsh-plugin
 */
/** localStorage key for the API base URL. */
export declare const API_BASE_KEY = "newsclaw.apiBase";
/** Default local backend address. */
export declare const DEFAULT_API_BASE = "http://127.0.0.1:8430";
/** Read the persisted API base URL (falling back to the default). */
export declare function readApiBase(): string;
/** Persist the API base URL. */
export declare function writeApiBase(base: string): void;
/** One recommendation card (RecommendationOut, defensive subset). */
export interface RecommendationItem {
    id: number;
    article_id: string;
    item_key: string;
    title: string;
    publisher_name: string;
    technical_provider: string;
    cover_url: string;
    expression: string;
    why_for_you: string;
    impact_chain: string[];
    observation_points: string[];
    topic_label: string;
    content_id: string;
    content_url: string;
    original_url: string;
    media: string;
    body_level: string;
    content_type: string;
    body_text: string;
    published_label: string;
    published_at: string;
    presented: boolean;
}
/** One proactive spotlight card (PendingSpotlightOut subset). */
export interface SpotlightItem {
    article_id: string;
    item_key: string;
    content_id: string;
    title: string;
    spotlight_reason: string;
    spotlight_score: number;
    spotlight_hook: string;
    cover_url: string;
    content_url: string;
    original_url: string;
    media: string;
    technical_provider: string;
    body_level: string;
    impact_chain: string[];
    observation_points: string[];
    published_label: string;
    content_type: string;
    body_text: string;
    state?: string;
}
/** One probe hypothesis (interest or avoidance). */
export interface ProbeItem {
    domain: string;
    reason: string;
    confidence: number;
    status: string;
    probe_mode?: string;
    challenge?: string;
}
/** One saved membership (SavedListItem subset). */
export interface SavedItem {
    item_key: string;
    article_id: string;
    media: string;
    content_id: string;
    content_url: string;
    content_type: string;
    title: string;
    author_name: string;
    cover_url: string;
    note: string;
    added_at: string;
}
/** One page of saved memberships with the backend total count. */
export interface SavedListPage {
    items: SavedItem[];
    total: number;
}
/** One news source's runtime state, independent from editable config. */
export interface SourceAvailability {
    id: string;
    media: string;
    technical_provider: string;
    state: HealthState | 'unknown';
    last_success_at: string;
    error: string;
}
/** Effective scheduler settings returned by the dedicated NewsClaw API. */
export interface NewsEffectiveSettings {
    version: number;
    pool_target_count: number;
    refresh_poll_minutes: number;
    hot_refresh_minutes: number;
    exploration_refresh_minutes: number;
    feedback_threshold: number;
    proactive_push: boolean;
    background_llm: boolean;
    browser_close_behavior: string;
    retry_max_attempts: number;
    retry_base_seconds: number;
    retry_max_seconds: number;
}
/** One source row from /api/news/sources (read-only in the DSH panel). */
export interface NewsSourceState {
    source_id: string;
    kind: string;
    media: string;
    technical_provider: string;
    enabled: boolean;
    custom: boolean;
    credential_configured: boolean;
    status: string;
    last_success_at: string;
    error: string;
}
/** Runtime state used by the truthful DSH settings summary. */
export interface NewsRuntimeSnapshot {
    status: HealthState;
    last_article_count: number;
    last_refresh: string;
    last_refresh_status: string;
    last_schedule_lane: string;
    last_schedule_status: string;
    last_scheduler_check: string;
    profile_ready: boolean;
    refresh_running: boolean;
    bootstrap_running: boolean;
    effective_settings: NewsEffectiveSettings;
}
/** Source inventory plus the effective settings/runtime returned beside it. */
export interface NewsSourcesSnapshot {
    sources: NewsSourceState[];
    settings: NewsEffectiveSettings;
    runtime: NewsRuntimeSnapshot;
}
/** One chat turn. */
export interface ChatTurn {
    turn_id: string;
    session: string;
    scope: string;
    message: string;
    reply: string;
    status: string;
    error: string;
    subject_title: string;
    created_at?: string;
    updated_at?: string;
    reply_to_turn_id?: string;
    payload?: Record<string, unknown>;
}
/** One 30-day content-history item. */
export interface ContentHistoryItem {
    item_key: string;
    media: string;
    content_id: string;
    content_url: string;
    content_type: string;
    title: string;
    author_name: string;
    cover_url: string;
    body_text: string;
    recommendation_id: number | null;
    occurred_at: string;
    context: string;
    restored: boolean;
    contexts: Array<{
        context: string;
        occurred_at: string;
        restored: boolean;
    }>;
}
/** One pending dialogue confirmation (hypothesis/confusion). */
export interface PendingConfirmation {
    ref: string;
    kind: string;
    title: string;
    confidence: number;
    evidence: string[];
    status: string;
    /** Confusion items: what the system observed and how it reads it. */
    observation: string;
    interpretation: string;
}
/** Full profile summary (canonical surface fields). */
/** One recent cognition update (profile tab, popup parity). */
export interface CognitionUpdate {
    summary: string;
    context_line: string;
    impact: string;
    reasoning: string;
    evidence: string;
    source: string;
    source_label: string;
    expand_hint: string;
    created_at: string;
}
export interface ProfileSummary {
    initialized: boolean;
    personality_portrait: string;
    core_traits: string[];
    deep_needs: string[];
    mbti: {
        type: string;
        confidence: number;
        dimensions?: Record<string, {
            pole: string;
            strength: number;
        }>;
    };
    values: string[];
    motivational_drivers: string[];
    likes: Array<{
        domain: string;
        weight: number;
        specifics: Array<{
            name: string;
            weight: number;
        }>;
    }>;
    dislikes: Array<{
        domain: string;
        weight: number;
        specifics: Array<{
            name: string;
            weight: number;
        }>;
    }>;
    favorite_sources: string[];
    life_stage: string;
    current_phase: string;
    cognitive_style: string[];
    exploration_openness: number;
    style: {
        preferred_duration: string;
        preferred_pace: string;
        quality_sensitivity: number;
        humor_preference: number;
        depth_preference: number;
    };
    context: {
        weekday_patterns: string;
        weekend_patterns: string;
        time_of_day_patterns: string;
        session_type: string;
    };
    speculative_interests: Array<{
        domain: string;
        reason: string;
        confidence: number;
        status: string;
        specifics: unknown[];
        confirmation_count: number;
        confirmation_threshold: number;
        probe_mode?: string;
        challenge?: boolean;
    }>;
    speculative_avoidances: Array<{
        domain: string;
        reason: string;
        confidence: number;
        status: string;
        specifics: unknown[];
        confirmation_count: number;
        confirmation_threshold: number;
    }>;
    recent_cognition_updates: CognitionUpdate[];
    has_more_cognition_updates: boolean;
    next_cognition_cursor: string;
    active_insights: Array<{
        hypothesis: string;
        evidence: string[];
        confidence: number;
        validated: boolean;
        created_at?: string;
    }>;
    recent_awareness: Array<{
        date: string;
        observation: string;
        trend: string;
        emotion_guess: string;
    }>;
    overrides: Record<string, unknown>;
}
/** One activity feed item. */
export interface ActivityItem {
    id?: string;
    kind?: string;
    summary?: string;
    occurred_at?: string;
    [key: string]: unknown;
}
/** Runtime status (defensive subset). */
export interface RuntimeStatus {
    initialized: boolean;
    recommendation_count: number;
    unread_count: number;
    last_refresh_at: string;
    pool_available_count: number;
    pool_target_count: number;
    pool_pending_count: number;
    last_replenished_count: number;
    last_discovered_count: number;
    recent_pool_topics: string[];
    manual_refresh_state: string;
    [key: string]: unknown;
}
/** Durable state of the NewsClaw-only first setup flow. */
export interface NewsBootstrapStatus {
    status: string;
    running: boolean;
    profile_ready: boolean;
    detail: string;
}
/** Request error carrying the HTTP status and server detail. */
export declare class ApiError extends Error {
    readonly status: number;
    readonly detail: unknown;
    constructor(path: string, status: number, detail: unknown);
}
/** One raw JSON request against the NewsClaw backend. */
export declare function requestJson(base: string, path: string, options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
}): Promise<unknown>;
/**
 * Normalize one remote cover URL before it is handed to the image proxy.
 * Some source adapters still emit protocol-relative or HTTP CDN URLs; HTTPS
 * is required here because the DSH page itself is commonly served securely.
 */
export declare function normalizeImageUrl(value: unknown): string;
/**
 * Build the same backend image-proxy URL used by the browser and PC Web
 * clients. Keeping the remote URL behind the local backend avoids hotlink,
 * referrer and media-CDN CORS failures.
 */
export declare function imageProxyUrl(base: string, value: unknown): string;
/** Mark cross-origin proxy images so the backend can apply its CORS policy. */
export declare function imageProxyCrossOrigin(base: string): 'anonymous' | undefined;
/** GET /api/recommendations — the current recommendation snapshot. */
export declare function fetchRecommendations(base: string, signal?: AbortSignal): Promise<RecommendationItem[]>;
/** POST /api/recommendations/reshuffle — replace the current page. */
export declare function reshuffleRecommendations(base: string, opts?: {
    media?: string;
    excludedArticleIds?: string[];
}, signal?: AbortSignal): Promise<RecommendationItem[]>;
/** POST /api/recommendations/append — append another page. */
export declare function appendRecommendations(base: string, opts?: {
    media?: string;
    excludedArticleIds?: string[];
}, signal?: AbortSignal): Promise<RecommendationItem[]>;
/** POST /api/recommendation-click — record a click-through (stable request_id). */
export declare function reportClick(base: string, payload: {
    recommendation_id?: number;
    content_id?: string;
    article_id?: string;
    content_url?: string;
    media?: string;
    title?: string;
    request_id: string;
}, signal?: AbortSignal): Promise<void>;
/** POST /api/feedback — durable card feedback (stable request_id). */
export declare function submitFeedback(base: string, payload: {
    recommendation_id: number;
    feedback_type: string;
    note?: string;
    request_id: string;
}, signal?: AbortSignal): Promise<void>;
/** One raw behavior event (service-worker batch item). */
export interface BehaviorEvent {
    type: string;
    url?: string;
    title?: string;
    timestamp: number;
    media?: string;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    event_id: string;
    reading_seconds?: number;
}
/** POST /api/events — ingest behavior events (e.g. saved-card feedback). */
export declare function sendBehaviorEvents(base: string, events: BehaviorEvent[], signal?: AbortSignal): Promise<{
    accepted: number;
    rejected: Array<{
        index: number;
        type: string;
        reason: string;
    }>;
}>;
/** GET /api/spotlight/pending-batch — the full un-notified spotlight queue. */
export declare function fetchSpotlightBatch(base: string, signal?: AbortSignal): Promise<SpotlightItem[]>;
/** GET /api/notifications/pending — one notification-worthy recommendation. */
export declare function fetchPendingNotification(base: string, signal?: AbortSignal): Promise<{
    recommendation_id: number;
    article_id: string;
    title: string;
    reason: string;
    media: string;
    original_url: string;
} | null>;
/** POST /api/notifications/ack — durable, idempotent NewsClaw message acknowledgement. */
export declare function acknowledgeNotification(base: string, articleId: string, requestId: string, signal?: AbortSignal): Promise<void>;
/** POST /api/spotlight/respond — view/like/dislike/dismiss/chat (stable request_id). */
export declare function respondToSpotlight(base: string, payload: {
    article_id: string;
    response: string;
    title?: string;
    message?: string;
    request_id: string;
}, signal?: AbortSignal): Promise<unknown>;
/** GET /api/interest-probes/pending — active speculative interests. */
export declare function fetchInterestProbes(base: string, signal?: AbortSignal): Promise<ProbeItem[]>;
/** POST /api/interest-probes/respond — confirm/reject/defer/chat, idempotent. */
export declare function respondInterestProbe(base: string, payload: {
    domain: string;
    response: string;
    request_id: string;
    message?: string;
}, signal?: AbortSignal): Promise<unknown>;
/** GET /api/avoidance-probes/pending — active speculative avoidances. */
export declare function fetchAvoidanceProbes(base: string, signal?: AbortSignal): Promise<ProbeItem[]>;
/** POST /api/avoidance-probes/respond — confirm/reject/defer/chat, idempotent. */
export declare function respondAvoidanceProbe(base: string, payload: {
    domain: string;
    response: string;
    request_id: string;
    message?: string;
}, signal?: AbortSignal): Promise<unknown>;
/** POST /api/chat — one Socratic dialogue exchange (returns { reply }). */
export declare function sendChat(base: string, message: string, signal?: AbortSignal): Promise<{
    reply: string;
}>;
/** GET /api/chat/turns — durable dialogue history. */
export declare function fetchChatTurns(base: string, session?: string, signal?: AbortSignal): Promise<ChatTurn[]>;
/** POST /api/chat/turns — start one durable dialogue turn (returns the pending turn). */
export declare function startChatTurn(base: string, message: string, session?: string, replyToTurnId?: string, turnId?: string, signal?: AbortSignal): Promise<ChatTurn>;
/** GET /api/chat/turns/{turn_id} — poll one durable turn until it settles. */
export declare function fetchChatTurn(base: string, turnId: string, signal?: AbortSignal): Promise<ChatTurn>;
/** GET /api/chat/pending-confirmations — hypotheses/confusions waiting for the user. */
export declare function fetchPendingConfirmations(base: string, signal?: AbortSignal): Promise<{
    count: number;
    items: PendingConfirmation[];
}>;
/** POST /api/chat/pending-confirmations/{ref}/open — turn a confirmation into a chat turn. */
export declare function openPendingConfirmation(base: string, ref: string, signal?: AbortSignal): Promise<ChatTurn>;
/** POST /api/chat/cards/{turn_id}/action — confirm/reject/discuss/defer a hypothesis card.
 *  Returns the settlement response (state/verdict are authoritative). */
export declare function actOnChatCard(base: string, turnId: string, action: string, signal?: AbortSignal): Promise<unknown>;
/** GET /api/content-history — one paginated 30-day history category. */
export declare function fetchContentHistory(base: string, category: 'clicked' | 'shown' | 'removed', cursor?: string, signal?: AbortSignal): Promise<{
    items: ContentHistoryItem[];
    total: number;
    hasMore: boolean;
    nextCursor: string;
    retentionDays: number;
}>;
/** GET /api/saved/{listKind}/status — saved state for one item (toggle display). */
export declare function fetchSavedStatus(base: string, listKind: 'favorite' | 'watch_later', itemKey: string, signal?: AbortSignal): Promise<boolean>;
/** GET /api/saved/{listKind} — favorite or watch_later memberships plus total. */
export declare function fetchSaved(base: string, listKind: 'favorite' | 'watch_later', signal?: AbortSignal): Promise<SavedListPage>;
/** POST /api/saved/{listKind} — add one membership. */
export declare function saveItem(base: string, listKind: 'favorite' | 'watch_later', payload: {
    article_id: string;
    media?: string;
    original_url?: string;
    title?: string;
    author_name?: string;
    cover_url?: string;
}, signal?: AbortSignal): Promise<void>;
/** POST /api/saved/{listKind}/remove — remove one membership. */
export declare function removeSaved(base: string, listKind: 'favorite' | 'watch_later', itemKey: string, signal?: AbortSignal): Promise<void>;
/** GET /api/runtime-status — backend readiness and counts. */
export declare function fetchRuntimeStatus(base: string, signal?: AbortSignal): Promise<RuntimeStatus | null>;
/** Three-state backend status shared by the DSH, Web and mobile clients. */
export type HealthState = 'online' | 'degraded' | 'offline';
/** GET /api/news/runtime — real NewsClaw runtime and effective settings. */
export declare function fetchNewsRuntime(base: string, signal?: AbortSignal): Promise<NewsRuntimeSnapshot>;
/** GET /api/news/sources — real source inventory and source health. */
export declare function fetchNewsSources(base: string, signal?: AbortSignal): Promise<NewsSourcesSnapshot>;
/** GET /api/health — reachability plus partial-source degradation. */
export declare function fetchHealthState(base: string, signal?: AbortSignal): Promise<HealthState>;
/** Read source health through the same versioned Agent Bridge as DSH tools. */
export declare function fetchSourceAvailability(base: string, signal?: AbortSignal): Promise<SourceAvailability[]>;
/** GET /api/profile-summary — the AI profile summary (canonical surface shape). */
export declare function fetchProfileSummary(base: string, opts?: {
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
}): Promise<ProfileSummary | null>;
/** GET /api/activity-feed — recent activity entries (cursor pagination). */
export declare function fetchActivityFeed(base: string, opts?: {
    limit?: number;
    before?: string;
}, signal?: AbortSignal): Promise<{
    items: ActivityItem[];
    liveSummary: string;
    headline: string;
    hasMore: boolean;
    nextCursor: string;
}>;
/** Generate one stable idempotency key for a UI action (uuid v4). */
export declare function stableId(): string;
/** Read boot-autostart state. */
export declare function fetchAutostartStatus(base: string, signal?: AbortSignal): Promise<{
    enabled: boolean;
}>;
/** Apply boot-autostart on/off. */
export declare function applyAutostart(base: string, enabled: boolean, signal?: AbortSignal): Promise<boolean>;
/** Read the NewsClaw-only first setup status; this endpoint never rebuilds a ready profile. */
export declare function fetchNewsBootstrapStatus(base: string, signal?: AbortSignal): Promise<NewsBootstrapStatus>;
//# sourceMappingURL=api.d.ts.map