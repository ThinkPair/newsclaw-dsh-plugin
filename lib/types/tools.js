/**
 * Agent-bridge tool set: one DSH tool per NewsClaw capability, mirroring
 * the newsclaw-adapter skill names so the agent can operate the
 * consumption loop (recommend → monitor changes → probes → chat → save → feedback)
 * without raw shell access. Durable write tools (feedback, spotlight respond,
 * probes respond) REQUIRE the caller to supply a stable `requestId`; durable
 * chat uses a stable `turnId`. Reuse either identity only for retries of the
 * same action — never across different actions.
 * @module @newsclaw/dsh-plugin
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { isIP } from 'node:net';
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
/** Validate one canonical enum before a request reaches the backend adapter. */
function oneOf(value, label, allowed) {
    const text = nonEmpty(value, label).toLowerCase();
    if (!allowed.includes(text))
        throw new Error(`newsclaw: ${label} must be one of: ${allowed.join(', ')}`);
    return text;
}
/** Stable durable-write key: the adapter contract caps it at 400 chars. */
function stableKey(value, label) {
    const text = nonEmpty(value, label);
    if (text.length > 400)
        throw new Error(`newsclaw: ${label} must be at most 400 characters`);
    return text;
}
function requestId(value) {
    return stableKey(value, 'requestId');
}
function ipv4Octets(host) {
    const parts = host.split('.');
    if (parts.length !== 4)
        return null;
    const octets = parts.map(part => Number(part));
    return octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
        ? octets
        : null;
}
/** Match Python ipaddress's public-only boundary for literal IPv4 inputs. */
function isPublicIpv4(host) {
    const octets = ipv4Octets(host);
    if (!octets)
        return false;
    const a = octets[0];
    const b = octets[1];
    const c = octets[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224)
        return false;
    if (a === 100 && b >= 64 && b <= 127)
        return false;
    if (a === 169 && b === 254)
        return false;
    if (a === 172 && b >= 16 && b <= 31)
        return false;
    if (a === 192 && b === 168)
        return false;
    if (a === 192 && b === 0 && c === 0)
        return false;
    if (a === 192 && b === 0 && c === 2)
        return false;
    if (a === 198 && (b === 18 || b === 19))
        return false;
    if (a === 198 && b === 51 && c === 100)
        return false;
    if (a === 203 && b === 0 && c === 113)
        return false;
    return true;
}
function ipv6Words(host) {
    const halves = host.toLowerCase().split('::');
    if (halves.length > 2)
        return null;
    const parseHalf = (half) => {
        if (half === '')
            return [];
        const words = [];
        for (const part of half.split(':')) {
            if (!/^[0-9a-f]{1,4}$/.test(part))
                return null;
            words.push(Number.parseInt(part, 16));
        }
        return words;
    };
    const left = parseHalf(halves[0] ?? '');
    const right = parseHalf(halves[1] ?? '');
    if (!left || !right)
        return null;
    if (halves.length === 1)
        return left.length === 8 ? left : null;
    const zeros = 8 - left.length - right.length;
    if (zeros < 1)
        return null;
    return [...left, ...Array.from({ length: zeros }, () => 0), ...right];
}
/** Reject every directly-addressed non-global literal before it reaches NewsClaw. */
function isPublicIpLiteral(host) {
    const version = isIP(host);
    if (version === 4)
        return isPublicIpv4(host);
    if (version !== 6)
        return false;
    const words = ipv6Words(host);
    if (!words)
        return false;
    const first = words[0];
    const second = words[1];
    const ipv4Mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff;
    if (ipv4Mapped) {
        const mappedHigh = words[6];
        const mappedLow = words[7];
        const mapped = [mappedHigh >> 8, mappedHigh & 0xff, mappedLow >> 8, mappedLow & 0xff].join('.');
        return isPublicIpv4(mapped);
    }
    if (words.every(word => word === 0))
        return false; // ::/128 unspecified
    if (words.slice(0, 7).every(word => word === 0) && words[7] === 1)
        return false;
    if ((first & 0xfe00) === 0xfc00)
        return false; // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80)
        return false; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00)
        return false; // ff00::/8 multicast
    if (first === 0x0100 && words.slice(1, 4).every(word => word === 0))
        return false;
    if (first === 0x2001 && second === 0x0db8)
        return false; // documentation-only
    // IPv4-compatible and other ::/96 special forms are not public destinations.
    if (words.slice(0, 6).every(word => word === 0))
        return false;
    return true;
}
/** Public research inputs must never cross into local or credential-bearing URLs. */
function publicHttpUrl(value, label) {
    const text = nonEmpty(value, label);
    let url;
    try {
        url = new URL(text);
    }
    catch {
        throw new Error(`newsclaw: ${label} must be a valid public http(s) URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
        throw new Error(`newsclaw: ${label} must be a public http(s) URL without credentials`);
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const literalVersion = isIP(host);
    const blocked = host === 'localhost'
        || host.endsWith('.localhost')
        || host.endsWith('.local')
        || host.endsWith('.internal')
        || (literalVersion === 0 && !host.includes('.'))
        || (literalVersion !== 0 && !isPublicIpLiteral(host));
    if (blocked)
        throw new Error(`newsclaw: ${label} must point to a public web page`);
    return url.toString();
}
/** Recommendation ids are positive database identities, not arbitrary numbers. */
function positiveInt(value, label) {
    const result = typeof value === 'number' ? Math.floor(value) : NaN;
    if (!Number.isFinite(result) || result <= 0)
        throw new Error(`newsclaw: ${label} must be a positive integer`);
    return result;
}
/**
 * Register every bridge tool on ctx.tools.
 * @param ctx - plugin context with the tools registry.
 * @param bridge - the resolved bridge face.
 * @returns array of tool disposers (for effect wiring).
 */
export function registerBridgeTools(ctx, bridge) {
    const registered = [];
    class ProfileEditUncertainError extends Error {
        retryable = true;
        outcomeUncertain = true;
        constructor(cause) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            super(`newsclaw: profile edit outcome is uncertain; retry the exact same payload with the same requestId (${detail})`, { cause });
            this.name = 'ProfileEditUncertainError';
        }
    }
    const profileEditRequests = new Map();
    const runProfileEdit = (id, argv) => {
        const fingerprint = JSON.stringify(argv);
        const existing = profileEditRequests.get(id);
        if (existing) {
            if (existing.fingerprint !== fingerprint) {
                return Promise.reject(new Error('newsclaw: requestId was already used for a different profile edit'));
            }
            if (existing.promise)
                return existing.promise;
            existing.outcome = 'in_flight';
            existing.promise = Promise.resolve()
                .then(() => bridge.run('edit-profile', argv))
                .then(value => {
                existing.outcome = 'succeeded';
                return value;
            })
                .catch(error => {
                existing.outcome = 'uncertain';
                existing.promise = null;
                throw new ProfileEditUncertainError(error);
            });
            return existing.promise;
        }
        const request = { fingerprint, outcome: 'in_flight', promise: null };
        profileEditRequests.set(id, request);
        request.promise = Promise.resolve()
            .then(() => bridge.run('edit-profile', argv))
            .then(value => {
            request.outcome = 'succeeded';
            return value;
        })
            .catch(error => {
            // A transport failure can happen after the backend applied the edit.
            // Keep the identity/fingerprint binding and permit only an exact retry.
            request.outcome = 'uncertain';
            request.promise = null;
            throw new ProfileEditUncertainError(error);
        });
        if (profileEditRequests.size > 256) {
            for (const [candidateId, candidate] of profileEditRequests) {
                if (candidateId !== id && candidate.outcome === 'succeeded') {
                    profileEditRequests.delete(candidateId);
                    break;
                }
            }
        }
        return request.promise;
    };
    const register = (definition) => {
        try {
            const dispose = ctx.tools.register(definition);
            registered.push(dispose);
            return dispose;
        }
        catch (error) {
            // Registration must be atomic: a hot-load failure cannot leave a
            // partial set of stale tools behind for the next loader attempt.
            for (const dispose of [...registered].reverse()) {
                try {
                    dispose();
                }
                catch { /* preserve the original registration error */ }
            }
            registered.length = 0;
            throw error;
        }
    };
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
            description: 'Submit one explicit news-learning signal (open, like, dislike, comment or dismiss). open is a weak reading signal; local favorite/watch_later membership does not train the profile. REQUIRES a stable requestId: reuse it only when retrying this exact same action.',
            parameters: {
                recommendationId: int('The recommendation card id (the `recommendation_id` field returned by recommend/append).', true),
                feedbackType: str('One of: open, like, dislike, comment, dismiss.', true),
                requestId: str('Stable idempotency key for THIS action (max 400 chars). Reuse on retries of the same action only.', true),
                note: str('Optional note; required for comment feedback.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const recommendationId = positiveInt(args.recommendationId, 'recommendationId');
                const feedbackType = oneOf(args.feedbackType, 'feedbackType', ['open', 'like', 'dislike', 'comment', 'dismiss']);
                const stableRequestId = requestId(args.requestId);
                const note = typeof args.note === 'string' ? args.note.trim() : '';
                if (feedbackType === 'comment' && note === '')
                    throw new Error('newsclaw: note is required for comment feedback');
                const argv = ['--recommendation-id', String(recommendationId), '--feedback-type', feedbackType, '--request-id', stableRequestId];
                if (note !== '')
                    argv.push('--note', note);
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
            execute: async (args) => {
                const articleId = nonEmpty(args.articleId, 'articleId');
                const response = oneOf(args.response, 'response', ['view', 'open', 'like', 'dislike', 'dismiss', 'chat']);
                const stableRequestId = requestId(args.requestId);
                const message = typeof args.message === 'string' ? args.message.trim() : '';
                if (response === 'chat' && message === '')
                    throw new Error('newsclaw: message is required for a chat spotlight response');
                const argv = ['--article-id', articleId];
                if (typeof args.media === 'string' && args.media.trim() !== '')
                    argv.push('--media', args.media.trim());
                argv.push('--response', response, '--request-id', stableRequestId);
                if (typeof args.title === 'string' && args.title.trim() !== '')
                    argv.push('--title', args.title.trim());
                if (message !== '')
                    argv.push('--message', message);
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
            description: 'Send one durable Socratic dialogue turn to the NewsClaw soul engine. The reply probes deeper and the exchange feeds back into the user profile. REQUIRES a stable turnId: reuse it only when retrying this exact turn after a timeout.',
            parameters: {
                message: str('The message to send (user\'s words, relayed verbatim).', true),
                turnId: str('Stable durable turn identity for THIS message (max 400 chars). Reuse on an exact retry only.', true),
                session: str('Dialogue session name (default dsh).', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const message = nonEmpty(args.message, 'message');
                const turnId = stableKey(args.turnId, 'turnId');
                const argv = ['--message', message, '--turn-id', turnId];
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
                const response = oneOf(args.response, 'response', ['confirm', 'reject', 'defer', 'chat']);
                const stableRequestId = requestId(args.requestId);
                const argv = ['--domain', domain, '--response', response, '--request-id', stableRequestId];
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
                const response = oneOf(args.response, 'response', ['confirm', 'reject', 'defer', 'chat']);
                const stableRequestId = requestId(args.requestId);
                const argv = ['--domain', domain, '--response', response, '--request-id', stableRequestId];
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
            description: 'Apply one deterministic profile overlay edit. REQUIRES a stable requestId; an exact retry is coalesced locally and reusing the identity for different content is rejected. If a transport result is uncertain, retry only the exact same payload with the same requestId.',
            parameters: {
                target: str('Field path or polarity (e.g. core.core_traits, likes, dislikes).', true),
                op: str('One of: set, add, remove, reset.', true),
                value: str('Value for set/add (string form; numbers pass through).', false),
                parent: str('Specific interest domain when target is likes/dislikes.', false),
                weight: str('Optional weight (number as string) when pinning a domain.', false),
                requestId: str('Stable idempotency key for THIS profile edit. Reuse only for an exact retry.', true),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const target = nonEmpty(args.target, 'target');
                const op = oneOf(args.op, 'op', ['set', 'add', 'remove', 'reset']);
                const stableRequestId = requestId(args.requestId);
                const argv = ['--target', target, '--op', op];
                if (typeof args.value === 'string' && args.value.trim() !== '')
                    argv.push('--value', args.value.trim());
                if (typeof args.parent === 'string' && args.parent.trim() !== '')
                    argv.push('--parent', args.parent.trim());
                if (typeof args.weight === 'string' && args.weight.trim() !== '')
                    argv.push('--weight', args.weight.trim());
                return runProfileEdit(stableRequestId, argv);
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
                const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later']);
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
                const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later']);
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
                const listKind = oneOf(args.listKind, 'listKind', ['favorite', 'watch_later']);
                const limit = typeof args.limit === 'number' ? args.limit : 50;
                return bridge.run('list-saved', ['--list-kind', listKind, '--limit', String(Math.max(1, Math.min(200, Math.floor(limit))))]);
            },
        })),
        register(defineTool({
            name: 'newsclaw_search_web',
            description: 'Search the public web for fresh, citable evidence through the NewsClaw research backend. Results are bounded and token-efficient. Send only a short, de-identified public-web query; never send private profile, notes, credentials or unpublished material.',
            parameters: {
                query: str('Required short public-web search query without private context.', true),
                topic: { type: 'string', enum: ['general', 'news', 'finance'], description: 'Search category: general (default), news, or finance.' },
                timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Optional freshness window.' },
                maxResults: int('Maximum results (default 5; hard limit 8).', false),
                refresh: bool('Bypass a reusable cached result when freshness matters.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            isConcurrencySafe: () => true,
            execute: async (args) => {
                const query = nonEmpty(args.query, 'query');
                const topic = args.topic === undefined ? 'general' : oneOf(args.topic, 'topic', ['general', 'news', 'finance']);
                const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 5;
                const argv = ['--query', query, '--topic', topic, '--max-results', String(Math.max(1, Math.min(8, Math.floor(maxResults))))];
                if (args.timeRange !== undefined)
                    argv.push('--time-range', oneOf(args.timeRange, 'timeRange', ['day', 'week', 'month', 'year']));
                if (args.refresh === true)
                    argv.push('--refresh');
                return bridge.run('research-search', argv);
            },
        })),
        register(defineTool({
            name: 'newsclaw_extract_evidence',
            description: 'Extract bounded query-relevant evidence from one to three public pages after search. Never send private/intranet URLs, profile data, notes, credentials or unpublished material.',
            parameters: {
                query: str('Required short relevance question without private context.', true),
                urls: { type: 'array', items: { type: 'string' }, required: true, description: 'One to three public HTTP(S) page URLs.' },
                chunksPerSource: int('Relevant chunks per source (default 2; hard limit 3).', false),
                refresh: bool('Bypass a reusable cached extraction when the page changed.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            isConcurrencySafe: () => true,
            execute: async (args) => {
                const query = nonEmpty(args.query, 'query');
                if (!Array.isArray(args.urls) || args.urls.length === 0 || args.urls.length > 3) {
                    throw new Error('newsclaw: urls must contain between 1 and 3 public http(s) URLs');
                }
                const urls = args.urls.map((url, index) => publicHttpUrl(url, `urls[${index}]`));
                const chunksPerSource = typeof args.chunksPerSource === 'number' ? args.chunksPerSource : 2;
                const argv = ['--query', query];
                for (const url of urls)
                    argv.push('--url', url);
                argv.push('--chunks-per-source', String(Math.max(1, Math.min(3, Math.floor(chunksPerSource)))));
                if (args.refresh === true)
                    argv.push('--refresh');
                return bridge.run('research-extract', argv);
            },
        })),
        register(defineTool({
            name: 'newsclaw_list_web_monitors',
            description: 'List every active NewsClaw webpage/PDF monitor with objective status, latest baseline version, meaningful-change count and next check time.',
            parameters: {},
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            isConcurrencySafe: () => true,
            execute: () => bridge.run('web-monitor-list', []),
        })),
        register(defineTool({
            name: 'newsclaw_add_web_monitor',
            description: 'Add one public HTTP(S) webpage or PDF to durable local monitoring and establish its first text baseline. The baseline does not create a false change notification. REQUIRES a stable requestId for safe retries.',
            parameters: {
                url: str('Public HTTP(S) URL to monitor. Local/private-network and credential-bearing URLs are rejected.', true),
                requestId: str('Stable idempotency key for THIS add request. Reuse only for an exact retry.', true),
                kind: str('Content kind: auto, html or pdf. Default auto.', false),
                label: str('Optional short name shown to the user.', false),
                focus: str('Optional user note describing what to watch. It does not override objective change detection.', false),
                intervalMinutes: int('Check interval from 5 to 10080 minutes. Default 1440.', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: async (args) => {
                const url = nonEmpty(args.url, 'url');
                const stableRequestId = requestId(args.requestId);
                const kind = typeof args.kind === 'string' && args.kind.trim() !== ''
                    ? oneOf(args.kind, 'kind', ['auto', 'html', 'pdf'])
                    : 'auto';
                const interval = typeof args.intervalMinutes === 'number' ? Math.floor(args.intervalMinutes) : 1440;
                if (interval < 5 || interval > 10_080)
                    throw new Error('newsclaw: intervalMinutes must be between 5 and 10080');
                const argv = ['--url', url, '--kind', kind, '--interval-minutes', String(interval), '--request-id', stableRequestId];
                if (typeof args.label === 'string' && args.label.trim() !== '')
                    argv.push('--label', args.label.trim());
                if (typeof args.focus === 'string' && args.focus.trim() !== '')
                    argv.push('--focus', args.focus.trim());
                return bridge.run('web-monitor-add', argv);
            },
        })),
        register(defineTool({
            name: 'newsclaw_check_web_monitor',
            description: 'Run one immediate check of an existing webpage/PDF monitor. A confirmed normalized-text change is committed to version history, the event archive and the local inbox in one transaction. REQUIRES a stable requestId.',
            parameters: {
                monitorId: str('monitor_id returned by list/add.', true),
                requestId: str('Stable idempotency key for THIS check. Reuse only for an exact retry.', true),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: (args) => bridge.run('web-monitor-check', [
                '--monitor-id', nonEmpty(args.monitorId, 'monitorId'),
                '--request-id', requestId(args.requestId),
            ]),
        })),
        register(defineTool({
            name: 'newsclaw_set_web_monitor_state',
            description: 'Pause, resume or soft-remove a webpage/PDF monitor. Historical versions and event evidence remain local and auditable.',
            parameters: {
                monitorId: str('monitor_id returned by list/add.', true),
                action: str('One of: pause, resume, remove.', true),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: (args) => bridge.run('web-monitor-set-state', [
                '--monitor-id', nonEmpty(args.monitorId, 'monitorId'),
                '--action', oneOf(args.action, 'action', ['pause', 'resume', 'remove']),
            ]),
        })),
        register(defineTool({
            name: 'newsclaw_get_web_monitor_history',
            description: 'Read the immutable checks, text versions and exact added/removed change evidence for one monitor. Full text stays folded in the UI but remains locally auditable.',
            parameters: {
                monitorId: str('monitor_id returned by list/add.', true),
                limit: int('Maximum history rows per section (default 20, max 200).', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            isConcurrencySafe: () => true,
            execute: (args) => {
                const limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 20;
                return bridge.run('web-monitor-history', [
                    '--monitor-id', nonEmpty(args.monitorId, 'monitorId'),
                    '--limit', String(Math.max(1, Math.min(200, limit))),
                ]);
            },
        })),
        register(defineTool({
            name: 'newsclaw_list_monitor_notifications',
            description: 'List durable local webpage/PDF change and failure notifications. Unread is the default; includeRead=true also returns handled history.',
            parameters: {
                includeRead: bool('Include already-read notifications.', false),
                limit: int('Maximum rows (default 50, max 200).', false),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            isConcurrencySafe: () => true,
            execute: (args) => {
                const limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 50;
                const argv = ['--limit', String(Math.max(1, Math.min(200, limit)))];
                if (args.includeRead === true)
                    argv.push('--include-read');
                return bridge.run('web-monitor-notifications', argv);
            },
        })),
        register(defineTool({
            name: 'newsclaw_act_on_monitor_notification',
            description: 'Acknowledge delivery, mark read or dismiss one durable monitor notification. REQUIRES a stable requestId so retries cannot mutate a different action.',
            parameters: {
                deliveryId: str('delivery_id returned by list_monitor_notifications.', true),
                action: str('One of: delivered, read, dismiss.', true),
                requestId: str('Stable idempotency key for THIS notification action.', true),
            },
            output: TEXT_OUTPUT,
            timeoutMs: bridge.config.timeoutMs,
            execute: (args) => bridge.run('web-monitor-notification-action', [
                '--delivery-id', nonEmpty(args.deliveryId, 'deliveryId'),
                '--action', oneOf(args.action, 'action', ['delivered', 'read', 'dismiss']),
                '--request-id', requestId(args.requestId),
            ]),
        })),
    ];
}
//# sourceMappingURL=tools.js.map