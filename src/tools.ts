/**
 * Agent-bridge tool set: one DSH tool per NewsClaw capability, mirroring
 * the newsclaw-adapter skill names so the agent can operate the
 * consumption loop (recommend → spotlight → probes → chat → save → feedback)
 * without raw shell access. Durable write tools (feedback, spotlight respond,
 * probes respond) REQUIRE the caller to supply a stable `requestId`; durable
 * chat uses a stable `turnId`. Reuse either identity only for retries of the
 * same action — never across different actions.
 * @module @newsclaw/dsh-plugin
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Bridge } from './bridge.ts'

/** Plain-text output: the canonical JSON value renders as its text form. */
const TEXT_OUTPUT = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown): ContentBlock[] => [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
}

/** Simple string parameter helper (required keys annotated, optional keys omitted). */
function str(description: string, required = false): { type: 'string'; description: string } | { type: 'string'; description: string; required: true } {
  return required
    ? { type: 'string', required: true, description }
    : { type: 'string', description }
}

/** Simple integer parameter helper. */
function int(description: string, required = false): { type: 'integer'; description: string } | { type: 'integer'; description: string; required: true } {
  return required
    ? { type: 'integer', required: true, description }
    : { type: 'integer', description }
}

/** Simple boolean parameter helper. */
function bool(description: string, required = false): { type: 'boolean'; description: string } | { type: 'boolean'; description: string; required: true } {
  return required
    ? { type: 'boolean', required: true, description }
    : { type: 'boolean', description }
}

/** Reject empty-string params that a CLI flag would otherwise swallow. */
function nonEmpty(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new Error(`newsclaw: ${label} is required`)
  return text
}

/** Validate one canonical enum before a request reaches the backend adapter. */
function oneOf(value: unknown, label: string, allowed: readonly string[]): string {
  const text = nonEmpty(value, label).toLowerCase()
  if (!allowed.includes(text)) throw new Error(`newsclaw: ${label} must be one of: ${allowed.join(', ')}`)
  return text
}

/** Stable durable-write key: the adapter contract caps it at 400 chars. */
function stableKey(value: unknown, label: string): string {
  const text = nonEmpty(value, label)
  if (text.length > 400) throw new Error(`newsclaw: ${label} must be at most 400 characters`)
  return text
}

function requestId(value: unknown): string {
  return stableKey(value, 'requestId')
}

/** Recommendation ids are positive database identities, not arbitrary numbers. */
function positiveInt(value: unknown, label: string): number {
  const result = typeof value === 'number' ? Math.floor(value) : NaN
  if (!Number.isFinite(result) || result <= 0) throw new Error(`newsclaw: ${label} must be a positive integer`)
  return result
}

/**
 * Register every bridge tool on ctx.tools.
 * @param ctx - plugin context with the tools registry.
 * @param bridge - the resolved bridge face.
 * @returns array of tool disposers (for effect wiring).
 */
export function registerBridgeTools(ctx: { tools: { register(def: unknown): () => void } }, bridge: Bridge): Array<() => void> {
  const registered: Array<() => void> = []
  const register = (definition: unknown): (() => void) => {
    try {
      const dispose = ctx.tools.register(definition)
      registered.push(dispose)
      return dispose
    } catch (error) {
      // Registration must be atomic: a hot-load failure cannot leave a
      // partial set of stale tools behind for the next loader attempt.
      for (const dispose of [...registered].reverse()) {
        try { dispose() } catch { /* preserve the original registration error */ }
      }
      registered.length = 0
      throw error
    }
  }
  return [
    register(defineTool({
      name: 'newsclaw_get_capabilities',
      description: 'Negotiate the NewsClaw agent bridge: protocol version, adapter version and the authoritative skill name list. Run this first when the backend may have upgraded.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('capabilities', []),
    })),

    register(defineTool({
      name: 'newsclaw_recommend',
      description: 'Fetch a page of personalized news recommendations. Each card identifies its article, media, technical provider, body level, original URL, recommendation reason, impact chain and observation points. Title-only items must stay marked as title-level information.',
      parameters: {
        limit: int('How many recommendations to return (default 5).', false),
        media: str('Optional media scope, for example 财联社、第一财经 or 央视新闻. Empty = all enabled media.', false),
        excludeArticleId: str('Optional article_id to exclude from this page.', false),
        refreshIfNeeded: bool('When true, run a heavier freshness check before the recommendation fetch. Only use when the user explicitly wants it.', false),
        realtime: bool('When true, generate fresh per-item LLM expressions at request time (slow). Default false = serve precomputed pool copy (fast).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const argv: string[] = []
        const limit = typeof args.limit === 'number' ? args.limit : 5
        argv.push('--limit', String(Math.max(1, Math.min(50, Math.floor(limit)))))
        if (typeof args.media === 'string' && args.media.trim() !== '') argv.push('--media', args.media.trim())
        if (typeof args.excludeArticleId === 'string' && args.excludeArticleId.trim() !== '') argv.push('--exclude-article-id', args.excludeArticleId.trim())
        if (args.refreshIfNeeded === true) argv.push('--refresh-if-needed')
        if (args.realtime === true) argv.push('--realtime')
        return bridge.run('recommend', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_reshuffle',
      description: 'Replace the current news page with a fresh draw from the same personalized pool. Optional media scope and visible article exclusions.',
      parameters: {
        media: str('Optional media scope. Empty = all enabled media.', false),
        excludedArticleIds: str('Optional comma-separated article_ids to exclude from the new page.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const argv: string[] = []
        if (typeof args.media === 'string' && args.media.trim() !== '') argv.push('--media', args.media.trim())
        if (typeof args.excludedArticleIds === 'string' && args.excludedArticleIds.trim() !== '') {
          for (const id of args.excludedArticleIds.split(',').map(s => s.trim()).filter(Boolean)) argv.push('--exclude-article-id', id)
        }
        return bridge.run('reshuffle', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_append_recommendations',
      description: 'Append another recommendation page after the current one (scroll-to-load pattern).',
      parameters: {
        limit: int('How many recommendations to append (default 5).', false),
        media: str('Optional media scope. Empty = all enabled media.', false),
        excludedArticleIds: str('Optional comma-separated article_ids to exclude.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const argv: string[] = []
        const limit = typeof args.limit === 'number' ? args.limit : 5
        argv.push('--limit', String(Math.max(1, Math.min(50, Math.floor(limit)))))
        if (typeof args.media === 'string' && args.media.trim() !== '') argv.push('--media', args.media.trim())
        if (typeof args.excludedArticleIds === 'string' && args.excludedArticleIds.trim() !== '') {
          for (const id of args.excludedArticleIds.split(',').map(s => s.trim()).filter(Boolean)) argv.push('--exclude-article-id', id)
        }
        return bridge.run('append', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_submit_feedback',
      description: 'Submit one explicit news-learning signal (open, like, dislike, comment or dismiss). open is a weak reading signal; local favorite/watch_later membership does not train the profile. REQUIRES a stable requestId: reuse it only when retrying this exact same action.',
      parameters: {
        recommendationId: int('The recommendation card id (the `recommendation_id` field returned by recommend/append).', true),
        feedbackType: str('One of: open, like, dislike, comment, dismiss.', true),
        requestId: str('Stable idempotency key for THIS action (max 400 chars). Reuse on retries of the same action only.', true),
        note: str('Optional note; required for comment feedback.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const recommendationId = positiveInt(args.recommendationId, 'recommendationId')
        const feedbackType = oneOf(args.feedbackType, 'feedbackType', ['open', 'like', 'dislike', 'comment', 'dismiss'])
        const stableRequestId = requestId(args.requestId)
        const note = typeof args.note === 'string' ? args.note.trim() : ''
        if (feedbackType === 'comment' && note === '') throw new Error('newsclaw: note is required for comment feedback')
        const argv = ['--recommendation-id', String(recommendationId), '--feedback-type', feedbackType, '--request-id', stableRequestId]
        if (note !== '') argv.push('--note', note)
        return bridge.run('submit-feedback', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_get_spotlight',
      description: 'Fetch the current proactive surprise-recommendation card (spotlight candidate) with its spotlight_reason, spotlight_score and spotlight_hook, or null when none is pending.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('get-spotlight', []),
    })),

    register(defineTool({
      name: 'newsclaw_respond_spotlight',
      description: 'React to a proactive surprise-news spotlight: view only marks the card seen; open records a weak article-open learning signal; like/dislike learn preference; dismiss removes it; chat starts dialogue. REQUIRES a stable requestId for every learning action; reuse it only for retries of the same action.',
      parameters: {
        articleId: str('The card article_id.', true),
        media: str('Optional media name for disambiguation.', false),
        response: str('One of: view, open, like, dislike, dismiss, chat.', true),
        requestId: str('Stable idempotency key for THIS action (max 400 chars).', true),
        title: str('Optional card title.', false),
        message: str('Message when response is chat.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const articleId = nonEmpty(args.articleId, 'articleId')
        const response = oneOf(args.response, 'response', ['view', 'open', 'like', 'dislike', 'dismiss', 'chat'])
        const stableRequestId = requestId(args.requestId)
        const message = typeof args.message === 'string' ? args.message.trim() : ''
        if (response === 'chat' && message === '') throw new Error('newsclaw: message is required for a chat spotlight response')
        const argv: string[] = ['--article-id', articleId]
        if (typeof args.media === 'string' && args.media.trim() !== '') argv.push('--media', args.media.trim())
        argv.push('--response', response, '--request-id', stableRequestId)
        if (typeof args.title === 'string' && args.title.trim() !== '') argv.push('--title', args.title.trim())
        if (message !== '') argv.push('--message', message)
        return bridge.run('respond-spotlight', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_get_runtime_status',
      description: 'NewsClaw runtime summary: initialized, recommendation count, pool availability, unread count, LLM concurrency, last refresh. Use it to check whether the backend is ready before other calls.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('runtime-status', []),
    })),

    register(defineTool({
      name: 'newsclaw_get_activity_feed',
      description: 'Recent NewsClaw activity feed (profile updates, spotlight generation, probes, saves).',
      parameters: {
        limit: int('How many feed entries (default 10).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: async (args: Record<string, unknown>) => {
        const limit = typeof args.limit === 'number' ? args.limit : 10
        return bridge.run('activity-feed', ['--limit', String(Math.max(1, Math.min(100, Math.floor(limit))))])
      },
    })),

    register(defineTool({
      name: 'newsclaw_get_source_availability',
      description: 'Read the enabled news-source inventory and health state by media and technical provider, including online/degraded/offline status, last success and current error.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('source-availability', []),
    })),

    register(defineTool({
      name: 'newsclaw_chat',
      description: 'Send one durable Socratic dialogue turn to the NewsClaw soul engine. The reply probes deeper and the exchange feeds back into the user profile. REQUIRES a stable turnId: reuse it only when retrying this exact turn after a timeout.',
      parameters: {
        message: str('The message to send (user\'s words, relayed verbatim).', true),
        turnId: str('Stable durable turn identity for THIS message (max 400 chars). Reuse on an exact retry only.', true),
        session: str('Dialogue session name (default dsh).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const message = nonEmpty(args.message, 'message')
        const turnId = stableKey(args.turnId, 'turnId')
        const argv = ['--message', message, '--turn-id', turnId]
        if (typeof args.session === 'string' && args.session.trim() !== '') argv.push('--session', args.session.trim())
        return bridge.run('chat', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_get_chat_history',
      description: 'Read the durable Socratic dialogue history for a session.',
      parameters: {
        session: str('Dialogue session name (default dsh).', false),
        limit: int('How many turns to read (default 50).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: async (args: Record<string, unknown>) => {
        const argv: string[] = []
        if (typeof args.session === 'string' && args.session.trim() !== '') argv.push('--session', args.session.trim())
        const limit = typeof args.limit === 'number' ? args.limit : 50
        argv.push('--limit', String(Math.max(1, Math.min(200, Math.floor(limit)))))
        return bridge.run('chat-history', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_next_probe',
      description: 'Get the next speculative interest hypothesis to ask the user about: a ready-to-ask question plus domain/reason/specifics/confidence, or null when nothing is pending. Ask the user the question, then relay their answer with respond_interest_probe.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('next-probe', []),
    })),

    register(defineTool({
      name: 'newsclaw_respond_interest_probe',
      description: 'Answer a speculative interest probe: confirm (promote it), reject (30-day cooldown), defer (snooze), or chat (forward to the dialogue engine and return its reply).',
      parameters: {
        domain: str('The probe domain, exactly as returned by next_probe.', true),
        response: str('One of: confirm, reject, defer, chat.', true),
        requestId: str('Stable idempotency key for THIS response. Reuse only when retrying it.', true),
        message: str('Optional message (used with chat).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const domain = nonEmpty(args.domain, 'domain')
        const response = oneOf(args.response, 'response', ['confirm', 'reject', 'defer', 'chat'])
        const stableRequestId = requestId(args.requestId)
        const argv = ['--domain', domain, '--response', response, '--request-id', stableRequestId]
        if (typeof args.message === 'string' && args.message.trim() !== '') argv.push('--message', args.message.trim())
        return bridge.run('respond-interest-probe', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_next_avoidance_probe',
      description: 'Get the next speculative avoidance hypothesis to ask the user about, or null when nothing is pending.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('next-avoidance-probe', []),
    })),

    register(defineTool({
      name: 'newsclaw_respond_avoidance_probe',
      description: 'Answer a speculative avoidance probe: confirm (register the avoidance), reject, defer (snooze), or chat (forward to the dialogue engine).',
      parameters: {
        domain: str('The probe domain, exactly as returned by next_avoidance_probe.', true),
        response: str('One of: confirm, reject, defer, chat.', true),
        requestId: str('Stable idempotency key for THIS response. Reuse only when retrying it.', true),
        message: str('Optional message (used with chat).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const domain = nonEmpty(args.domain, 'domain')
        const response = oneOf(args.response, 'response', ['confirm', 'reject', 'defer', 'chat'])
        const stableRequestId = requestId(args.requestId)
        const argv = ['--domain', domain, '--response', response, '--request-id', stableRequestId]
        if (typeof args.message === 'string' && args.message.trim() !== '') argv.push('--message', args.message.trim())
        return bridge.run('respond-avoidance-probe', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_get_profile',
      description: 'The current NewsClaw user profile summary (interests, avoidances, traits). Use it to understand what the user likes before recommending or chatting.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('get-profile', []),
    })),

    register(defineTool({
      name: 'newsclaw_get_profile_edit_state',
      description: 'The full overlay edit state of the user profile (what the system believes vs. what the user has explicitly confirmed/edited).',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: () => bridge.run('profile-edit-state', []),
    })),

    register(defineTool({
      name: 'newsclaw_edit_profile',
      description: 'Apply one deterministic profile overlay edit. target is an onion field path (e.g. core.core_traits) or an interest polarity (likes/dislikes); op is set/add/remove/reset; parent targets a specific interest domain under likes/dislikes; weight pins a domain weight.',
      parameters: {
        target: str('Field path or polarity (e.g. core.core_traits, likes, dislikes).', true),
        op: str('One of: set, add, remove, reset.', true),
        value: str('Value for set/add (string form; numbers pass through).', false),
        parent: str('Specific interest domain when target is likes/dislikes.', false),
        weight: str('Optional weight (number as string) when pinning a domain.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const target = nonEmpty(args.target, 'target')
        const op = oneOf(args.op, 'op', ['set', 'add', 'remove', 'reset'])
        const argv = ['--target', target, '--op', op]
        if (typeof args.value === 'string' && args.value.trim() !== '') argv.push('--value', args.value.trim())
        if (typeof args.parent === 'string' && args.parent.trim() !== '') argv.push('--parent', args.parent.trim())
        if (typeof args.weight === 'string' && args.weight.trim() !== '') argv.push('--weight', args.weight.trim())
        return bridge.run('edit-profile', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_save_local',
      description: 'Save a news article to the local favorite or watch_later list. This never writes to a media account or external service.',
      parameters: {
        listKind: str('Which list: favorite or watch_later.', true),
        articleId: str('The article_id.', true),
        media: str('Optional media name.', false),
        title: str('Optional title.', false),
        originalUrl: str('Optional original article URL.', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later'])
        const articleId = nonEmpty(args.articleId, 'articleId')
        const argv = ['--list-kind', listKind, '--article-id', articleId]
        if (typeof args.media === 'string' && args.media.trim() !== '') argv.push('--media', args.media.trim())
        if (typeof args.title === 'string' && args.title.trim() !== '') argv.push('--title', args.title.trim())
        if (typeof args.originalUrl === 'string' && args.originalUrl.trim() !== '') argv.push('--original-url', args.originalUrl.trim())
        return bridge.run('save-local', argv)
      },
    })),

    register(defineTool({
      name: 'newsclaw_remove_saved',
      description: 'Remove one item from the local favorite or watch_later list.',
      parameters: {
        listKind: str('Which list: favorite or watch_later.', true),
        articleId: str('The article_id.', true),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      execute: async (args: Record<string, unknown>) => {
        const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later'])
        const articleId = nonEmpty(args.articleId, 'articleId')
        return bridge.run('remove-saved', ['--list-kind', listKind, '--article-id', articleId])
      },
    })),

    register(defineTool({
      name: 'newsclaw_list_saved',
      description: 'List the local favorite or watch_later items.',
      parameters: {
        listKind: str('Which list: favorite or watch_later.', true),
        limit: int('How many items (default 50).', false),
      },
      output: TEXT_OUTPUT,
      timeoutMs: bridge.config.timeoutMs,
      isConcurrencySafe: () => true,
      execute: async (args: Record<string, unknown>) => {
        const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later'])
        const limit = typeof args.limit === 'number' ? args.limit : 50
        return bridge.run('list-saved', ['--list-kind', listKind, '--limit', String(Math.max(1, Math.min(200, Math.floor(limit))))])
      },
    })),
  ]
}
