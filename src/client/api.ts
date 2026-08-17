/**
 * NewsClaw REST client for the browser half. Talks to the user's local
 * backend directly (CORS is permissive). The Harness row config is the
 * primary connection source and is mirrored to localStorage for legacy view
 * fallbacks. Settings reads the dedicated NewsClaw runtime/source contracts;
 * it never writes the legacy generic config endpoint.
 * @module @newsclaw/dsh-plugin
 */

/** localStorage key for the API base URL. */
export const API_BASE_KEY = 'newsclaw.apiBase'

import { DEFAULT_API_URL, normalizeApiUrl } from '../config.ts'

/** Default local backend address. */
export const DEFAULT_API_BASE = DEFAULT_API_URL

/** Read the persisted API base URL (falling back to the default). */
export function readApiBase(): string {
  try {
    const saved = localStorage.getItem(API_BASE_KEY)
    if (saved !== null && saved.trim() !== '') return normalizeApiUrl(saved)
  } catch {
    // localStorage unavailable (private mode etc.) — use the default.
  }
  return DEFAULT_API_BASE
}

/** Persist the API base URL. */
export function writeApiBase(base: string): void {
  try {
    localStorage.setItem(API_BASE_KEY, normalizeApiUrl(base))
  } catch {
    // ignore persistence failures
  }
}

/** One recommendation card (RecommendationOut, defensive subset). */
export interface RecommendationItem {
  id: number
  article_id: string
  item_key: string
  title: string
  publisher_name: string
  technical_provider: string
  cover_url: string
  expression: string
  why_for_you: string
  impact_chain: string[]
  observation_points: string[]
  topic_label: string
  content_id: string
  content_url: string
  original_url: string
  media: string
  body_level: string
  content_type: string
  body_text: string
  published_label: string
  published_at: string
  presented: boolean
}

/** One proactive spotlight card (PendingSpotlightOut subset). */
export interface SpotlightItem {
  article_id: string
  item_key: string
  content_id: string
  title: string
  spotlight_reason: string
  spotlight_score: number
  spotlight_hook: string
  cover_url: string
  content_url: string
  original_url: string
  media: string
  technical_provider: string
  body_level: string
  impact_chain: string[]
  observation_points: string[]
  published_label: string
  content_type: string
  body_text: string
  state?: string
}

/** One probe hypothesis (interest or avoidance). */
export interface ProbeItem {
  domain: string
  reason: string
  confidence: number
  status: string
  probe_mode?: string
  challenge?: string
}

/** One saved membership (SavedListItem subset). */
export interface SavedItem {
  item_key: string
  article_id: string
  media: string
  content_id: string
  content_url: string
  content_type: string
  title: string
  author_name: string
  cover_url: string
  note: string
  added_at: string
}

/** One page of saved memberships with the backend total count. */
export interface SavedListPage {
  items: SavedItem[]
  total: number
}

/** One news source's runtime state, independent from editable config. */
export interface SourceAvailability {
  id: string
  media: string
  technical_provider: string
  state: HealthState | 'unknown'
  last_success_at: string
  error: string
}

/** Effective scheduler settings returned by the dedicated NewsClaw API. */
export interface NewsEffectiveSettings {
  version: number
  pool_target_count: number
  refresh_poll_minutes: number
  hot_refresh_minutes: number
  exploration_refresh_minutes: number
  feedback_threshold: number
  proactive_push: boolean
  background_llm: boolean
  browser_close_behavior: string
  retry_max_attempts: number
  retry_base_seconds: number
  retry_max_seconds: number
}

/** One source row from /api/news/sources (read-only in the DSH panel). */
export interface NewsSourceState {
  source_id: string
  kind: string
  media: string
  technical_provider: string
  enabled: boolean
  custom: boolean
  credential_configured: boolean
  status: string
  last_success_at: string
  error: string
}

/** Runtime state used by the truthful DSH settings summary. */
export interface NewsRuntimeSnapshot {
  status: HealthState
  last_article_count: number
  last_refresh: string
  last_refresh_status: string
  last_schedule_lane: string
  last_schedule_status: string
  last_scheduler_check: string
  profile_ready: boolean
  refresh_running: boolean
  bootstrap_running: boolean
  effective_settings: NewsEffectiveSettings
}

/** Source inventory plus the effective settings/runtime returned beside it. */
export interface NewsSourcesSnapshot {
  sources: NewsSourceState[]
  settings: NewsEffectiveSettings
  runtime: NewsRuntimeSnapshot
}

/** One chat turn. */
export interface ChatTurn {
  turn_id: string
  session: string
  scope: string
  message: string
  reply: string
  status: string
  error: string
  subject_title: string
  created_at?: string
  updated_at?: string
  reply_to_turn_id?: string
  payload?: Record<string, unknown>
}

/** One 30-day content-history item. */
export interface ContentHistoryItem {
  item_key: string
  media: string
  content_id: string
  content_url: string
  content_type: string
  title: string
  author_name: string
  cover_url: string
  body_text: string
  recommendation_id: number | null
  occurred_at: string
  context: string
  restored: boolean
  contexts: Array<{ context: string; occurred_at: string; restored: boolean }>
}

/** One pending dialogue confirmation (hypothesis/confusion). */
export interface PendingConfirmation {
  ref: string
  kind: string
  title: string
  confidence: number
  evidence: string[]
  status: string
  /** Confusion items: what the system observed and how it reads it. */
  observation: string
  interpretation: string
}

/** Full profile summary (canonical surface fields). */
/** One recent cognition update (profile tab, popup parity). */
export interface CognitionUpdate {
  summary: string
  context_line: string
  impact: string
  reasoning: string
  evidence: string
  source: string
  source_label: string
  expand_hint: string
  created_at: string
}

export interface ProfileSummary {
  initialized: boolean
  personality_portrait: string
  core_traits: string[]
  deep_needs: string[]
  mbti: { type: string; confidence: number; dimensions?: Record<string, { pole: string; strength: number }> }
  values: string[]
  motivational_drivers: string[]
  likes: Array<{ domain: string; weight: number; specifics: Array<{ name: string; weight: number }> }>
  dislikes: Array<{ domain: string; weight: number; specifics: Array<{ name: string; weight: number }> }>
  favorite_sources: string[]
  life_stage: string
  current_phase: string
  cognitive_style: string[]
  exploration_openness: number
  style: { preferred_duration: string; preferred_pace: string; quality_sensitivity: number; humor_preference: number; depth_preference: number }
  context: { weekday_patterns: string; weekend_patterns: string; time_of_day_patterns: string; session_type: string }
  speculative_interests: Array<{ domain: string; reason: string; confidence: number; status: string; specifics: unknown[]; confirmation_count: number; confirmation_threshold: number; probe_mode?: string; challenge?: boolean }>
  speculative_avoidances: Array<{ domain: string; reason: string; confidence: number; status: string; specifics: unknown[]; confirmation_count: number; confirmation_threshold: number }>
  recent_cognition_updates: CognitionUpdate[]
  has_more_cognition_updates: boolean
  next_cognition_cursor: string
  active_insights: Array<{ hypothesis: string; evidence: string[]; confidence: number; validated: boolean; created_at?: string }>
  recent_awareness: Array<{ date: string; observation: string; trend: string; emotion_guess: string }>
  overrides: Record<string, unknown>
}

/** One activity feed item. */
export interface ActivityItem {
  id?: string
  kind?: string
  summary?: string
  occurred_at?: string
  [key: string]: unknown
}

/** Runtime status (defensive subset). */
export interface RuntimeStatus {
  initialized: boolean
  recommendation_count: number
  unread_count: number
  last_refresh_at: string
  pool_available_count: number
  pool_target_count: number
  pool_pending_count: number
  last_replenished_count: number
  last_discovered_count: number
  recent_pool_topics: string[]
  manual_refresh_state: string
  [key: string]: unknown
}

/** Durable state of the NewsClaw-only first setup flow. */
export interface NewsBootstrapStatus {
  status: string
  running: boolean
  profile_ready: boolean
  detail: string
}

/**
 * Build a concise human-readable summary from a backend error `detail` so the
 * failure toast shows WHICH field failed validation, not just `failed: 422`.
 * FastAPI wraps validation errors as `{ detail: [{ loc, msg, ... }] }` (or a
 * plain string), so unwrap that envelope and render each entry as `loc.path: msg`.
 */
function summarizeDetail(detail: unknown): string {
  let value = detail
  if (typeof value === 'object' && value !== null && 'detail' in (value as Record<string, unknown>)) {
    value = (value as Record<string, unknown>).detail
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? '' : value.trim()
  }
  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) continue
      const rec = entry as { loc?: unknown; msg?: unknown }
      const msg = typeof rec.msg === 'string' ? rec.msg : ''
      if (msg === '') continue
      const loc = Array.isArray(rec.loc)
        ? rec.loc.filter((seg): seg is string => typeof seg === 'string').join('.')
        : ''
      parts.push(loc === '' ? msg : `${loc}: ${msg}`)
    }
    return parts.join('; ')
  }
  return ''
}

/** Request error carrying the HTTP status and server detail. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(path: string, status: number, detail: unknown) {
    const summary = summarizeDetail(detail)
    super(`${path} failed: ${status}${summary === '' ? '' : ` — ${summary}`}`)
    this.status = status
    this.detail = detail
  }
}

/** Minimal timeout helper: AbortController + cleanup. */
function withTimeout(ms: number, outer?: AbortSignal): { signal?: AbortSignal; timedOut(): boolean; cleanup(): void } {
  if (ms <= 0) return { timedOut: () => false, cleanup() { /* no-op */ } }
  const controller = new AbortController()
  let expired = false
  const onOuterAbort = (): void => controller.abort()
  if (outer !== undefined) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timer = window.setTimeout(() => {
    expired = true
    controller.abort()
  }, ms)
  return {
    signal: controller.signal,
    timedOut: () => expired,
    cleanup() {
      window.clearTimeout(timer)
      outer?.removeEventListener('abort', onOuterAbort)
    },
  }
}

/** One raw JSON request against the NewsClaw backend. */
export async function requestJson(
  base: string,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const { method = 'GET', body, headers, timeoutMs = 15_000, signal } = options
  const timeout = withTimeout(timeoutMs, signal)
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: 'omit',
      signal: timeout.signal,
      headers: body === undefined && headers === undefined ? undefined : { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      let detail: unknown = null
      try { detail = await res.json() } catch { detail = null }
      throw new ApiError(path, res.status, detail)
    }
    return res.json()
  } catch (error) {
    if (timeout.timedOut()) throw new Error(`${path} 请求超时（${timeoutMs ?? 15_000}ms），请确认新闻爪后端状态后重试。`)
    throw error
  } finally {
    timeout.cleanup()
  }
}

function asItems(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return []
  const items = (value as Record<string, unknown>).items
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : []
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Decode HTML entities occasionally returned by RSS/API source payloads;
 *  `&amp;` is decoded last so double-escaped text unwraps once. */
function decodeEntities(value: string): string {
  if (value.indexOf('&') === -1) return value
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function str(value: unknown): string {
  return typeof value === 'string' ? decodeEntities(value) : ''
}

/**
 * Normalize one remote cover URL before it is handed to the image proxy.
 * Some source adapters still emit protocol-relative or HTTP CDN URLs; HTTPS
 * is required here because the DSH page itself is commonly served securely.
 */
export function normalizeImageUrl(value: unknown): string {
  const url = str(value).trim()
  if (url === '') return ''
  if (url.startsWith('//')) return `https:${url}`
  if (/^http:\/\//i.test(url)) return `https://${url.slice('http://'.length)}`
  return url
}

/**
 * Build the same backend image-proxy URL used by the browser and PC Web
 * clients. Keeping the remote URL behind the local backend avoids hotlink,
 * referrer and media-CDN CORS failures.
 */
export function imageProxyUrl(base: string, value: unknown): string {
  const url = normalizeImageUrl(value)
  if (url === '') return ''
  try {
    new URL(url)
  } catch {
    return ''
  }
  const apiBase = base.trim().replace(/\/+$/, '')
  return apiBase === '' ? '' : `${apiBase}/api/image-proxy?url=${encodeURIComponent(url)}`
}

/** Mark cross-origin proxy images so the backend can apply its CORS policy. */
export function imageProxyCrossOrigin(base: string): 'anonymous' | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return new URL(base, window.location.href).origin === window.location.origin ? undefined : 'anonymous'
  } catch {
    return undefined
  }
}

/** Return the first non-empty text field, preserving the backend's fallbacks. */
function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value).trim()
    if (text !== '') return text
  }
  return ''
}

/** Cover fields used by current and older source payloads. */
function coverUrl(row: Record<string, unknown>): string {
  return normalizeImageUrl(firstText(
    row.cover_url,
    row.cover,
    row.pic,
    row.thumbnail_url,
    row.thumbnail,
    row.image_url,
  ))
}

/** Defensive coercion of one recommendation row. */
function toRecommendation(row: Record<string, unknown>): RecommendationItem {
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
  }
}

/** Defensive coercion of one spotlight row. */
function toSpotlight(row: Record<string, unknown>): SpotlightItem {
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
  }
}

/** Defensive coercion of one probe row. */
function toProbe(row: Record<string, unknown>): ProbeItem {
  return {
    domain: str(row.domain),
    reason: str(row.reason),
    confidence: num(row.confidence),
    status: str(row.status),
    probe_mode: str(row.probe_mode),
    challenge: str(row.challenge),
  }
}

/** Defensive coercion of one saved row. */
function toSaved(row: Record<string, unknown>): SavedItem {
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
  }
}

// ── Endpoints (user-consumption surface only) ───────────────────────────────

/** GET /api/recommendations — the current recommendation snapshot. */
export async function fetchRecommendations(base: string, signal?: AbortSignal): Promise<RecommendationItem[]> {
  const data = await requestJson(base, '/api/recommendations', { timeoutMs: 20_000, signal })
  return asItems(data).map(toRecommendation)
}

/** POST /api/recommendations/reshuffle — replace the current page. */
export async function reshuffleRecommendations(
  base: string,
  opts: { media?: string; excludedArticleIds?: string[] } = {},
  signal?: AbortSignal,
): Promise<RecommendationItem[]> {
  const body: Record<string, unknown> = {}
  if (opts.media !== undefined && opts.media !== '') body.media = opts.media
  if (opts.excludedArticleIds !== undefined && opts.excludedArticleIds.length > 0) body.excluded_article_ids = opts.excludedArticleIds
  const data = await requestJson(base, '/api/recommendations/reshuffle', { method: 'POST', body, timeoutMs: 20_000, signal })
  return asItems(data).map(toRecommendation)
}

/** POST /api/recommendations/append — append another page. */
export async function appendRecommendations(
  base: string,
  opts: { media?: string; excludedArticleIds?: string[] } = {},
  signal?: AbortSignal,
): Promise<RecommendationItem[]> {
  const body: Record<string, unknown> = {}
  if (opts.media !== undefined && opts.media !== '') body.media = opts.media
  if (opts.excludedArticleIds !== undefined && opts.excludedArticleIds.length > 0) body.excluded_article_ids = opts.excludedArticleIds
  const data = await requestJson(base, '/api/recommendations/append', { method: 'POST', body, timeoutMs: 20_000, signal })
  return asItems(data).map(toRecommendation)
}

/** POST /api/recommendation-click — record a click-through (stable request_id). */
export async function reportClick(
  base: string,
  payload: { recommendation_id?: number; content_id?: string; article_id?: string; content_url?: string; media?: string; title?: string; request_id: string },
  signal?: AbortSignal,
): Promise<void> {
  await requestJson(base, '/api/recommendation-click', { method: 'POST', body: { ...payload }, timeoutMs: 10_000, signal })
}

/** POST /api/feedback — durable card feedback (stable request_id). */
export async function submitFeedback(
  base: string,
  payload: { recommendation_id: number; feedback_type: string; note?: string; request_id: string },
  signal?: AbortSignal,
): Promise<void> {
  await requestJson(base, '/api/feedback', { method: 'POST', body: { ...payload }, timeoutMs: 10_000, signal })
}

/** One raw behavior event (service-worker batch item). */
export interface BehaviorEvent {
  type: string
  url?: string
  title?: string
  timestamp: number
  media?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  event_id: string
  reading_seconds?: number
}

/** POST /api/events — ingest behavior events (e.g. saved-card feedback). */
export async function sendBehaviorEvents(
  base: string,
  events: BehaviorEvent[],
  signal?: AbortSignal,
): Promise<{ accepted: number; rejected: Array<{ index: number; type: string; reason: string }> }> {
  const data = await requestJson(base, '/api/events', {
    method: 'POST',
    body: { events },
    timeoutMs: 15_000,
    signal,
  })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return {
    accepted: num(row.accepted),
    rejected: Array.isArray(row.rejected)
      ? (row.rejected as Array<Record<string, unknown>>).map(r => ({
        index: num(r.index),
        type: str(r.type),
        reason: str(r.reason),
      }))
      : [],
  }
}

/** GET /api/spotlight/pending-batch — the full un-notified spotlight queue. */
export async function fetchSpotlightBatch(base: string, signal?: AbortSignal): Promise<SpotlightItem[]> {
  const data = await requestJson(base, '/api/spotlight/pending-batch?limit=20', { timeoutMs: 15_000, signal })
  return asItems(data).map(toSpotlight)
}

/** GET /api/notifications/pending — one notification-worthy recommendation. */
export async function fetchPendingNotification(base: string, signal?: AbortSignal): Promise<{ recommendation_id: number; article_id: string; title: string; reason: string; media: string; original_url: string } | null> {
  const data = await requestJson(base, '/api/notifications/pending', { timeoutMs: 8_000, signal })
  if (typeof data !== 'object' || data === null) return null
  const row = (data as Record<string, unknown>).item
  if (typeof row !== 'object' || row === null) return null
  const item = row as Record<string, unknown>
  return {
    recommendation_id: num(item.recommendation_id),
    article_id: str(item.article_id),
    title: str(item.title),
    reason: str(item.reason),
    media: str(item.media),
    original_url: firstText(item.original_url, item.content_url),
  }
}

/** POST /api/notifications/ack — durable, idempotent NewsClaw message acknowledgement. */
export async function acknowledgeNotification(base: string, articleId: string, requestId: string, signal?: AbortSignal): Promise<void> {
  const data = await requestJson(base, '/api/notifications/ack', {
    method: 'POST',
    body: { article_id: articleId, request_id: requestId },
    timeoutMs: 10_000,
    signal,
  })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  if (row.ok !== true || str(row.article_id) !== articleId) throw new Error('通知确认没有得到后端确认，请稍后重试。')
}

/** POST /api/spotlight/respond — view/like/dislike/dismiss/chat (stable request_id). */
export async function respondToSpotlight(
  base: string,
  payload: { article_id: string; response: string; title?: string; message?: string; request_id: string },
  signal?: AbortSignal,
): Promise<unknown> {
  return requestJson(base, '/api/spotlight/respond', { method: 'POST', body: { ...payload }, timeoutMs: 20_000, signal })
}

/** GET /api/interest-probes/pending — active speculative interests. */
export async function fetchInterestProbes(base: string, signal?: AbortSignal): Promise<ProbeItem[]> {
  const data = await requestJson(base, '/api/interest-probes/pending', { timeoutMs: 10_000, signal })
  return asItems(data).map(toProbe)
}

/** POST /api/interest-probes/respond — confirm/reject/defer/chat, idempotent. */
export async function respondInterestProbe(
  base: string,
  payload: { domain: string; response: string; request_id: string; message?: string },
  signal?: AbortSignal,
): Promise<unknown> {
  const body: Record<string, unknown> = { domain: payload.domain, response: payload.response, request_id: payload.request_id }
  if (payload.message !== undefined && payload.message !== '') body.message = payload.message
  return requestJson(base, '/api/interest-probes/respond', { method: 'POST', body, timeoutMs: 20_000, signal })
}

/** GET /api/avoidance-probes/pending — active speculative avoidances. */
export async function fetchAvoidanceProbes(base: string, signal?: AbortSignal): Promise<ProbeItem[]> {
  const data = await requestJson(base, '/api/avoidance-probes/pending', { timeoutMs: 10_000, signal })
  return asItems(data).map(toProbe)
}

/** POST /api/avoidance-probes/respond — confirm/reject/defer/chat, idempotent. */
export async function respondAvoidanceProbe(
  base: string,
  payload: { domain: string; response: string; request_id: string; message?: string },
  signal?: AbortSignal,
): Promise<unknown> {
  const body: Record<string, unknown> = { domain: payload.domain, response: payload.response, request_id: payload.request_id }
  if (payload.message !== undefined && payload.message !== '') body.message = payload.message
  return requestJson(base, '/api/avoidance-probes/respond', { method: 'POST', body, timeoutMs: 20_000, signal })
}

/** POST /api/chat — one Socratic dialogue exchange (returns { reply }). */
export async function sendChat(base: string, message: string, signal?: AbortSignal): Promise<{ reply: string }> {
  const data = await requestJson(base, '/api/chat', { method: 'POST', body: { message }, timeoutMs: 300_000, signal })
  const reply = typeof data === 'object' && data !== null ? str((data as Record<string, unknown>).reply) : ''
  return { reply }
}

/** Defensive coercion of one chat turn row. */
function toChatTurn(row: Record<string, unknown>): ChatTurn {
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
    payload: typeof row.payload === 'object' && row.payload !== null ? row.payload as Record<string, unknown> : undefined,
  }
}

/** GET /api/chat/turns — durable dialogue history. */
export async function fetchChatTurns(base: string, session = 'dsh', signal?: AbortSignal): Promise<ChatTurn[]> {
  const data = await requestJson(base, `/api/chat/turns?session=${encodeURIComponent(session)}&limit=50`, { timeoutMs: 10_000, signal })
  return asItems(data).map(toChatTurn)
}

/** POST /api/chat/turns — start one durable dialogue turn (returns the pending turn). */
export async function startChatTurn(base: string, message: string, session = 'dsh', replyToTurnId?: string, turnId?: string, signal?: AbortSignal): Promise<ChatTurn> {
  const body: Record<string, unknown> = { session, scope: 'chat', message }
  if (replyToTurnId !== undefined && replyToTurnId !== '') body.reply_to_turn_id = replyToTurnId
  if (turnId !== undefined && turnId !== '') body.turn_id = turnId
  const data = await requestJson(base, '/api/chat/turns', {
    method: 'POST',
    body,
    timeoutMs: 20_000,
    signal,
  })
  if (typeof data !== 'object' || data === null) throw new Error('chat/turns: unexpected response')
  return toChatTurn(data as Record<string, unknown>)
}

/** GET /api/chat/turns/{turn_id} — poll one durable turn until it settles. */
export async function fetchChatTurn(base: string, turnId: string, signal?: AbortSignal): Promise<ChatTurn> {
  const data = await requestJson(base, `/api/chat/turns/${encodeURIComponent(turnId)}`, { timeoutMs: 15_000, signal })
  if (typeof data !== 'object' || data === null) throw new Error('chat/turns: unexpected response')
  return toChatTurn(data as Record<string, unknown>)
}

/** GET /api/chat/pending-confirmations — hypotheses/confusions waiting for the user. */
export async function fetchPendingConfirmations(base: string, signal?: AbortSignal): Promise<{ count: number; items: PendingConfirmation[] }> {
  const data = await requestJson(base, '/api/chat/pending-confirmations', { timeoutMs: 10_000, signal })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  const items = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : []
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
  }
}

/** POST /api/chat/pending-confirmations/{ref}/open — turn a confirmation into a chat turn. */
export async function openPendingConfirmation(base: string, ref: string, signal?: AbortSignal): Promise<ChatTurn> {
  const data = await requestJson(base, `/api/chat/pending-confirmations/${encodeURIComponent(ref)}/open`, {
    method: 'POST',
    body: { session: 'dsh' },
    timeoutMs: 20_000,
    signal,
  })
  if (typeof data !== 'object' || data === null) throw new Error('pending-confirmations/open: unexpected response')
  return toChatTurn(data as Record<string, unknown>)
}

/** POST /api/chat/cards/{turn_id}/action — confirm/reject/discuss/defer a hypothesis card.
 *  Returns the settlement response (state/verdict are authoritative). */
export async function actOnChatCard(base: string, turnId: string, action: string, signal?: AbortSignal): Promise<unknown> {
  return requestJson(base, `/api/chat/cards/${encodeURIComponent(turnId)}/action`, {
    method: 'POST',
    body: { action },
    timeoutMs: 20_000,
    signal,
  })
}

/** GET /api/content-history — one paginated 30-day history category. */
export async function fetchContentHistory(
  base: string,
  category: 'clicked' | 'shown' | 'removed',
  cursor = '',
  signal?: AbortSignal,
): Promise<{ items: ContentHistoryItem[]; total: number; hasMore: boolean; nextCursor: string; retentionDays: number }> {
  const params = new URLSearchParams({ category, limit: '12' })
  if (cursor !== '') params.set('cursor', cursor)
  const data = await requestJson(base, `/api/content-history?${params.toString()}`, { timeoutMs: 15_000, signal })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return {
    items: (Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : []).map(item => ({
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
        ? (item.contexts as Array<Record<string, unknown>>).map(ctx => ({
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
  }
}

/** GET /api/saved/{listKind}/status — saved state for one item (toggle display). */
export async function fetchSavedStatus(base: string, listKind: 'favorite' | 'watch_later', itemKey: string, signal?: AbortSignal): Promise<boolean> {
  const data = await requestJson(base, `/api/saved/${listKind}/status?item_key=${encodeURIComponent(itemKey)}`, { timeoutMs: 8_000, signal })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return row.saved === true
}

/** GET /api/saved/{listKind} — favorite or watch_later memberships plus total. */
export async function fetchSaved(base: string, listKind: 'favorite' | 'watch_later', signal?: AbortSignal): Promise<SavedListPage> {
  const data = await requestJson(base, `/api/saved/${listKind}`, { timeoutMs: 10_000, signal })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return { items: asItems(data).map(toSaved), total: num(row.total) }
}

/** POST /api/saved/{listKind} — add one membership. */
export async function saveItem(
  base: string,
  listKind: 'favorite' | 'watch_later',
  payload: { article_id: string; media?: string; original_url?: string; title?: string; author_name?: string; cover_url?: string },
  signal?: AbortSignal,
): Promise<void> {
  await requestJson(base, `/api/saved/${listKind}`, {
    method: 'POST',
    body: { ...payload, content_type: 'article' },
    timeoutMs: 10_000,
    signal,
  })
}

/** POST /api/saved/{listKind}/remove — remove one membership. */
export async function removeSaved(base: string, listKind: 'favorite' | 'watch_later', itemKey: string, signal?: AbortSignal): Promise<void> {
  await requestJson(base, `/api/saved/${listKind}/remove`, { method: 'POST', body: { item_key: itemKey }, timeoutMs: 10_000, signal })
}

/** GET /api/runtime-status — backend readiness and counts. */
export async function fetchRuntimeStatus(base: string, signal?: AbortSignal): Promise<RuntimeStatus | null> {
  const data = await requestJson(base, '/api/runtime-status', { timeoutMs: 8_000, signal })
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('运行状态返回格式无效。')
  const row = data as Record<string, unknown>
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
  }
}

/** Three-state backend status shared by the DSH, Web and mobile clients. */
export type HealthState = 'online' | 'degraded' | 'offline'

function parseEffectiveSettings(value: unknown): NewsEffectiveSettings {
  const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
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
  }
}

function parseNewsSource(value: unknown): NewsSourceState | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const health = typeof row.health === 'object' && row.health !== null ? row.health as Record<string, unknown> : {}
  const sourceId = firstText(row.source_id, row.id)
  const media = firstText(row.media, row.name, sourceId)
  if (sourceId === '' && media === '') return null
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
  }
}

function parseNewsRuntime(value: unknown): NewsRuntimeSnapshot {
  const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const rawStatus = firstText(row.status, row.last_refresh_status).toLowerCase()
  const status: HealthState = rawStatus === '' || rawStatus === 'offline'
    ? 'offline'
    : rawStatus === 'degraded' || rawStatus === 'partial' || rawStatus === 'error' || rawStatus === 'failed'
      ? 'degraded'
      : 'online'
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
  }
}

/** GET /api/news/runtime — real NewsClaw runtime and effective settings. */
export async function fetchNewsRuntime(base: string, signal?: AbortSignal): Promise<NewsRuntimeSnapshot> {
  const data = await requestJson(base, '/api/news/runtime', { timeoutMs: 10_000, signal })
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('新闻运行状态返回格式无效。')
  return parseNewsRuntime(data)
}

/** GET /api/news/sources — real source inventory and source health. */
export async function fetchNewsSources(base: string, signal?: AbortSignal): Promise<NewsSourcesSnapshot> {
  const data = await requestJson(base, '/api/news/sources', { timeoutMs: 10_000, signal })
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('新闻来源返回格式无效。')
  const row = data as Record<string, unknown>
  if (!Array.isArray(row.sources)) throw new Error('新闻来源列表缺失。')
  const sources = row.sources.map(parseNewsSource).filter((item): item is NewsSourceState => item !== null)
  return {
    sources,
    settings: parseEffectiveSettings(row.settings),
    runtime: parseNewsRuntime(row.runtime),
  }
}

/** GET /api/health — reachability plus partial-source degradation. */
export async function fetchHealthState(base: string, signal?: AbortSignal): Promise<HealthState> {
  try {
    const data = await requestJson(base, '/api/health', { timeoutMs: 5_000, signal })
    if (typeof data !== 'object' || data === null) return 'degraded'
    const row = data as Record<string, unknown>
    const state = str(row.state || row.status).toLowerCase()
    if (state === 'offline') return 'offline'
    if (state === 'degraded' || state === 'partial' || state === 'error' || state === 'failed' || row.degraded === true || row.ok === false) return 'degraded'
    const sources = row.sources ?? row.source_health
    const sourceRows = Array.isArray(sources)
      ? sources
      : typeof sources === 'object' && sources !== null ? Object.values(sources) : []
    if (sourceRows.some(source => {
      if (typeof source !== 'object' || source === null) return false
      const sourceState = str((source as Record<string, unknown>).state || (source as Record<string, unknown>).status).toLowerCase()
      return sourceState === 'degraded' || sourceState === 'offline' || sourceState === 'error' || sourceState === 'failed'
    })) return 'degraded'
    return 'online'
  } catch {
    return 'offline'
  }
}

/** Read source health through the same versioned Agent Bridge as DSH tools. */
export async function fetchSourceAvailability(base: string, signal?: AbortSignal): Promise<SourceAvailability[]> {
  const reply = await requestJson(base, '/api/agent-bridge', {
    method: 'POST',
    body: { command: 'source-availability', argv: [] },
    timeoutMs: 10_000,
    signal,
  })
  const root = typeof reply === 'object' && reply !== null ? reply as Record<string, unknown> : {}
  if (root.ok !== true) throw new Error(firstText(root.error, root.message, '新闻源状态读取失败'))
  const data = root.data
  const dataRow = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(dataRow.items) ? dataRow.items
      : Array.isArray(dataRow.sources) ? dataRow.sources
        : Object.entries(dataRow).map(([id, value]) => ({ id, ...((typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {}) }))
  return rawItems.map(value => {
    const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
    const rawState = firstText(row.state, row.status, row.health).toLowerCase()
    const state: SourceAvailability['state'] = rawState === 'online' || rawState === 'degraded' || rawState === 'offline' ? rawState : 'unknown'
    return {
      id: firstText(row.id, row.source_id, row.media),
      media: firstText(row.media, row.name, row.id),
      technical_provider: firstText(row.technical_provider, row.provider),
      state,
      last_success_at: firstText(row.last_success_at, row.last_success),
      error: firstText(row.error, row.last_error),
    }
  }).filter(item => item.id !== '' || item.media !== '')
}

/** GET /api/profile-summary — the AI profile summary (canonical surface shape). */
export async function fetchProfileSummary(
  base: string,
  opts: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<ProfileSummary | null> {
    const params = new URLSearchParams()
    params.set('limit', String(opts.limit ?? 5))
    if (opts.cursor !== undefined && opts.cursor !== '') params.set('cursor', opts.cursor)
    const data = await requestJson(base, `/api/profile-summary?${params.toString()}`, { timeoutMs: 10_000, signal: opts.signal })
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('画像摘要返回格式无效。')
    const row = data as Record<string, unknown>
    const mbti = typeof row.mbti === 'object' && row.mbti !== null ? row.mbti as Record<string, unknown> : {}
    const toDomain = (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return { domain: '', weight: 0, specifics: [] }
      const d = raw as Record<string, unknown>
      return {
        domain: str(d.domain),
        weight: num(d.weight),
        specifics: Array.isArray(d.specifics)
          ? (d.specifics as Array<Record<string, unknown>>).map(s => ({ name: str(s.name), weight: num(s.weight) }))
          : [],
      }
    }
    const toProbe = (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return null
      const p = raw as Record<string, unknown>
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
      }
    }
    return {
      initialized: row.initialized === true,
      personality_portrait: str(row.personality_portrait),
      core_traits: Array.isArray(row.core_traits) ? row.core_traits.map(String) : [],
      deep_needs: Array.isArray(row.deep_needs) ? row.deep_needs.map(String) : [],
      mbti: {
        type: str(mbti.type),
        confidence: num(mbti.confidence),
        dimensions: typeof mbti.dimensions === 'object' && mbti.dimensions !== null
          ? mbti.dimensions as Record<string, { pole: string; strength: number }>
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
        const s = typeof row.style === 'object' && row.style !== null ? row.style as Record<string, unknown> : {}
        return {
          preferred_duration: str(s.preferred_duration),
          preferred_pace: str(s.preferred_pace),
          quality_sensitivity: num(s.quality_sensitivity),
          humor_preference: num(s.humor_preference),
          depth_preference: num(s.depth_preference),
        }
      })(),
      context: (() => {
        const c = typeof row.context === 'object' && row.context !== null ? row.context as Record<string, unknown> : {}
        return {
          weekday_patterns: str(c.weekday_patterns),
          weekend_patterns: str(c.weekend_patterns),
          time_of_day_patterns: str(c.time_of_day_patterns),
          session_type: str(c.session_type),
        }
      })(),
      speculative_interests: Array.isArray(row.speculative_interests) ? row.speculative_interests.map(toProbe).filter((p): p is NonNullable<typeof p> => p !== null) : [],
      speculative_avoidances: Array.isArray(row.speculative_avoidances) ? row.speculative_avoidances.map(toProbe).filter((p): p is NonNullable<typeof p> => p !== null) : [],
      recent_cognition_updates: Array.isArray(row.recent_cognition_updates)
        ? (row.recent_cognition_updates as Array<Record<string, unknown>>).map(c => ({
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
      overrides: typeof row.overrides === 'object' && row.overrides !== null ? row.overrides as Record<string, unknown> : {},
      active_insights: Array.isArray(row.active_insights)
        ? (row.active_insights as Array<Record<string, unknown>>).map(i => ({
          hypothesis: str(i.hypothesis),
          evidence: Array.isArray(i.evidence) ? i.evidence.map(String) : [],
          confidence: num(i.confidence),
          validated: i.validated === true,
          created_at: str(i.created_at),
        }))
        : [],
      recent_awareness: Array.isArray(row.recent_awareness)
        ? (row.recent_awareness as Array<Record<string, unknown>>).map(a => ({
          date: str(a.date),
          observation: str(a.observation),
          trend: str(a.trend),
          emotion_guess: str(a.emotion_guess),
        }))
        : [],
    }
}

/** GET /api/activity-feed — recent activity entries (cursor pagination). */
export async function fetchActivityFeed(
  base: string,
  opts: { limit?: number; before?: string } = {},
  signal?: AbortSignal,
): Promise<{ items: ActivityItem[]; liveSummary: string; headline: string; hasMore: boolean; nextCursor: string }> {
  const params = new URLSearchParams()
  if (opts.limit !== undefined) params.set('limit', String(Math.max(1, Math.min(100, opts.limit))))
  if (opts.before !== undefined && opts.before !== '') params.set('before', opts.before)
  const qs = params.toString()
  const data = await requestJson(base, `/api/activity-feed${qs !== '' ? `?${qs}` : ''}`, { timeoutMs: 10_000, signal })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return {
    items: asItems(data),
    liveSummary: str(row.live_summary),
    headline: str(row.headline),
    hasMore: row.has_more === true,
    nextCursor: str(row.next_cursor),
  }
}

/** Generate one stable idempotency key for a UI action (uuid v4). */
export function stableId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ── settings-page endpoints (mirror the popup's config surface) ──────────

/** Read boot-autostart state. */
export async function fetchAutostartStatus(base: string, signal?: AbortSignal): Promise<{ enabled: boolean }> {
  const data = await requestJson(base, '/api/autostart-status', { timeoutMs: 10_000, signal })
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('开机启动状态返回格式无效。')
  const row = data as Record<string, unknown>
  if (typeof row.enabled !== 'boolean') throw new Error('开机启动状态缺少 enabled。')
  return { enabled: row.enabled }
}

/** Apply boot-autostart on/off. */
export async function applyAutostart(base: string, enabled: boolean, signal?: AbortSignal): Promise<boolean> {
  const data = await requestJson(base, '/api/autostart/apply', {
    method: 'POST',
    timeoutMs: 15_000,
    signal,
    headers: { 'X-NewsClaw-Auth': '1' },
    body: { enabled: Boolean(enabled) },
  })
  const row = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
  return row.ok === true || row.enabled === enabled
}

/** Read the NewsClaw-only first setup status; this endpoint never rebuilds a ready profile. */
export async function fetchNewsBootstrapStatus(base: string, signal?: AbortSignal): Promise<NewsBootstrapStatus> {
  const data = await requestJson(base, '/api/news/bootstrap/status', { timeoutMs: 10_000, signal })
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('首次设置状态返回格式无效。')
  const row = data as Record<string, unknown>
  return {
    status: firstText(row.status, row.state, 'not_started'),
    running: row.running === true,
    profile_ready: row.profile_ready === true,
    detail: firstText(row.detail, row.error),
  }
}
