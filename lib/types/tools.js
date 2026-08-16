/**
 * Agent-bridge tool set: one DSH tool per NewsClaw capability, mirroring
 * the newsclaw-adapter skill names so the agent can operate the
 * consumption loop (recommend → spotlight → probes → chat → save → feedback)
 * without raw shell access. Durable write tools (feedback, spotlight respond,
 * probes respond) REQUIRE the caller to supply a stable `requestId` and reuse
 * it for retries of the same action — never across different actions.
 * @module @newsclaw/dsh-plugin
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
/** Plain-text output: the canonical JSON value renders as its text form. */
const TEXT_OUTPUT = {
    schema: { type: 'json' },
    render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
    ],
};
/** Simple string parameter helper (required keys annotated, optional keys omitted). */
function str(description, required = false) {
    return required
        ? { type: 'string', required: true, description }
        : { type: 'string', description };
}
/** Simple integer parameter helper. */
function int(description, required = false) {
    return required
        ? { type: 'integer', required: true, description }
        : { type: 'integer', description };
}
/** Simple boolean parameter helper. */
function bool(description, required = false) {
    return required
        ? { type: 'boolean', required: true, description }
        : { type: 'boolean', description };
}
/** Reject empty-string params that a CLI flag would otherwise swallow. */
function nonEmpty(value, label) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '')
        throw new Error(`newsclaw: ${label} is required`);
    return text;
}
/**
 * Register every bridge tool on ctx.tools.
 * @param ctx - plugin context with the tools registry.
 * @param bridge - the resolved bridge face.
 * @returns array of tool disposers (for effect wiring).
 */
export function registerBridgeTools(ctx, bridge) {
    const register = (definition) => ctx.tools.register(definition);
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
            execute: async (args) => {
                const argv = [];
                const limit = typeof args.limit === 'number' ? args.limit : 5;
                argv.push('--limit', String(Math.max(1, Math.min(50, Math.floor(limit)))));
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                if (typeof args.excludeArticleId === 'string' && args.excludeArticleId.trim() !== '')
                    argv.push('--exclude-article-id', args.excludeArticleId.trim());
                if (args.refreshIfNeeded === true)
                    argv.push('--refresh-if-needed');
                if (args.realtime === true)
                    argv.push('--realtime');
                return bridge.run('recommend', argv);
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
            execute: async (args) => {
                const argv = [];
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                if (typeof args.excludedArticleIds === 'string' && args.excludedArticleIds.trim() !== '') {
                    for (const id of args.excludedArticleIds.split(',').map(s => s.trim()).filter(Boolean))
                        argv.push('--exclude-article-id', id);
                }
                return bridge.run('reshuffle', argv);
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
            execute: async (args) => {
                const argv = [];
                const limit = typeof args.limit === 'number' ? args.limit : 5;
                argv.push('--limit', String(Math.max(1, Math.min(50, Math.floor(limit)))));
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                if (typeof args.excludedArticleIds === 'string' && args.excludedArticleIds.trim() !== '') {
                    for (const id of args.excludedArticleIds.split(',').map(s => s.trim()).filter(Boolean))
                        argv.push('--exclude-article-id', id);
                }
                return bridge.run('append', argv);
            },
        })),
        register(defineTool({
            name: 'newsclaw_submit_feedback',
            description: 'Submit one explicit news-learning signal (open, like, dislike, ignore, watch_later, favorite or comment). REQUIRES a stable requestId: reuse it only when retrying this exact same action.',
            parameters: {
                recommendationId: int('The recommendation card id (the `recommendation_id` field returned by recommend/append).', true),
                feedbackType: str('One of: open, like, dislike, ignore, watch_later, favorite, comment.', true),
                requestId: str('Stable idempotency key for THIS action (max 400 chars). Reuse on retries of the same action only.', true),
                note: str('Optional note; required for comment feedback.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const recommendationId = typeof args.recommendationId === 'number' ? Math.floor(args.recommendationId) : NaN;
                if (!Number.isFinite(recommendationId))
                    throw new Error('newsclaw: recommendationId is required');
                const feedbackType = nonEmpty(args.feedbackType, 'feedbackType');
                const requestId = nonEmpty(args.requestId, 'requestId');
                const argv = ['--recommendation-id', String(recommendationId), '--feedback-type', feedbackType, '--request-id', requestId];
                if (typeof args.note === 'string' && args.note.trim() !== '')
                    argv.push('--note', args.note.trim());
                return bridge.run('submit-feedback', argv);
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
            description: 'React to a proactive surprise-news spotlight: open, like, dislike, ignore or chat. ignore removes it from future recommendations. REQUIRES a stable requestId reused only for retries of the same action.',
            parameters: {
                articleId: str('The card article_id.', true),
                media: str('Optional media name for disambiguation.', false),
                response: str('One of: open, like, dislike, ignore, chat.', true),
                requestId: str('Stable idempotency key for THIS action (max 400 chars).', true),
                title: str('Optional card title.', false),
                message: str('Message when response is chat.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const articleId = nonEmpty(args.articleId, 'articleId');
                const response = nonEmpty(args.response, 'response');
                const requestId = nonEmpty(args.requestId, 'requestId');
                const argv = ['--article-id', articleId];
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                argv.push('--response', response, '--request-id', requestId);
                if (typeof args.title === 'string' && args.title.trim() !== '')
                    argv.push('--title', args.title.trim());
                if (typeof args.message === 'string' && args.message.trim() !== '')
                    argv.push('--message', args.message.trim());
                return bridge.run('respond-spotlight', argv);
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
            execute: async (args) => {
                const limit = typeof args.limit === 'number' ? args.limit : 10;
                return bridge.run('activity-feed', ['--limit', String(Math.max(1, Math.min(100, Math.floor(limit))))]);
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
            description: 'Send one Socratic dialogue turn to the NewsClaw soul engine. The reply probes deeper and the exchange feeds back into the user profile. The user\'s answers here are how the system refines interests/avoidances.',
            parameters: {
                message: str('The message to send (user\'s words, relayed verbatim).', true),
                session: str('Dialogue session name (default dsh).', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const message = nonEmpty(args.message, 'message');
                const argv = ['--message', message];
                if (typeof args.session === 'string' && args.session.trim() !== '')
                    argv.push('--session', args.session.trim());
                return bridge.run('chat', argv);
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
            execute: async (args) => {
                const argv = [];
                if (typeof args.session === 'string' && args.session.trim() !== '')
                    argv.push('--session', args.session.trim());
                const limit = typeof args.limit === 'number' ? args.limit : 50;
                argv.push('--limit', String(Math.max(1, Math.min(200, Math.floor(limit)))));
                return bridge.run('chat-history', argv);
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
            execute: async (args) => {
                const domain = nonEmpty(args.domain, 'domain');
                const response = nonEmpty(args.response, 'response');
                const requestId = nonEmpty(args.requestId, 'requestId');
                const argv = ['--domain', domain, '--response', response, '--request-id', requestId];
                if (typeof args.message === 'string' && args.message.trim() !== '')
                    argv.push('--message', args.message.trim());
                return bridge.run('respond-interest-probe', argv);
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
            execute: async (args) => {
                const domain = nonEmpty(args.domain, 'domain');
                const response = nonEmpty(args.response, 'response');
                const requestId = nonEmpty(args.requestId, 'requestId');
                const argv = ['--domain', domain, '--response', response, '--request-id', requestId];
                if (typeof args.message === 'string' && args.message.trim() !== '')
                    argv.push('--message', args.message.trim());
                return bridge.run('respond-avoidance-probe', argv);
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
            execute: async (args) => {
                const target = nonEmpty(args.target, 'target');
                const op = nonEmpty(args.op, 'op');
                const argv = ['--target', target, '--op', op];
                if (typeof args.value === 'string' && args.value.trim() !== '')
                    argv.push('--value', args.value.trim());
                if (typeof args.parent === 'string' && args.parent.trim() !== '')
                    argv.push('--parent', args.parent.trim());
                if (typeof args.weight === 'string' && args.weight.trim() !== '')
                    argv.push('--weight', args.weight.trim());
                return bridge.run('edit-profile', argv);
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
            execute: async (args) => {
                const listKind = nonEmpty(args.listKind, 'listKind');
                const articleId = nonEmpty(args.articleId, 'articleId');
                const argv = ['--list-kind', listKind, '--article-id', articleId];
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                if (typeof args.title === 'string' && args.title.trim() !== '')
                    argv.push('--title', args.title.trim());
                if (typeof args.originalUrl === 'string' && args.originalUrl.trim() !== '')
                    argv.push('--original-url', args.originalUrl.trim());
                return bridge.run('save-local', argv);
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
            execute: async (args) => {
                const listKind = nonEmpty(args.listKind, 'listKind');
                const articleId = nonEmpty(args.articleId, 'articleId');
                return bridge.run('remove-saved', ['--list-kind', listKind, '--article-id', articleId]);
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
            execute: async (args) => {
                const listKind = nonEmpty(args.listKind, 'listKind');
                const limit = typeof args.limit === 'number' ? args.limit : 50;
                return bridge.run('list-saved', ['--list-kind', listKind, '--limit', String(Math.max(1, Math.min(200, Math.floor(limit))))]);
            },
        })),
    ];
}
//# sourceMappingURL=tools.js.map