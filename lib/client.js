window.__ModuleLoader__.load({
	id: "@newsclaw/dsh-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		//#region lib/types/config.js
		/** Shared, side-effect-free plugin row normalization for Node and browser faces. */
		const DEFAULT_API_URL = "http://127.0.0.1:8430";
		const DEFAULT_TIMEOUT_MS = 3e5;
		const MIN_TIMEOUT_MS = 1e3;
		const MAX_TIMEOUT_MS = 9e5;
		/**
		* Accept only an HTTP(S) API origin/base path without credentials, query or
		* fragment. Invalid row values fail closed to the local NewsClaw default.
		*/
		function normalizeApiUrl(value) {
			if (typeof value !== "string" || value.trim() === "") return DEFAULT_API_URL;
			try {
				const url = new URL(value.trim());
				if (!(url.hostname === "127.0.0.1" || url.hostname.toLowerCase() === "localhost" || url.hostname === "[::1]") || url.protocol !== "http:" && url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return DEFAULT_API_URL;
				return url.toString().replace(/\/+$/, "");
			} catch {
				return DEFAULT_API_URL;
			}
		}
		/** Clamp the per-command budget to a finite, operationally useful range. */
		function normalizeTimeoutMs(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
			return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(value)));
		}
		//#endregion
		//#region lib/types/client/api.js
		/**
		* NewsClaw REST client for the browser half. Talks to the user's local
		* backend directly (CORS is permissive). The Harness row config is the
		* primary connection source and is mirrored to localStorage for legacy view
		* fallbacks. Settings reads the dedicated NewsClaw runtime/source contracts;
		* it never writes the legacy generic config endpoint.
		* @module @newsclaw/dsh-plugin
		*/
		/** localStorage key for the API base URL. */
		const API_BASE_KEY = "newsclaw.apiBase";
		/** Default local backend address. */
		const DEFAULT_API_BASE = DEFAULT_API_URL;
		/** Read the persisted API base URL (falling back to the default). */
		function readApiBase() {
			try {
				const saved = localStorage.getItem(API_BASE_KEY);
				if (saved !== null && saved.trim() !== "") return normalizeApiUrl(saved);
			} catch {}
			return DEFAULT_API_BASE;
		}
		/** Persist the API base URL. */
		function writeApiBase(base) {
			try {
				localStorage.setItem(API_BASE_KEY, normalizeApiUrl(base));
			} catch {}
		}
		/**
		* Build a concise human-readable summary from a backend error `detail` so the
		* failure toast shows WHICH field failed validation, not just `failed: 422`.
		* FastAPI wraps validation errors as `{ detail: [{ loc, msg, ... }] }` (or a
		* plain string), so unwrap that envelope and render each entry as `loc.path: msg`.
		*/
		function summarizeDetail(detail) {
			let value = detail;
			if (typeof value === "object" && value !== null && "detail" in value) value = value.detail;
			if (typeof value === "string") return value.trim() === "" ? "" : value.trim();
			if (Array.isArray(value)) {
				const parts = [];
				for (const entry of value) {
					if (typeof entry !== "object" || entry === null) continue;
					const rec = entry;
					const msg = typeof rec.msg === "string" ? rec.msg : "";
					if (msg === "") continue;
					const loc = Array.isArray(rec.loc) ? rec.loc.filter((seg) => typeof seg === "string").join(".") : "";
					parts.push(loc === "" ? msg : `${loc}: ${msg}`);
				}
				return parts.join("; ");
			}
			return "";
		}
		/** Request error carrying the HTTP status and server detail. */
		var ApiError = class extends Error {
			status;
			detail;
			constructor(path, status, detail) {
				const summary = summarizeDetail(detail);
				super(`${path} failed: ${status}${summary === "" ? "" : ` — ${summary}`}`);
				this.status = status;
				this.detail = detail;
			}
		};
		/** Minimal timeout helper: AbortController + cleanup. */
		function withTimeout(ms, outer) {
			if (ms <= 0) return {
				timedOut: () => false,
				cleanup() {}
			};
			const controller = new AbortController();
			let expired = false;
			const onOuterAbort = () => controller.abort();
			if (outer !== void 0) {
				if (outer.aborted) controller.abort();
				else outer.addEventListener("abort", onOuterAbort, { once: true });
			}
			const timer = window.setTimeout(() => {
				expired = true;
				controller.abort();
			}, ms);
			return {
				signal: controller.signal,
				timedOut: () => expired,
				cleanup() {
					window.clearTimeout(timer);
					outer?.removeEventListener("abort", onOuterAbort);
				}
			};
		}
		/** One raw JSON request against the NewsClaw backend. */
		async function requestJson(base, path, options = {}) {
			const { method = "GET", body, headers, timeoutMs = 15e3, signal } = options;
			const timeout = withTimeout(timeoutMs, signal);
			try {
				const res = await fetch(`${base}${path}`, {
					method,
					credentials: "omit",
					signal: timeout.signal,
					headers: body === void 0 && headers === void 0 ? void 0 : {
						...body === void 0 ? {} : { "Content-Type": "application/json" },
						...headers
					},
					body: body === void 0 ? void 0 : JSON.stringify(body)
				});
				if (!res.ok) {
					let detail = null;
					try {
						detail = await res.json();
					} catch {
						detail = null;
					}
					throw new ApiError(path, res.status, detail);
				}
				return res.json();
			} catch (error) {
				if (timeout.timedOut()) throw new Error(`${path} 请求超时（${timeoutMs ?? 15e3}ms），请确认新闻爪后端状态后重试。`);
				throw error;
			} finally {
				timeout.cleanup();
			}
		}
		function asItems(value) {
			if (typeof value !== "object" || value === null) return [];
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
			if (value.indexOf("&") === -1) return value;
			return value.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10))).replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
		}
		function str(value) {
			return typeof value === "string" ? decodeEntities(value) : "";
		}
		/**
		* Normalize one remote cover URL before it is handed to the image proxy.
		* Some source adapters still emit protocol-relative or HTTP CDN URLs; HTTPS
		* is required here because the DSH page itself is commonly served securely.
		*/
		function normalizeImageUrl(value) {
			const url = str(value).trim();
			if (url === "") return "";
			if (url.startsWith("//")) return `https:${url}`;
			if (/^http:\/\//i.test(url)) return `https://${url.slice(7)}`;
			return url;
		}
		/**
		* Build the same backend image-proxy URL used by the browser and PC Web
		* clients. Keeping the remote URL behind the local backend avoids hotlink,
		* referrer and media-CDN CORS failures.
		*/
		function imageProxyUrl(base, value) {
			const url = normalizeImageUrl(value);
			if (url === "") return "";
			try {
				new URL(url);
			} catch {
				return "";
			}
			const apiBase = base.trim().replace(/\/+$/, "");
			return apiBase === "" ? "" : `${apiBase}/api/image-proxy?url=${encodeURIComponent(url)}`;
		}
		/** Mark cross-origin proxy images so the backend can apply its CORS policy. */
		function imageProxyCrossOrigin(base) {
			if (typeof window === "undefined") return void 0;
			try {
				return new URL(base, window.location.href).origin === window.location.origin ? void 0 : "anonymous";
			} catch {
				return;
			}
		}
		/** Return the first non-empty text field, preserving the backend's fallbacks. */
		function firstText(...values) {
			for (const value of values) {
				const text = str(value).trim();
				if (text !== "") return text;
			}
			return "";
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
				body_level: firstText(row.body_level, row.content_level, "title"),
				content_type: firstText(row.content_type, "article"),
				body_text: firstText(row.body_text, row.body, row.content, row.summary),
				published_label: str(row.published_label),
				published_at: str(row.published_at),
				presented: row.presented === true
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
				body_level: firstText(row.body_level, row.content_level, "title"),
				impact_chain: Array.isArray(row.impact_chain) ? row.impact_chain.map(String) : [],
				observation_points: Array.isArray(row.observation_points) ? row.observation_points.map(String) : [],
				published_label: str(row.published_label),
				content_type: str(row.content_type),
				body_text: str(row.body_text),
				state: str(row.state)
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
				challenge: str(row.challenge)
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
				added_at: str(row.added_at)
			};
		}
		/** GET /api/recommendations — the current recommendation snapshot. */
		async function fetchRecommendations(base, signal) {
			return asItems(await requestJson(base, "/api/recommendations", {
				timeoutMs: 2e4,
				signal
			})).map(toRecommendation);
		}
		/** POST /api/recommendations/reshuffle — replace the current page. */
		async function reshuffleRecommendations(base, opts = {}, signal) {
			const body = {};
			if (opts.media !== void 0 && opts.media !== "") body.media = opts.media;
			if (opts.excludedArticleIds !== void 0 && opts.excludedArticleIds.length > 0) body.excluded_article_ids = opts.excludedArticleIds;
			return asItems(await requestJson(base, "/api/recommendations/reshuffle", {
				method: "POST",
				body,
				timeoutMs: 2e4,
				signal
			})).map(toRecommendation);
		}
		/** POST /api/recommendations/append — append another page. */
		async function appendRecommendations(base, opts = {}, signal) {
			const body = {};
			if (opts.media !== void 0 && opts.media !== "") body.media = opts.media;
			if (opts.excludedArticleIds !== void 0 && opts.excludedArticleIds.length > 0) body.excluded_article_ids = opts.excludedArticleIds;
			return asItems(await requestJson(base, "/api/recommendations/append", {
				method: "POST",
				body,
				timeoutMs: 2e4,
				signal
			})).map(toRecommendation);
		}
		/** POST /api/recommendation-click — record a click-through (stable request_id). */
		async function reportClick(base, payload, signal) {
			await requestJson(base, "/api/recommendation-click", {
				method: "POST",
				body: { ...payload },
				timeoutMs: 1e4,
				signal
			});
		}
		/** POST /api/feedback — durable card feedback (stable request_id). */
		async function submitFeedback(base, payload, signal) {
			await requestJson(base, "/api/feedback", {
				method: "POST",
				body: { ...payload },
				timeoutMs: 1e4,
				signal
			});
		}
		/** POST /api/events — ingest behavior events (e.g. saved-card feedback). */
		async function sendBehaviorEvents(base, events, signal) {
			const data = await requestJson(base, "/api/events", {
				method: "POST",
				body: { events },
				timeoutMs: 15e3,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return {
				accepted: num(row.accepted),
				rejected: Array.isArray(row.rejected) ? row.rejected.map((r) => ({
					index: num(r.index),
					type: str(r.type),
					reason: str(r.reason)
				})) : []
			};
		}
		/** GET /api/spotlight/pending-batch — the full un-notified spotlight queue. */
		async function fetchSpotlightBatch(base, signal) {
			return asItems(await requestJson(base, "/api/spotlight/pending-batch?limit=20", {
				timeoutMs: 15e3,
				signal
			})).map(toSpotlight);
		}
		/** GET /api/notifications/pending — one notification-worthy recommendation. */
		async function fetchPendingNotification(base, signal) {
			const data = await requestJson(base, "/api/notifications/pending", {
				timeoutMs: 8e3,
				signal
			});
			if (typeof data !== "object" || data === null) return null;
			const row = data.item;
			if (typeof row !== "object" || row === null) return null;
			const item = row;
			return {
				recommendation_id: num(item.recommendation_id),
				article_id: str(item.article_id),
				title: str(item.title),
				reason: str(item.reason),
				media: str(item.media),
				original_url: firstText(item.original_url, item.content_url)
			};
		}
		/** POST /api/notifications/ack — durable, idempotent NewsClaw message acknowledgement. */
		async function acknowledgeNotification(base, articleId, requestId, signal) {
			const data = await requestJson(base, "/api/notifications/ack", {
				method: "POST",
				body: {
					article_id: articleId,
					request_id: requestId
				},
				timeoutMs: 1e4,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			if (row.ok !== true || str(row.article_id) !== articleId) throw new Error("通知确认没有得到后端确认，请稍后重试。");
		}
		/** POST /api/spotlight/respond — view/like/dislike/dismiss/chat (stable request_id). */
		async function respondToSpotlight(base, payload, signal) {
			return requestJson(base, "/api/spotlight/respond", {
				method: "POST",
				body: { ...payload },
				timeoutMs: 2e4,
				signal
			});
		}
		/** GET /api/interest-probes/pending — active speculative interests. */
		async function fetchInterestProbes(base, signal) {
			return asItems(await requestJson(base, "/api/interest-probes/pending", {
				timeoutMs: 1e4,
				signal
			})).map(toProbe);
		}
		/** POST /api/interest-probes/respond — confirm/reject/defer/chat, idempotent. */
		async function respondInterestProbe(base, payload, signal) {
			const body = {
				domain: payload.domain,
				response: payload.response,
				request_id: payload.request_id
			};
			if (payload.message !== void 0 && payload.message !== "") body.message = payload.message;
			return requestJson(base, "/api/interest-probes/respond", {
				method: "POST",
				body,
				timeoutMs: 2e4,
				signal
			});
		}
		/** GET /api/avoidance-probes/pending — active speculative avoidances. */
		async function fetchAvoidanceProbes(base, signal) {
			return asItems(await requestJson(base, "/api/avoidance-probes/pending", {
				timeoutMs: 1e4,
				signal
			})).map(toProbe);
		}
		/** POST /api/avoidance-probes/respond — confirm/reject/defer/chat, idempotent. */
		async function respondAvoidanceProbe(base, payload, signal) {
			const body = {
				domain: payload.domain,
				response: payload.response,
				request_id: payload.request_id
			};
			if (payload.message !== void 0 && payload.message !== "") body.message = payload.message;
			return requestJson(base, "/api/avoidance-probes/respond", {
				method: "POST",
				body,
				timeoutMs: 2e4,
				signal
			});
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
				payload: typeof row.payload === "object" && row.payload !== null ? row.payload : void 0
			};
		}
		/** GET /api/chat/turns — durable dialogue history. */
		async function fetchChatTurns(base, session = "dsh", signal) {
			return asItems(await requestJson(base, `/api/chat/turns?session=${encodeURIComponent(session)}&limit=50`, {
				timeoutMs: 1e4,
				signal
			})).map(toChatTurn);
		}
		/** POST /api/chat/turns — start one durable dialogue turn (returns the pending turn). */
		async function startChatTurn(base, message, session = "dsh", replyToTurnId, turnId, signal) {
			const body = {
				session,
				scope: "chat",
				message
			};
			if (replyToTurnId !== void 0 && replyToTurnId !== "") body.reply_to_turn_id = replyToTurnId;
			if (turnId !== void 0 && turnId !== "") body.turn_id = turnId;
			const data = await requestJson(base, "/api/chat/turns", {
				method: "POST",
				body,
				timeoutMs: 2e4,
				signal
			});
			if (typeof data !== "object" || data === null) throw new Error("chat/turns: unexpected response");
			return toChatTurn(data);
		}
		/** GET /api/chat/turns/{turn_id} — poll one durable turn until it settles. */
		async function fetchChatTurn(base, turnId, signal) {
			const data = await requestJson(base, `/api/chat/turns/${encodeURIComponent(turnId)}`, {
				timeoutMs: 15e3,
				signal
			});
			if (typeof data !== "object" || data === null) throw new Error("chat/turns: unexpected response");
			return toChatTurn(data);
		}
		/** GET /api/chat/pending-confirmations — hypotheses/confusions waiting for the user. */
		async function fetchPendingConfirmations(base, signal) {
			const data = await requestJson(base, "/api/chat/pending-confirmations", {
				timeoutMs: 1e4,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			const items = Array.isArray(row.items) ? row.items : [];
			return {
				count: num(row.count),
				items: items.map((item) => ({
					ref: str(item.ref),
					kind: str(item.kind),
					title: str(item.title ?? item.hypothesis),
					confidence: num(item.confidence),
					evidence: Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [],
					status: str(item.status),
					observation: str(item.observation),
					interpretation: str(item.interpretation)
				}))
			};
		}
		/** POST /api/chat/pending-confirmations/{ref}/open — turn a confirmation into a chat turn. */
		async function openPendingConfirmation(base, ref, signal) {
			const data = await requestJson(base, `/api/chat/pending-confirmations/${encodeURIComponent(ref)}/open`, {
				method: "POST",
				body: { session: "dsh" },
				timeoutMs: 2e4,
				signal
			});
			if (typeof data !== "object" || data === null) throw new Error("pending-confirmations/open: unexpected response");
			return toChatTurn(data);
		}
		/** POST /api/chat/cards/{turn_id}/action — confirm/reject/discuss/defer a hypothesis card.
		*  Returns the settlement response (state/verdict are authoritative). */
		async function actOnChatCard(base, turnId, action, signal) {
			return requestJson(base, `/api/chat/cards/${encodeURIComponent(turnId)}/action`, {
				method: "POST",
				body: { action },
				timeoutMs: 2e4,
				signal
			});
		}
		/** GET /api/content-history — one paginated 30-day history category. */
		async function fetchContentHistory(base, category, cursor = "", signal) {
			const params = new URLSearchParams({
				category,
				limit: "12"
			});
			if (cursor !== "") params.set("cursor", cursor);
			const data = await requestJson(base, `/api/content-history?${params.toString()}`, {
				timeoutMs: 15e3,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return {
				items: (Array.isArray(row.items) ? row.items : []).map((item) => ({
					item_key: str(item.item_key),
					media: str(item.media),
					content_id: str(item.content_id),
					content_url: str(item.content_url),
					content_type: str(item.content_type),
					title: str(item.title),
					author_name: str(item.author_name),
					cover_url: coverUrl(item),
					body_text: str(item.body_text),
					recommendation_id: item.recommendation_id === null || item.recommendation_id === void 0 ? null : num(item.recommendation_id),
					occurred_at: str(item.occurred_at),
					context: str(item.context),
					restored: item.restored === true,
					contexts: Array.isArray(item.contexts) ? item.contexts.map((ctx) => ({
						context: str(ctx.context),
						occurred_at: str(ctx.occurred_at),
						restored: ctx.restored === true
					})) : []
				})),
				total: num(row.total),
				hasMore: row.has_more === true,
				nextCursor: str(row.next_cursor),
				retentionDays: num(row.retention_days)
			};
		}
		/** GET /api/saved/{listKind}/status — saved state for one item (toggle display). */
		async function fetchSavedStatus(base, listKind, itemKey, signal) {
			const data = await requestJson(base, `/api/saved/${listKind}/status?item_key=${encodeURIComponent(itemKey)}`, {
				timeoutMs: 8e3,
				signal
			});
			return (typeof data === "object" && data !== null ? data : {}).saved === true;
		}
		/** GET /api/saved/{listKind} — favorite or watch_later memberships plus total. */
		async function fetchSaved(base, listKind, signal) {
			const data = await requestJson(base, `/api/saved/${listKind}`, {
				timeoutMs: 1e4,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return {
				items: asItems(data).map(toSaved),
				total: num(row.total)
			};
		}
		/** POST /api/saved/{listKind} — add one membership. */
		async function saveItem(base, listKind, payload, signal) {
			await requestJson(base, `/api/saved/${listKind}`, {
				method: "POST",
				body: {
					...payload,
					content_type: "article"
				},
				timeoutMs: 1e4,
				signal
			});
		}
		/** POST /api/saved/{listKind}/remove — remove one membership. */
		async function removeSaved(base, listKind, itemKey, signal) {
			await requestJson(base, `/api/saved/${listKind}/remove`, {
				method: "POST",
				body: { item_key: itemKey },
				timeoutMs: 1e4,
				signal
			});
		}
		/** GET /api/runtime-status — backend readiness and counts. */
		async function fetchRuntimeStatus(base, signal) {
			const data = await requestJson(base, "/api/runtime-status", {
				timeoutMs: 8e3,
				signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("运行状态返回格式无效。");
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
				...row
			};
		}
		function parseEffectiveSettings(value) {
			const row = typeof value === "object" && value !== null ? value : {};
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
				retry_max_seconds: num(row.retry_max_seconds)
			};
		}
		function parseNewsSource(value) {
			if (typeof value !== "object" || value === null) return null;
			const row = value;
			const health = typeof row.health === "object" && row.health !== null ? row.health : {};
			const sourceId = firstText(row.source_id, row.id);
			const media = firstText(row.media, row.name, sourceId);
			if (sourceId === "" && media === "") return null;
			return {
				source_id: sourceId || media,
				kind: str(row.kind),
				media,
				technical_provider: firstText(row.technical_provider, row.provider),
				enabled: row.enabled === true,
				custom: row.custom === true,
				credential_configured: row.credential_configured === true,
				status: firstText(row.status, health.status, health.available === true ? "healthy" : ""),
				last_success_at: firstText(row.last_success_at, health.last_success_at),
				error: firstText(row.error, health.error_message, health.error_code)
			};
		}
		function parseNewsRuntime(value) {
			const row = typeof value === "object" && value !== null ? value : {};
			const rawStatus = firstText(row.status, row.last_refresh_status).toLowerCase();
			return {
				status: rawStatus === "" || rawStatus === "offline" ? "offline" : rawStatus === "degraded" || rawStatus === "partial" || rawStatus === "error" || rawStatus === "failed" ? "degraded" : "online",
				last_article_count: num(row.last_article_count),
				last_refresh: str(row.last_refresh),
				last_refresh_status: str(row.last_refresh_status),
				last_schedule_lane: str(row.last_schedule_lane),
				last_schedule_status: str(row.last_schedule_status),
				last_scheduler_check: str(row.last_scheduler_check),
				profile_ready: row.profile_ready === true,
				refresh_running: row.refresh_running === true,
				bootstrap_running: row.bootstrap_running === true,
				effective_settings: parseEffectiveSettings(row.effective_settings)
			};
		}
		/** GET /api/news/runtime — real NewsClaw runtime and effective settings. */
		async function fetchNewsRuntime(base, signal) {
			const data = await requestJson(base, "/api/news/runtime", {
				timeoutMs: 1e4,
				signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("新闻运行状态返回格式无效。");
			return parseNewsRuntime(data);
		}
		/** GET /api/news/sources — real source inventory and source health. */
		async function fetchNewsSources(base, signal) {
			const data = await requestJson(base, "/api/news/sources", {
				timeoutMs: 1e4,
				signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("新闻来源返回格式无效。");
			const row = data;
			if (!Array.isArray(row.sources)) throw new Error("新闻来源列表缺失。");
			return {
				sources: row.sources.map(parseNewsSource).filter((item) => item !== null),
				settings: parseEffectiveSettings(row.settings),
				runtime: parseNewsRuntime(row.runtime)
			};
		}
		/** GET /api/health — reachability plus partial-source degradation. */
		async function fetchHealthState(base, signal) {
			try {
				const data = await requestJson(base, "/api/health", {
					timeoutMs: 5e3,
					signal
				});
				if (typeof data !== "object" || data === null) return "degraded";
				const row = data;
				const state = str(row.state || row.status).toLowerCase();
				if (state === "offline") return "offline";
				if (state === "degraded" || state === "partial" || state === "error" || state === "failed" || row.degraded === true || row.ok === false) return "degraded";
				const sources = row.sources ?? row.source_health;
				if ((Array.isArray(sources) ? sources : typeof sources === "object" && sources !== null ? Object.values(sources) : []).some((source) => {
					if (typeof source !== "object" || source === null) return false;
					const sourceState = str(source.state || source.status).toLowerCase();
					return sourceState === "degraded" || sourceState === "offline" || sourceState === "error" || sourceState === "failed";
				})) return "degraded";
				return "online";
			} catch {
				return "offline";
			}
		}
		/** GET /api/profile-summary — the AI profile summary (canonical surface shape). */
		async function fetchProfileSummary(base, opts = {}) {
			const params = new URLSearchParams();
			params.set("limit", String(opts.limit ?? 5));
			if (opts.cursor !== void 0 && opts.cursor !== "") params.set("cursor", opts.cursor);
			const data = await requestJson(base, `/api/profile-summary?${params.toString()}`, {
				timeoutMs: 1e4,
				signal: opts.signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("画像摘要返回格式无效。");
			const row = data;
			const mbti = typeof row.mbti === "object" && row.mbti !== null ? row.mbti : {};
			const toDomain = (raw) => {
				if (typeof raw !== "object" || raw === null) return {
					domain: "",
					weight: 0,
					specifics: []
				};
				const d = raw;
				return {
					domain: str(d.domain),
					weight: num(d.weight),
					specifics: Array.isArray(d.specifics) ? d.specifics.map((s) => ({
						name: str(s.name),
						weight: num(s.weight)
					})) : []
				};
			};
			const toProbe = (raw) => {
				if (typeof raw !== "object" || raw === null) return null;
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
					challenge: p.challenge === true
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
					dimensions: typeof mbti.dimensions === "object" && mbti.dimensions !== null ? mbti.dimensions : void 0
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
					const s = typeof row.style === "object" && row.style !== null ? row.style : {};
					return {
						preferred_duration: str(s.preferred_duration),
						preferred_pace: str(s.preferred_pace),
						quality_sensitivity: num(s.quality_sensitivity),
						humor_preference: num(s.humor_preference),
						depth_preference: num(s.depth_preference)
					};
				})(),
				context: (() => {
					const c = typeof row.context === "object" && row.context !== null ? row.context : {};
					return {
						weekday_patterns: str(c.weekday_patterns),
						weekend_patterns: str(c.weekend_patterns),
						time_of_day_patterns: str(c.time_of_day_patterns),
						session_type: str(c.session_type)
					};
				})(),
				speculative_interests: Array.isArray(row.speculative_interests) ? row.speculative_interests.map(toProbe).filter((p) => p !== null) : [],
				speculative_avoidances: Array.isArray(row.speculative_avoidances) ? row.speculative_avoidances.map(toProbe).filter((p) => p !== null) : [],
				recent_cognition_updates: Array.isArray(row.recent_cognition_updates) ? row.recent_cognition_updates.map((c) => ({
					summary: str(c.summary),
					context_line: str(c.context_line),
					impact: str(c.impact),
					reasoning: str(c.reasoning),
					evidence: str(c.evidence),
					source: str(c.source),
					source_label: str(c.source_label),
					expand_hint: str(c.expand_hint),
					created_at: str(c.created_at)
				})) : [],
				has_more_cognition_updates: row.has_more_cognition_updates === true,
				next_cognition_cursor: str(row.next_cognition_cursor),
				overrides: typeof row.overrides === "object" && row.overrides !== null ? row.overrides : {},
				active_insights: Array.isArray(row.active_insights) ? row.active_insights.map((i) => ({
					hypothesis: str(i.hypothesis),
					evidence: Array.isArray(i.evidence) ? i.evidence.map(String) : [],
					confidence: num(i.confidence),
					validated: i.validated === true,
					created_at: str(i.created_at)
				})) : [],
				recent_awareness: Array.isArray(row.recent_awareness) ? row.recent_awareness.map((a) => ({
					date: str(a.date),
					observation: str(a.observation),
					trend: str(a.trend),
					emotion_guess: str(a.emotion_guess)
				})) : []
			};
		}
		/** GET /api/activity-feed — recent activity entries (cursor pagination). */
		async function fetchActivityFeed(base, opts = {}, signal) {
			const params = new URLSearchParams();
			if (opts.limit !== void 0) params.set("limit", String(Math.max(1, Math.min(100, opts.limit))));
			if (opts.before !== void 0 && opts.before !== "") params.set("before", opts.before);
			const qs = params.toString();
			const data = await requestJson(base, `/api/activity-feed${qs !== "" ? `?${qs}` : ""}`, {
				timeoutMs: 1e4,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return {
				items: asItems(data),
				liveSummary: str(row.live_summary),
				headline: str(row.headline),
				hasMore: row.has_more === true,
				nextCursor: str(row.next_cursor)
			};
		}
		/** Generate one stable idempotency key for a UI action (uuid v4). */
		function stableId() {
			const bytes = /* @__PURE__ */ new Uint8Array(16);
			crypto.getRandomValues(bytes);
			bytes[6] = bytes[6] & 15 | 64;
			bytes[8] = bytes[8] & 63 | 128;
			const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
		}
		/** Read boot-autostart state. */
		async function fetchAutostartStatus(base, signal) {
			const data = await requestJson(base, "/api/autostart-status", {
				timeoutMs: 1e4,
				signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("开机启动状态返回格式无效。");
			const row = data;
			if (typeof row.enabled !== "boolean") throw new Error("开机启动状态缺少 enabled。");
			return { enabled: row.enabled };
		}
		/** Apply boot-autostart on/off. */
		async function applyAutostart(base, enabled, signal) {
			const data = await requestJson(base, "/api/autostart/apply", {
				method: "POST",
				timeoutMs: 15e3,
				signal,
				headers: { "X-NewsClaw-Auth": "1" },
				body: { enabled: Boolean(enabled) }
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return row.ok === true || row.enabled === enabled;
		}
		/** Read the NewsClaw-only first setup status; this endpoint never rebuilds a ready profile. */
		async function fetchNewsBootstrapStatus(base, signal) {
			const data = await requestJson(base, "/api/news/bootstrap/status", {
				timeoutMs: 1e4,
				signal
			});
			if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("首次设置状态返回格式无效。");
			const row = data;
			return {
				status: firstText(row.status, row.state, "not_started"),
				running: row.running === true,
				profile_ready: row.profile_ready === true,
				detail: firstText(row.detail, row.error)
			};
		}
		function decodeWebMonitor(value) {
			const row = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
			return {
				monitor_id: str(row.monitor_id),
				event_id: str(row.event_id),
				label: str(row.label),
				display_url: firstText(row.display_url, row.canonical_url),
				content_kind: firstText(row.content_kind, "auto"),
				status: firstText(row.status, "unknown"),
				current_version: num(row.current_version),
				change_count: num(row.change_count),
				unread_count: num(row.unread_count),
				has_baseline: row.has_baseline === true,
				last_success_at: str(row.last_success_at),
				next_check_at: str(row.next_check_at),
				last_error: str(row.last_error)
			};
		}
		/** Read the same durable monitor ledger used by the desktop Web UI and Agent tools. */
		async function fetchWebMonitors(base, signal) {
			return asItems(await requestJson(base, "/api/news/monitors", {
				timeoutMs: 12e3,
				signal
			})).map(decodeWebMonitor).filter((item) => item.monitor_id !== "");
		}
		/** Add a monitor and wait for its first baseline to be established. */
		async function createWebMonitor(base, input, signal) {
			const data = await requestJson(base, "/api/news/monitors", {
				method: "POST",
				timeoutMs: 12e4,
				signal,
				body: {
					url: input.url,
					kind: "auto",
					label: input.label ?? "",
					focus: input.focus ?? "",
					interval_minutes: input.intervalMinutes ?? 1440,
					request_id: input.requestId ?? stableId()
				}
			});
			const row = typeof data === "object" && data !== null ? data : {};
			const item = decodeWebMonitor(row.item);
			if (item.monitor_id === "") throw new Error("网页监控创建成功，但返回记录无效。");
			return {
				item,
				initialCheckStatus: str((typeof row.check === "object" && row.check !== null && !Array.isArray(row.check) ? row.check : {}).status)
			};
		}
		async function checkWebMonitor(base, monitorId, requestId = stableId(), signal) {
			const data = await requestJson(base, `/api/news/monitors/${encodeURIComponent(monitorId)}/check`, {
				method: "POST",
				timeoutMs: 12e4,
				signal,
				body: { request_id: requestId }
			});
			const row = typeof data === "object" && data !== null ? data : {};
			const check = typeof row.check === "object" && row.check !== null && !Array.isArray(row.check) ? row.check : {};
			return {
				status: firstText(row.status, check.status),
				error: firstText(row.error, check.error_message),
				retryable: row.retryable === true || check.retryable === true
			};
		}
		async function setWebMonitorState(base, monitorId, action, signal) {
			const id = encodeURIComponent(monitorId);
			if (action === "remove") {
				await requestJson(base, `/api/news/monitors/${id}`, {
					method: "DELETE",
					timeoutMs: 12e3,
					signal
				});
				return;
			}
			await requestJson(base, `/api/news/monitors/${id}/${action}`, {
				method: "POST",
				timeoutMs: 12e3,
				signal
			});
		}
		async function fetchWebMonitorHistory(base, monitorId, signal) {
			const data = await requestJson(base, `/api/news/monitors/${encodeURIComponent(monitorId)}/history?limit=30`, {
				timeoutMs: 12e3,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			const versions = Array.isArray(row.versions) ? row.versions : [];
			const diffs = Array.isArray(row.diffs) ? row.diffs : [];
			return {
				monitor: decodeWebMonitor(row.monitor),
				versions: versions.map((value) => {
					const item = typeof value === "object" && value !== null ? value : {};
					return {
						snapshot_id: str(item.snapshot_id),
						ordinal: num(item.ordinal),
						title: str(item.title),
						content_kind: str(item.content_kind),
						classification: str(item.classification),
						suppression_reason: str(item.suppression_reason),
						byte_count: num(item.byte_count),
						fetched_at: str(item.fetched_at)
					};
				}),
				diffs: diffs.map((value) => {
					const item = typeof value === "object" && value !== null ? value : {};
					return {
						diff_id: str(item.diff_id),
						change_id: str(item.change_id),
						classification: str(item.classification),
						summary: str(item.summary),
						added: Array.isArray(item.added) ? item.added.map(str).filter(Boolean) : [],
						removed: Array.isArray(item.removed) ? item.removed.map(str).filter(Boolean) : [],
						created_at: str(item.created_at)
					};
				})
			};
		}
		async function fetchWebMonitorNotifications(base, signal) {
			const data = await requestJson(base, "/api/news/monitor-notifications?limit=100", {
				timeoutMs: 1e4,
				signal
			});
			return {
				unreadCount: num((typeof data === "object" && data !== null ? data : {}).unread_count),
				items: asItems(data).map((item) => ({
					delivery_id: str(item.delivery_id),
					monitor_id: str(item.monitor_id),
					event_id: str(item.event_id),
					change_id: str(item.change_id),
					kind: str(item.kind),
					title: str(item.title),
					body: str(item.body),
					label: str(item.label),
					display_url: str(item.display_url),
					created_at: str(item.created_at),
					read_at: str(item.read_at),
					dismissed_at: str(item.dismissed_at)
				})).filter((item) => item.delivery_id !== "")
			};
		}
		async function actOnWebMonitorNotification(base, deliveryId, action, requestId, signal) {
			await requestJson(base, `/api/news/monitor-notifications/${encodeURIComponent(deliveryId)}`, {
				method: "POST",
				timeoutMs: 1e4,
				signal,
				body: {
					action,
					request_id: requestId
				}
			});
		}
		//#endregion
		//#region lib/types/client/store.js
		/**
		* Framework-free state for the NewsClaw panel column. The panel is
		* DOM-mounted outside any DSH slot (the official layout has no `aside`), so
		* its open/closed state and width live here — a minimal subscribe/getSnapshot/
		* update primitive — instead of the layout service. Width and open state
		* persist across reloads.
		* @module @newsclaw/dsh-plugin
		*/
		/** Create a state handle with an immutable snapshot (new object per update). */
		function createState(initial) {
			let state = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => state,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				update(fn) {
					const next = fn(state);
					if (next === state) return;
					state = next;
					for (const listener of listeners) listener();
				}
			};
		}
		/** localStorage key for the persisted open/closed preference. */
		const KEY_PANEL_OPEN = "newsclaw:panel-open";
		/** localStorage key for the persisted panel width. */
		const KEY_PANEL_WIDTH = "newsclaw:panel-width";
		/** Read the persisted open preference (default: open). */
		function readPanelOpen() {
			try {
				return localStorage.getItem(KEY_PANEL_OPEN) !== "closed";
			} catch {
				return true;
			}
		}
		/** Persist the open preference. */
		function persistPanelOpen(open) {
			try {
				localStorage.setItem(KEY_PANEL_OPEN, open ? "open" : "closed");
			} catch {}
		}
		/** Read the persisted panel width (clamped to the contract, default otherwise). */
		function readPanelWidth() {
			try {
				const raw = localStorage.getItem(KEY_PANEL_WIDTH);
				if (raw !== null && raw !== "") {
					const n = Number(raw);
					if (Number.isFinite(n)) return Math.min(560, Math.max(280, n));
				}
			} catch {}
			return 380;
		}
		/** Persist the panel width. */
		function persistPanelWidth(width) {
			try {
				localStorage.setItem(KEY_PANEL_WIDTH, String(Math.round(width)));
			} catch {}
		}
		/** Create the panel layout store. */
		function createPanelLayoutStore() {
			return createState({
				open: readPanelOpen(),
				width: readPanelWidth()
			});
		}
		//#endregion
		//#region lib/types/client/drag.js
		/**
		* Framework-free pointer-drag machinery for the panel width handle. One
		* pointer-down handler owns capture, a rAF-flushed move loop, every end path
		* (up / cancel / blur / lost buttons), and the drag styles. Pure DOM — no
		* React — mirroring dsh-aionui-panel's drag core.
		* @module @newsclaw/dsh-plugin
		*/
		/** Whether a pointer event is the primary (left) button or touch. */
		function isPrimaryPointer(event) {
			return event.pointerType === "touch" || event.button === 0;
		}
		/**
		* Handle one pointer-down: wire window listeners, run the rAF loop, and end on
		* any termination path.
		* @param event - the raw pointerdown event.
		* @param el - the handle element.
		* @param opts - drag behavior.
		* @returns a disposer (idempotent; also called internally on end).
		*/
		function handlePointerDragStart(event, el, opts) {
			if (!isPrimaryPointer(event)) return () => {};
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = opts.getStartWidth();
			const reverse = opts.reverse;
			event.pointerId;
			let rafId = null;
			let pending = null;
			let latest = startWidth;
			let dragging = true;
			let cleaned = false;
			const previousUserSelect = document.body.style.userSelect;
			const previousCursor = document.body.style.cursor;
			opts.onDragStateChange(true);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
			const flush = () => {
				if (pending === null) return;
				latest = pending;
				opts.onFrame(pending);
			};
			const computeWidth = (clientX) => {
				const deltaX = reverse ? startX - clientX : clientX - startX;
				return opts.compute(startWidth, deltaX);
			};
			const cleanup = () => {
				if (cleaned) return;
				cleaned = true;
				document.body.style.userSelect = previousUserSelect;
				document.body.style.cursor = previousCursor;
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onCancel);
				window.removeEventListener("blur", onBlur);
			};
			const finish = (e) => {
				if (!dragging) return;
				dragging = false;
				if (rafId !== null) {
					cancelAnimationFrame(rafId);
					rafId = null;
				}
				flush();
				let finalWidth = latest;
				if (e !== void 0 && "clientX" in e && typeof e.clientX === "number") finalWidth = computeWidth(e.clientX);
				opts.onDragStateChange(false);
				opts.onEnd(finalWidth);
				cleanup();
			};
			const onMove = (e) => {
				if (!dragging) return;
				if (e.buttons === 0) {
					finish(e);
					return;
				}
				pending = computeWidth(e.clientX);
				if (rafId === null) rafId = requestAnimationFrame(() => {
					rafId = null;
					flush();
				});
			};
			const onUp = (e) => finish(e);
			const onCancel = (e) => finish(e);
			const onBlur = () => finish();
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onCancel);
			window.addEventListener("blur", onBlur);
			return cleanup;
		}
		//#endregion
		//#region lib/types/client/layout.js
		/** The column element marker (mount.tsx targets it). */
		const PANEL_COL_SELECTOR = "[data-newsclaw-panel-col]";
		/** Parse an inline grid-template-columns string into its tracks (paren-safe). */
		function parseGridTracks(input) {
			const tracks = [];
			let depth = 0;
			let current = "";
			for (const char of input) {
				if (char === "(") depth += 1;
				if (char === ")") depth = Math.max(0, depth - 1);
				if (char === " " && depth === 0) {
					if (current !== "") {
						tracks.push(current);
						current = "";
					}
					continue;
				}
				current += char;
			}
			if (current !== "") tracks.push(current);
			return tracks;
		}
		/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
		function trackPx(track) {
			const match = /^(-?[\d.]+)px$/.exec(track.trim());
			return match === null ? 0 : Number(match[1]);
		}
		/** Locate the frame grid the panel column appends into. */
		function findFrame() {
			return document.querySelector("[class*=\"sidebarCol\"]")?.parentElement ?? null;
		}
		/** The layout controller: frame sync, implicit trailing column, toggle. */
		var PanelLayoutController = class {
			store;
			frame = null;
			column = null;
			handle = null;
			styleObserver = null;
			sizeObserver = null;
			waitObserver = null;
			shellTracks = [];
			frameWidth = 0;
			disposers = [];
			constructor(store) {
				this.store = store;
			}
			/** Start watching for the frame and attach once it appears. */
			mount() {
				const tryAttach = () => {
					if (this.frame !== null) return;
					const frame = findFrame();
					if (frame === null) return;
					this.attach(frame);
				};
				this.waitObserver = new MutationObserver(() => {
					tryAttach();
				});
				this.waitObserver.observe(document.body, {
					childList: true,
					subtree: true
				});
				tryAttach();
			}
			/** Attach to the frame: column, observers, store subscription. */
			attach(frame) {
				this.waitObserver?.disconnect();
				this.waitObserver = null;
				this.frame = frame;
				const column = document.createElement("div");
				column.dataset.newsclawPanelCol = "";
				column.style.minWidth = "0";
				column.style.overflow = "hidden";
				column.style.display = "flex";
				column.style.flexDirection = "column";
				column.style.gridRow = "1";
				column.style.visibility = "hidden";
				frame.appendChild(column);
				this.column = column;
				const handle = this.createHandle();
				frame.appendChild(handle);
				this.handle = handle;
				this.styleObserver = new MutationObserver(() => {
					this.syncGrid();
				});
				this.styleObserver.observe(frame, {
					attributes: true,
					attributeFilter: ["style"]
				});
				this.sizeObserver = new ResizeObserver(() => {
					this.measure();
					this.applyGrid();
				});
				this.sizeObserver.observe(frame);
				this.disposers.push(this.store.subscribe(() => {
					this.applyGrid();
				}));
				const initial = frame.style.gridTemplateColumns;
				if (initial !== "") {
					const tracks = parseGridTracks(initial);
					if (tracks.length >= 2) this.shellTracks = tracks;
				}
				this.measure();
				this.applyGrid();
			}
			/** Size/place the implicit trailing column and toggle its visibility. */
			applyGrid() {
				if (this.frame === null) return;
				if (this.shellTracks.length < 2) return;
				if (this.column === null) return;
				const state = this.store.getSnapshot();
				const width = state.open ? this.clampWidth(state.width) : 0;
				this.column.style.gridColumnStart = String(this.shellTracks.length + 1);
				this.column.style.width = `${Math.round(width)}px`;
				this.column.style.visibility = width > 0 ? "visible" : "hidden";
				if (this.handle !== null) {
					const frameRect = this.frame.getBoundingClientRect();
					const columnRect = this.column.getBoundingClientRect();
					const left = Math.round(columnRect.left - frameRect.left);
					this.handle.style.left = `${left}px`;
					this.handle.style.display = width > 0 ? "block" : "none";
				}
			}
			/** Create the drag handle and wire its pointer drag. */
			createHandle() {
				const el = document.createElement("div");
				el.className = "newsclaw-panel-handle";
				el.style.position = "absolute";
				el.style.top = "0";
				el.style.bottom = "0";
				el.style.zIndex = "30";
				el.style.width = "8px";
				el.style.marginLeft = "-4px";
				el.style.cursor = "col-resize";
				el.style.display = "none";
				el.addEventListener("pointerdown", (event) => {
					handlePointerDragStart(event, el, {
						reverse: true,
						getStartWidth: () => this.store.getSnapshot().width,
						compute: (start, delta) => this.clampWidth(start + delta),
						onFrame: (width) => {
							this.store.update((prev) => prev.width === width ? prev : {
								...prev,
								width
							});
						},
						onEnd: (width) => {
							this.store.update((prev) => prev.width === width ? prev : {
								...prev,
								width
							});
							persistPanelWidth(width);
							this.applyGrid();
						},
						onDragStateChange: (dragging) => {
							if (this.frame !== null) this.frame.style.transition = dragging ? "none" : "";
						}
					});
				});
				el.addEventListener("dblclick", () => {
					this.store.update((prev) => prev.width === 380 ? prev : {
						...prev,
						width: 380
					});
					persistPanelWidth(380);
					this.applyGrid();
				});
				return el;
			}
			/** Clamp the requested width so the chat area keeps at least MIN_CHAT_PX. */
			clampWidth(requested) {
				const fixed = this.shellTracks.reduce((sum, track, index) => index === 1 ? sum : sum + Math.max(0, trackPx(track)), 0);
				const maxByContainer = Math.max(0, this.frameWidth - fixed) - 400;
				if (maxByContainer < 280) return 0;
				return Math.min(560, maxByContainer, Math.max(280, requested));
			}
			/** Mirror explicit shell/foreign-panel tracks without writing frame style. */
			syncGrid() {
				if (this.frame === null) return;
				const inline = this.frame.style.gridTemplateColumns;
				if (inline === "") return;
				const tracks = parseGridTracks(inline);
				if (tracks.length >= 2) {
					this.shellTracks = tracks;
					this.applyGrid();
				}
			}
			/** Measure the frame width (used by the clamp). */
			measure() {
				if (this.frame === null) return;
				this.frameWidth = this.frame.getBoundingClientRect().width;
			}
			/** Toggle the panel open/closed. */
			toggle() {
				this.setOpen(!this.store.getSnapshot().open);
			}
			/** Open or close the panel (persisted). */
			setOpen(open) {
				this.store.update((prev) => prev.open === open ? prev : {
					...prev,
					open
				});
				persistPanelOpen(open);
				this.applyGrid();
			}
			/** Detach everything (plugin unload). */
			dispose() {
				this.waitObserver?.disconnect();
				this.styleObserver?.disconnect();
				this.sizeObserver?.disconnect();
				for (const dispose of this.disposers) dispose();
				this.column?.remove();
				this.handle?.remove();
				this.frame = null;
				this.column = null;
				this.handle = null;
			}
		};
		//#endregion
		//#region lib/types/client/brandIcon.js
		/**
		* The NewsClaw brand mark — the extension's own icon128.png (pink ring +
		* white paw + sparkles), embedded as a data URI so the panel header shows the
		* same logo the popup shows via ../icons/icon128.png.
		* @module @newsclaw/dsh-plugin
		*/
		const BRAND_ICON = "data:image/png;base64,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";
		//#endregion
		//#region lib/types/client/live.js
		/**
		* Runtime-stream WebSocket client: real-time push events (spotlight candidates,
		* interest/avoidance probes and their outcomes) with automatic reconnect and
		* a small dedupe window so a reconnect burst does not double-fire.
		* @module @newsclaw/dsh-plugin
		*/
		const RECONNECT_BASE_MS = 2e3;
		const RECONNECT_MAX_MS = 3e4;
		const DEDUPE_MS = 500;
		/**
		* Live client: subscribes to `/api/runtime-stream`, reconnects with
		* exponential backoff, and forwards typed events to subscribers.
		*/
		var LiveClient = class {
			#base;
			#socket = null;
			#closed = false;
			#timer = null;
			#listeners = /* @__PURE__ */ new Set();
			#lastSeen = /* @__PURE__ */ new Map();
			#onStatus = null;
			#reconnectDelay = RECONNECT_BASE_MS;
			constructor(base) {
				this.#base = base;
			}
			/** Subscribe to stream events; returns the unsubscriber. */
			onEvent(listener) {
				this.#listeners.add(listener);
				return () => {
					this.#listeners.delete(listener);
				};
			}
			/** Observe connection state changes. */
			onStatusChange(listener) {
				this.#onStatus = listener;
				return () => {
					if (this.#onStatus === listener) this.#onStatus = null;
				};
			}
			/** Connect (idempotent; reconnects if a socket already died). */
			connect() {
				if (this.#closed || this.#socket !== null) return;
				this.#open();
			}
			/** Close permanently (no reconnect). */
			dispose() {
				this.#closed = true;
				if (this.#timer !== null) {
					window.clearTimeout(this.#timer);
					this.#timer = null;
				}
				if (this.#socket !== null) {
					this.#socket.onclose = null;
					this.#socket.onerror = null;
					this.#socket.onmessage = null;
					this.#socket.close();
					this.#socket = null;
				}
			}
			#open() {
				const wsUrl = this.#base.replace(/^http/, "ws") + "/api/runtime-stream";
				let socket;
				try {
					socket = new WebSocket(wsUrl);
				} catch {
					this.#scheduleReconnect();
					return;
				}
				this.#socket = socket;
				const openedAt = Date.now();
				socket.onopen = () => {
					this.#onStatus?.(true);
				};
				socket.onmessage = (msg) => {
					this.#handleMessage(msg.data);
				};
				socket.onclose = () => {
					if (this.#socket === socket) this.#socket = null;
					this.#onStatus?.(false);
					if (Date.now() - openedAt >= 8e3) this.#reconnectDelay = RECONNECT_BASE_MS;
					this.#scheduleReconnect();
				};
				socket.onerror = () => {};
			}
			#scheduleReconnect() {
				if (this.#closed || this.#timer !== null) return;
				const delay = this.#reconnectDelay;
				this.#reconnectDelay = Math.min(RECONNECT_MAX_MS, this.#reconnectDelay * 2);
				this.#timer = window.setTimeout(() => {
					this.#timer = null;
					if (!this.#closed) this.#open();
				}, delay);
			}
			#handleMessage(raw) {
				let data;
				try {
					data = JSON.parse(raw);
				} catch {
					return;
				}
				if (typeof data !== "object" || data === null) return;
				const inner = data.data;
				if (typeof inner !== "object" || inner === null) return;
				const payload = inner;
				const type = typeof payload.type === "string" ? payload.type : "";
				if (type === "" || type === "connected") return;
				const now = Date.now();
				const last = this.#lastSeen.get(type + (typeof payload.article_id === "string" ? payload.article_id : payload.domain ?? ""));
				if (last !== void 0 && now - last < DEDUPE_MS) return;
				this.#lastSeen.set(type + (typeof payload.article_id === "string" ? payload.article_id : payload.domain ?? ""), now);
				const event = {
					type,
					payload
				};
				for (const listener of [...this.#listeners]) try {
					listener(event);
				} catch {}
			}
		};
		//#endregion
		//#region lib/types/client/icons.js
		/** 推荐 sparkle icon — the popup tab bar's 4-point star (single path). */
		function SparkleIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" })
			});
		}
		/** 内容库 folder icon. */
		function LibraryIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [(0, react_jsx_runtime.jsx)("path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3H10l2 2h5.5A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" }), (0, react_jsx_runtime.jsx)("path", { d: "M8 10h8M8 14h6" })]
			});
		}
		/** 画像 user icon. */
		function ProfileIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [(0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "8",
					r: "4"
				}), (0, react_jsx_runtime.jsx)("path", { d: "M4 21a8 8 0 0 1 16 0" })]
			});
		}
		/** 对话 chat icon. */
		function ChatIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" })
			});
		}
		/** 消息 icon — the popup's message-bubble (not a bell). */
		function MessageIcon({ size = 20 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })
			});
		}
		/** 设置 gear icon. */
		function GearIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [(0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "12",
					r: "3"
				}), (0, react_jsx_runtime.jsx)("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })]
			});
		}
		/** 收起 (close panel) chevron icon. */
		function CollapseIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "m9 6 6 6-6 6" })
			});
		}
		/** 关闭 close icon. */
		function CloseIcon({ size = 16 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "M18 6 6 18M6 6l12 12" })
			});
		}
		/** 搜索 icon (probe card type). */
		function SearchIcon({ size = 12 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [(0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "11",
					r: "8"
				}), (0, react_jsx_runtime.jsx)("path", { d: "m21 21-4.3-4.3" })]
			});
		}
		/** 稍后读 clock icon. */
		function ClockIcon({ size = 12 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [(0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "12",
					r: "9"
				}), (0, react_jsx_runtime.jsx)("path", { d: "M12 7.5V12l3.2 1.9" })]
			});
		}
		/** 收藏 star icon. */
		function StarIcon({ size = 12 }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: (0, react_jsx_runtime.jsx)("path", { d: "M12 3.6l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17.1l-5.31 2.8 1.01-5.9L3.41 9.83l5.93-.86z" })
			});
		}
		/** 电脑版 web 入口 icon — the popup's monitor (web) button. */
		function MonitorIcon({ size = 15 }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.9",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					(0, react_jsx_runtime.jsx)("rect", {
						x: "2.5",
						y: "4",
						width: "19",
						height: "13",
						rx: "2"
					}),
					(0, react_jsx_runtime.jsx)("path", { d: "M9 20.5h6" }),
					(0, react_jsx_runtime.jsx)("path", { d: "M12 17v3.5" })
				]
			});
		}
		//#endregion
		//#region \0newsclaw-css:src/client/panel.module.css.mjs
		const css = ".WKhQka_panel{--newsclaw-bg:#fffafc;--newsclaw-sky:#f2f8ff;--newsclaw-surface:#ffffffd6;--newsclaw-surface-strong:#fffffff7;--newsclaw-surface-soft:#ffffffb8;--newsclaw-line:#d9e3f2f2;--newsclaw-line-strong:#f7adca80;--newsclaw-text:#20304a;--newsclaw-text-secondary:#60708c;--newsclaw-text-muted:#8290a8;--newsclaw-brand:#fb7299;--newsclaw-brand-strong:#f65788;--newsclaw-brand-soft:#fb72991f;--newsclaw-sky-blue:#5aa9ff;--newsclaw-sky-soft:#5aa9ff24;--newsclaw-success:#30b980;--newsclaw-danger:#ef7a86;--newsclaw-shadow-lg:0 20px 40px #384c701f;--newsclaw-shadow-sm:0 10px 22px #495d8214;min-width:0;height:100%;color:var(--newsclaw-text);background:radial-gradient(circle at 15% 8%, #fb729929, transparent 30%), radial-gradient(circle at 88% 12%, #5aa9ff2e, transparent 26%), linear-gradient(180deg, var(--newsclaw-bg) 0%, var(--newsclaw-sky) 100%);background-attachment:fixed;flex-direction:column;font-family:Avenir Next,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif;display:flex;position:relative;overflow:hidden}.WKhQka_panel button,.WKhQka_panel input,.WKhQka_panel textarea{font-family:inherit}.WKhQka_header{flex:none;align-items:center;gap:6px;padding:14px 14px 10px;display:flex}.WKhQka_brand{flex:1;align-items:center;gap:9px;min-width:0;display:flex}.WKhQka_brandMark{object-fit:cover;background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);border-radius:10px;flex:none;width:30px;height:30px;display:block;box-shadow:0 8px 16px #fb729940}.WKhQka_brandCopy{flex-direction:column;min-width:0;display:flex}.WKhQka_brandTitle{color:var(--newsclaw-text);letter-spacing:-.02em;white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:800;overflow:hidden}.WKhQka_status{align-items:center;gap:4px;display:flex}.WKhQka_statusDot{background:var(--newsclaw-danger);border-radius:50%;width:6px;height:6px}.WKhQka_statusDot[data-state=online]{background:var(--newsclaw-success)}.WKhQka_statusDot[data-state=degraded]{background:#f59e0b}.WKhQka_statusText{color:var(--newsclaw-text-muted);font-size:10px}.WKhQka_iconButton{width:30px;height:30px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffc2;border:1px solid #e6edf8eb;border-radius:10px;flex:none;justify-content:center;align-items:center;transition:background .15s,transform .15s;display:flex;position:relative}.WKhQka_iconButton:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);transform:translateY(-1px)}.WKhQka_bellBadge{background:var(--newsclaw-brand);color:#fff;min-width:16px;height:16px;box-shadow:0 0 0 2px var(--newsclaw-bg);border-radius:8px;justify-content:center;align-items:center;padding:0 4px;font-size:9px;font-weight:700;display:flex;position:absolute;top:-5px;right:-5px}.WKhQka_settings{border-bottom:1px solid var(--newsclaw-line);flex-direction:column;gap:6px;padding:0 14px 10px;display:flex}.WKhQka_settingsRow{align-items:center;gap:6px;display:flex}.WKhQka_settingsInput{min-width:0;color:var(--newsclaw-text);background:#ffffffd9;border:1px solid #e6edf8eb;border-radius:8px;flex:1;padding:6px 9px;font-size:11px}.WKhQka_hint{color:var(--newsclaw-text-muted);font-size:10.5px;line-height:1.5}.WKhQka_tabBar{flex:none;gap:6px;padding:0 14px 12px;display:flex}.WKhQka_tab{min-width:0;min-height:48px;color:var(--newsclaw-text-secondary);cursor:pointer;background:0 0;border:0;border-radius:16px;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:3px;padding:7px 4px;font-size:10px;font-weight:700;line-height:1.3;transition:background .18s,color .18s,box-shadow .18s,transform .18s;display:flex}.WKhQka_tab:hover{color:var(--newsclaw-text);background:#ffffff85}.WKhQka_tab[data-active=true]{color:var(--newsclaw-brand-strong);background:linear-gradient(#fffffffa,#fff0f6fa);transform:translateY(-1px);box-shadow:0 10px 18px #fb729924}.WKhQka_badge{background:var(--newsclaw-brand);color:#fff;text-align:center;vertical-align:1px;border-radius:8px;min-width:15px;height:15px;margin-left:3px;padding:0 4px;font-size:9px;font-weight:700;line-height:15px;display:inline-block}.WKhQka_body{flex-direction:column;flex:1;gap:12px;min-height:0;padding:2px 14px 20px;display:flex;overflow-y:auto}.WKhQka_body>*{flex-shrink:0}.WKhQka_empty{color:var(--newsclaw-text-muted);text-align:center;padding:26px 10px;font-size:12px;line-height:1.7}.WKhQka_error{color:var(--newsclaw-danger);white-space:pre-wrap;background:#ef7a861a;border:1px solid #ef7a8640;border-radius:10px;padding:8px 10px;font-size:11.5px;line-height:1.5}.WKhQka_toolbar{flex:none;align-items:center;gap:6px;display:flex}.WKhQka_spacer{flex:1}.WKhQka_sectionTitle{color:var(--newsclaw-text);margin:4px 0 2px;font-size:12px;font-weight:800}.WKhQka_recHeader{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffe6,#fafbffe6);border:1px solid #e6edf8eb;border-radius:18px;align-items:flex-start;gap:8px;padding:14px;display:flex}.WKhQka_recHeaderCopy{flex:1;min-width:0}.WKhQka_recHeaderActions{flex-direction:column;align-items:stretch;gap:6px;display:flex}.WKhQka_initPrompt{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffe6,#fafbffe6);border:1px solid #e6edf8eb;border-radius:16px;align-items:center;gap:10px;padding:12px 14px;display:flex}.WKhQka_initPromptCopy{min-width:0;color:var(--newsclaw-text-secondary);flex-direction:column;flex:1;gap:4px;font-size:11px;line-height:1.55;display:flex}.WKhQka_initPromptCopy strong{color:var(--newsclaw-text);font-size:13px}.WKhQka_initPromptStatus{color:var(--newsclaw-text-muted)}.WKhQka_recKicker{letter-spacing:.08em;text-transform:uppercase;color:var(--newsclaw-brand);font-size:9px;font-weight:700}.WKhQka_recHeaderTitle{color:var(--newsclaw-text);letter-spacing:-.02em;margin-top:2px;font-size:16px;font-weight:800;line-height:1.35}.WKhQka_poolChips{flex-direction:column;gap:4px;margin-top:8px;display:flex}.WKhQka_poolChip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:6px;justify-content:space-between;gap:8px;padding:3px 7px;font-size:10px;line-height:1.5;display:flex}.WKhQka_poolChipLabel{color:var(--newsclaw-text-muted);flex:none;font-weight:600}.WKhQka_poolChipValue{text-align:right;word-break:break-word}.WKhQka_spotlightCard{background:linear-gradient(#fffcfefa,#fcf8fffa);border:1px solid #fb729947;border-radius:18px;flex-direction:column;gap:6px;padding:12px;display:flex;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}.WKhQka_spotlightKickerLine{align-items:center;gap:6px;display:flex}.WKhQka_spotlightKicker{color:var(--newsclaw-brand-strong);font-size:12px;font-weight:800}.WKhQka_spotlightCounter{color:var(--newsclaw-text-muted);margin-left:auto;font-size:10px}.WKhQka_spotlightTitle{color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:14px;font-weight:800;line-height:1.4;display:-webkit-box;overflow:hidden}.WKhQka_card{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffeb,#fafbffeb);border:1px solid #e6edf8eb;border-radius:16px;align-items:flex-start;gap:10px;padding:10px;transition:border-color .18s,box-shadow .18s;display:flex}.WKhQka_card:hover{border-color:var(--newsclaw-line-strong);box-shadow:0 14px 26px #fb72991a}.WKhQka_thumb{object-fit:cover;background:linear-gradient(145deg,#fb72991f,#5aa9ff1a);border-radius:10px;flex:none;width:84px;height:58px;display:block}.WKhQka_thumbFallback{width:84px;height:58px;color:var(--newsclaw-text-secondary);background:linear-gradient(145deg,#fb72991f,#5aa9ff1a);border-radius:10px;flex:none;justify-content:center;align-items:center;font-size:16px;font-weight:700;display:flex}.WKhQka_coverWrap{flex:none;position:relative}.WKhQka_coverCorner{color:#fff;background:#20304a9e;border-radius:4px;padding:0 4px;font-size:8px;font-weight:700;line-height:13px;position:absolute;top:4px;left:4px}.WKhQka_cardBody{flex-direction:column;flex:1;align-self:center;gap:3px;min-width:0;display:flex}.WKhQka_cardTitle{min-height:36px;color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:13px;font-weight:800;line-height:1.4;display:-webkit-box;overflow:hidden}.WKhQka_cardMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;align-items:center;gap:6px;font-size:10px;display:flex}.WKhQka_mediaTag{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:4px;padding:0 5px;font-size:9px;font-weight:600;line-height:15px}.WKhQka_badgeRow{flex-wrap:wrap;align-items:center;gap:5px;display:flex}.WKhQka_stateBadge{color:var(--newsclaw-text-muted);background:#f0f6ffe6;border-radius:5px;padding:0 5px;font-size:9px;line-height:15px}.WKhQka_topicBadge{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);border-radius:5px;padding:0 5px;font-size:9px;font-weight:700;line-height:15px}.WKhQka_contextBadge{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:4px;padding:0 5px;font-size:9px;font-weight:600;line-height:15px}.WKhQka_contextBadge[data-kind=restored]{color:var(--newsclaw-success);background:#30b9801f}.WKhQka_contextBadge[data-kind=removed]{color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_stats{color:var(--newsclaw-text-muted);flex-wrap:wrap;gap:8px;font-size:10px;display:flex}.WKhQka_expression{color:var(--newsclaw-text-secondary);-webkit-line-clamp:3;-webkit-box-orient:vertical;font-size:11.5px;line-height:1.6;display:-webkit-box;overflow:hidden}.WKhQka_feedbackStatus{color:var(--newsclaw-text-muted);min-height:13px;font-size:10.5px;line-height:1.4}.WKhQka_cardActions{flex-wrap:wrap;gap:6px;margin-top:3px;display:flex}.WKhQka_actionButton{cursor:pointer;min-height:26px;color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border:0;border-radius:11px;padding:4px 10px;font-size:11px;font-weight:600;line-height:1.2;transition:background .18s,color .18s,box-shadow .18s,transform .18s}.WKhQka_actionButton:hover:not(:disabled){color:var(--newsclaw-text);transform:translateY(-1px)}.WKhQka_actionButton:disabled{cursor:not-allowed;opacity:.6;transform:none}.WKhQka_actionButton[data-primary=true]{background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);color:#fff;font-weight:800;box-shadow:0 8px 14px #fb729938}.WKhQka_actionButton[data-primary=true]:hover:not(:disabled){background:linear-gradient(135deg, var(--newsclaw-brand-strong), #ff7ca7);color:#fff}.WKhQka_actionButton[data-danger=true]:hover:not(:disabled){color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_commentRow{align-items:center;gap:6px;display:flex}.WKhQka_commentInput{min-width:0;color:var(--newsclaw-text);background:#ffffffd9;border:1px solid #e6edf8eb;border-radius:8px;flex:1;padding:4px 8px;font-size:11px}.WKhQka_commentInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}.WKhQka_loadMore{color:var(--newsclaw-text-secondary);cursor:pointer;background:0 0;border:1px dashed #d9e3f2f2;border-radius:10px;padding:7px;font-size:11.5px}.WKhQka_loadMore:hover:not(:disabled){color:var(--newsclaw-text);border-color:var(--newsclaw-sky-blue)}.WKhQka_loadMore:disabled{opacity:.5}.WKhQka_loadingRow{color:var(--newsclaw-text-muted);justify-content:center;align-items:center;gap:8px;padding:10px 0 4px;font-size:11px;font-weight:700;display:flex}.WKhQka_spinner{border:2px solid #fb729938;border-top-color:var(--newsclaw-brand);border-radius:999px;width:14px;height:14px;animation:.8s linear infinite WKhQka_newsclawSpin}@keyframes WKhQka_newsclawSpin{to{transform:rotate(360deg)}}.WKhQka_activityFooter{border-top:1px solid var(--newsclaw-line);padding-top:8px}.WKhQka_activityRow{color:var(--newsclaw-text-secondary);gap:8px;padding:4px 0;font-size:11px;line-height:1.5;display:flex}.WKhQka_activityTime{color:var(--newsclaw-text-muted);flex:none;padding-top:1px;font-size:10px}.WKhQka_subTabs{border:1px solid var(--newsclaw-line);background:#ffffffa8;border-radius:12px;flex:none;gap:4px;padding:4px;display:flex}.WKhQka_subTab{color:var(--newsclaw-text-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:9px;flex:1;padding:6px 4px;font-size:10.5px;font-weight:700;line-height:1.4}.WKhQka_subTab:hover{color:var(--newsclaw-text)}.WKhQka_subTab[data-active=true]{background:var(--newsclaw-surface-strong);color:var(--newsclaw-brand-strong);box-shadow:var(--newsclaw-shadow-sm)}.WKhQka_syncToolbar{flex-direction:column;align-items:flex-start;gap:5px;margin-bottom:10px;display:flex}.WKhQka_syncMessage{color:var(--newsclaw-text-muted);min-height:13px;font-size:10.5px;line-height:1.45}.WKhQka_syncMessage[data-tone=error]{color:var(--newsclaw-danger)}.WKhQka_syncResults{border:1px solid var(--newsclaw-line);background:#fff9;border-radius:12px;flex-direction:column;gap:5px;max-height:140px;margin-bottom:10px;padding:7px 8px;display:flex;overflow-y:auto}.WKhQka_syncLine{min-width:0;color:var(--newsclaw-text-secondary);align-items:center;gap:6px;font-size:10.5px;line-height:1.45;display:flex}.WKhQka_syncLineText{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text);flex:0 auto;font-weight:700;overflow:hidden}.WKhQka_syncLineDetail{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text-muted);flex:1;overflow:hidden}.WKhQka_syncBadgeRow{align-items:center;gap:6px;min-width:0;display:flex}.WKhQka_syncInlineDetail{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text-muted);font-size:10px;overflow:hidden}.WKhQka_syncChip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:999px;flex:none;padding:2px 7px;font-size:9.5px;font-weight:700;line-height:15px}.WKhQka_syncChip[data-tone=success]{color:var(--newsclaw-success);background:#30b9801f}.WKhQka_syncChip[data-tone=warning]{color:#8a6520;background:#ffc10724}.WKhQka_syncChip[data-tone=error]{color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_syncChip[data-tone=info]{color:var(--newsclaw-brand-strong);background:var(--newsclaw-brand-soft)}.WKhQka_savedFeedbackRow{flex-wrap:wrap;gap:5px;margin-top:3px;display:flex}.WKhQka_historyRestoreList{flex-direction:column;gap:5px;margin-top:3px;display:flex}.WKhQka_historyRestoreRow{align-items:center;gap:6px;display:flex}.WKhQka_historyRestoreLabel{color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.WKhQka_turn{flex-direction:column;gap:3px;display:flex}.WKhQka_turnUser,.WKhQka_turnSoul{white-space:pre-wrap;word-break:break-word;border-radius:14px;padding:8px 11px;font-size:12px;line-height:1.6}.WKhQka_turnUser{background:var(--newsclaw-brand-soft);color:var(--newsclaw-text);align-self:flex-end;max-width:92%}.WKhQka_turnSoul{border:1px solid var(--newsclaw-line);color:var(--newsclaw-text);background:#ffffffe6;align-self:flex-start;max-width:92%}.WKhQka_turnStatus{color:var(--newsclaw-text-muted);align-self:flex-end;font-size:10px}.WKhQka_chatInputRow{border-top:1px solid var(--newsclaw-line);flex:none;gap:6px;padding-top:8px;display:flex}.WKhQka_chatInput{min-width:0;color:var(--newsclaw-text);resize:none;background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:12px;flex:1;padding:8px 10px;font-size:12px}.WKhQka_chatInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}.WKhQka_chatSend{background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);color:#fff;cursor:pointer;border:0;border-radius:12px;padding:0 14px;font-size:12px;font-weight:800;box-shadow:0 8px 14px #fb729938}.WKhQka_chatSend:hover:not(:disabled){background:linear-gradient(135deg, var(--newsclaw-brand-strong), #ff7ca7)}.WKhQka_chatSend:disabled{opacity:.6}.WKhQka_confirmPanel{border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:14px;flex:none;overflow:hidden}.WKhQka_confirmToggle{width:100%;color:var(--newsclaw-text);cursor:pointer;text-align:left;background:0 0;border:none;align-items:center;gap:6px;padding:9px 11px;font-size:12px;font-weight:800;display:flex}.WKhQka_confirmToggle:hover{background:var(--newsclaw-brand-soft)}.WKhQka_confirmCount{color:#fff;background:var(--newsclaw-brand);border-radius:8px;margin-left:auto;padding:1px 7px;font-size:10px;font-weight:700}.WKhQka_confirmItem{border-top:1px solid var(--newsclaw-line);flex-direction:column;gap:4px;padding:10px 11px;display:flex}.WKhQka_confirmTitle{color:var(--newsclaw-text);font-size:12px;font-weight:800;line-height:1.5}.WKhQka_cardTurn{border:1px solid var(--newsclaw-line);background:#ffffffe6;border-radius:14px;flex-direction:column;gap:4px;padding:10px 11px;display:flex}.WKhQka_insightEvidence{color:var(--newsclaw-text-secondary);white-space:pre-wrap;font-size:11px;line-height:1.55}.WKhQka_insightNote{color:var(--newsclaw-text-muted);font-size:10.5px}.WKhQka_probeConfidence{color:var(--newsclaw-text-muted);font-size:10px}.WKhQka_portrait{color:var(--newsclaw-text);border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:14px;padding:11px 12px;font-size:12.5px;line-height:1.7}.WKhQka_chipRow{flex-wrap:wrap;gap:5px;display:flex}.WKhQka_chip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:11px;padding:2px 8px;font-size:10.5px;font-weight:600;line-height:1.6}.WKhQka_chip[data-kind=dislike]{color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_interestDomain{margin-bottom:6px}.WKhQka_interestDomainHead{color:var(--newsclaw-text);align-items:center;gap:6px;font-size:12px;font-weight:800;display:flex}.WKhQka_domainWeight{color:var(--newsclaw-text-muted);font-size:10px;font-weight:600}.WKhQka_awarenessRow{color:var(--newsclaw-text-secondary);padding:4px 0;font-size:11px;line-height:1.55}.WKhQka_awarenessDate{color:var(--newsclaw-text-muted);margin-right:6px}.WKhQka_probe{border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:12px;flex-direction:column;gap:4px;padding:10px 11px;display:flex}.WKhQka_probeDomain{color:var(--newsclaw-text);font-size:12px;font-weight:800}.WKhQka_probeReason{color:var(--newsclaw-text-secondary);font-size:11.5px;line-height:1.55}.WKhQka_probeActions{flex-wrap:wrap;gap:6px;margin-top:2px;display:flex}.WKhQka_drawerOverlay{z-index:10;backdrop-filter:blur(2px);background:#20304a47;flex-direction:column;justify-content:flex-start;display:flex;position:absolute;inset:0}.WKhQka_drawerPanel{background:radial-gradient(circle at 15% 4%, #fb729924, transparent 30%), var(--newsclaw-bg);border-radius:18px 18px 0 0;flex-direction:column;flex:1;gap:10px;min-height:0;margin-top:8px;padding:14px 14px 24px;display:flex;overflow-y:auto}.WKhQka_drawerHeader{border-bottom:1px solid var(--newsclaw-line);justify-content:space-between;align-items:center;padding-bottom:10px;display:flex}.WKhQka_drawerTitle{color:var(--newsclaw-text);align-items:center;gap:6px;font-size:15px;font-weight:800;display:flex}.WKhQka_messageCard{background:var(--newsclaw-surface-strong);border:1px solid var(--newsclaw-line);border-radius:14px;flex-direction:column;gap:5px;padding:11px 12px;display:flex}.WKhQka_messageCard[data-tone=interest]{background:linear-gradient(135deg,#fff8e8,#fff0d5);border-color:#dd7f2d47}.WKhQka_messageCard[data-tone=avoidance]{background:linear-gradient(135deg,#eef7ff,#e1effc);border-color:#3b82f647}.WKhQka_messageCard[data-tone=challenge]{background:linear-gradient(135deg,#f7f2ff,#ede9fe);border-color:#7c3aed47}.WKhQka_messageCard[data-tone=spotlight]{background:linear-gradient(135deg,#fff5f8,#ffe9f0);border-color:#fb729952}.WKhQka_messageType{color:var(--newsclaw-text-secondary);align-items:center;gap:5px;font-size:10.5px;font-weight:800;display:flex}.WKhQka_messageCard[data-tone=interest] .WKhQka_messageType{color:#c26a1d}.WKhQka_messageCard[data-tone=avoidance] .WKhQka_messageType{color:#2b6cc4}.WKhQka_messageCard[data-tone=challenge] .WKhQka_messageType{color:#7c3aed}.WKhQka_messageCard[data-tone=spotlight] .WKhQka_messageType{color:var(--newsclaw-brand-strong)}.WKhQka_messagePrompt{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.5}.WKhQka_messageTitle{color:var(--newsclaw-text);font-size:13px;font-weight:800;line-height:1.45}.WKhQka_messageBody{color:#55657f;-webkit-line-clamp:4;-webkit-box-orient:vertical;font-size:11px;line-height:1.55;display:-webkit-box;overflow:hidden}.WKhQka_messageActions{flex-wrap:wrap;gap:6px;margin-top:2px;display:flex}.WKhQka_drawerEmpty{color:var(--newsclaw-text-muted);flex-direction:column;align-items:center;gap:8px;padding:34px 20px;display:flex}.WKhQka_drawerEmptyTitle{font-size:13px;font-weight:700}.WKhQka_drawerEmptySubtitle{opacity:.75;font-size:11px}.WKhQka_recCard{background:linear-gradient(#fffffffa,#fafbfffa);border:1px solid #ebf0f8fa;border-radius:18px;flex-direction:column;gap:9px;padding:10px;transition:border-color .18s,box-shadow .18s;display:flex;box-shadow:inset 0 1px #ffffffd1}.WKhQka_recCard:hover{border-color:var(--newsclaw-line-strong);box-shadow:0 18px 32px #fb729924}.WKhQka_recCover{aspect-ratio:16/9;cursor:pointer;width:100%;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb72991f,#5aa9ff1a),#f6f9fff0;border:0;border-radius:13px;justify-content:center;align-items:center;padding:0;font-size:12px;font-weight:700;line-height:1.5;display:flex;position:relative;overflow:hidden}.WKhQka_recCover img{object-fit:cover;width:100%;height:100%;display:block}.WKhQka_recCoverText{color:var(--newsclaw-text);-webkit-line-clamp:4;-webkit-box-orient:vertical;padding:12px;font-size:12px;line-height:1.6;display:-webkit-box;overflow:hidden}.WKhQka_recCover .WKhQka_coverCorner{top:8px;left:8px}.WKhQka_recBody{flex-direction:column;gap:4px;padding:0 2px;display:flex}.WKhQka_recTitle{color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:15px;font-weight:800;line-height:1.38;display:-webkit-box;overflow:hidden}.WKhQka_spotlightRow{align-items:stretch;gap:10px;display:flex}.WKhQka_spotlightThumb{object-fit:cover;border-radius:12px;flex:none;align-self:center;width:96px;height:96px;box-shadow:inset 0 1px #ffffffb8}.WKhQka_spotlightThumbFallback{box-sizing:border-box;width:96px;height:96px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb729924,#5aa9ff1f);border-radius:12px;flex:none;justify-content:center;align-self:center;align-items:center;padding:8px;font-size:10.5px;font-weight:700;line-height:1.5;display:flex;overflow:hidden}.WKhQka_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729947;border-radius:18px;flex-shrink:0;grid-template-columns:minmax(0,1fr) 40px;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:grid;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}.WKhQka_spotlightRow{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;grid-area:1/1;align-items:center;gap:10px;padding:10px;display:flex}.WKhQka_spotlightThumb{aspect-ratio:16/9;object-fit:cover;background:linear-gradient(#fffffffa,#fff8fcf0),linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:12px;flex:none;width:104px;height:auto;transition:transform .2s,box-shadow .2s;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}.WKhQka_spotlightCard:hover .WKhQka_spotlightThumb{transform:scale(1.02);box-shadow:inset 0 1px #ffffffb8,0 6px 14px #fb729938}.WKhQka_spotlightText{flex-direction:column;flex:1;gap:6px;min-width:0;display:flex}.WKhQka_spotlightKickerLine{flex-wrap:wrap;align-items:center;gap:5px;min-width:0;display:flex}.WKhQka_spotlightKicker{color:var(--newsclaw-brand-strong);letter-spacing:.02em;text-overflow:ellipsis;white-space:nowrap;background:#fb72991a;border-radius:999px;max-width:100%;padding:2px 7px;font-size:9.5px;font-weight:700;overflow:hidden}.WKhQka_spotlightCounter{color:var(--newsclaw-text-muted);white-space:nowrap;background:#0000000a;border-radius:8px;flex:none;padding:1px 6px;font-size:10px;font-weight:600}.WKhQka_spotlightNav:active:not(:disabled){transform:scale(.94)}.WKhQka_spotlightDismiss{color:var(--newsclaw-text-muted);cursor:pointer;background:0 0;border:0;border-left:1px solid #eddbe999;grid-area:1/2;font-size:15px;line-height:1;transition:background .15s,color .15s}.WKhQka_spotlightBody{border-top:1px solid #eddbe999;flex-direction:column;grid-area:2/1/auto/-1;gap:8px;padding:4px 12px 12px;display:flex}.WKhQka_activityFooter{border:1px solid var(--newsclaw-line);backdrop-filter:blur(18px);box-shadow:var(--newsclaw-shadow-sm);background:#ffffffa8;border-radius:14px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}.WKhQka_activityLine{color:var(--newsclaw-text-secondary);font-size:11.5px;line-height:1.5}.WKhQka_footerItem{background:#fffc;border:1px solid #dfe7f3f5;border-radius:12px;flex-direction:column;gap:3px;padding:8px 10px;display:flex}.WKhQka_footerItemMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;align-items:center;gap:7px;font-size:9.5px;font-weight:700;line-height:1.4;display:flex}.WKhQka_footerItemKind{min-height:18px;color:var(--newsclaw-text-secondary);background:#fffffff5;border:1px solid #dfe7f3f5;border-radius:999px;align-items:center;padding:2px 7px;display:inline-flex}.WKhQka_footerItemSummary{color:var(--newsclaw-text-secondary);word-break:break-word;font-size:11px;line-height:1.55}.WKhQka_pinnedFooter{border-top:1px solid var(--newsclaw-line);backdrop-filter:blur(18px);background:#ffffff80;flex:none;padding:9px 14px 12px}.WKhQka_pinnedFooter .WKhQka_activityFooter{box-shadow:none;backdrop-filter:none;background:0 0;border:0;border-radius:0;gap:5px;margin:0;padding:6px 2px 2px}.WKhQka_expression{-webkit-line-clamp:unset;display:block;overflow:visible}.WKhQka_savedToggle{min-width:38px;min-height:26px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#f0f6ffe6;border:0;border-radius:11px;justify-content:center;align-items:center;transition:background .15s,color .15s,transform .15s;display:inline-flex}.WKhQka_savedToggle:hover:not(:disabled){color:var(--newsclaw-text);transform:translateY(-1px)}.WKhQka_savedToggle:disabled{opacity:.6;cursor:wait}.WKhQka_savedToggle[data-pressed=true].WKhQka_watchToggle{color:var(--newsclaw-brand-strong);background:var(--newsclaw-brand-soft)}.WKhQka_savedToggle[data-pressed=true].WKhQka_starToggle{color:#e8a33d;background:#e8a33d1f}.WKhQka_savedToggle[data-pressed=true].WKhQka_starToggle svg{fill:currentColor}.WKhQka_feedbackStatus{color:var(--newsclaw-brand-strong);min-height:15px;margin-top:2px;font-size:11px;line-height:1.5}.WKhQka_feedbackStatus[data-tone=success]{color:var(--newsclaw-success)}.WKhQka_feedbackStatus[data-tone=error]{color:var(--newsclaw-danger)}.WKhQka_commentComposer{flex-direction:column;gap:6px;margin-top:2px;display:flex}.WKhQka_commentComposer textarea{box-sizing:border-box;width:100%;color:var(--newsclaw-text);resize:vertical;background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:10px;padding:8px 9px;font-family:inherit;font-size:11.5px}.WKhQka_commentComposer textarea:focus{border-color:var(--newsclaw-sky-blue);outline:none}.WKhQka_commentComposer .WKhQka_actionButton{align-self:flex-end}.WKhQka_activityFooter{background:linear-gradient(#fffffffa,#f2f6fdf5);border:1px solid #dfe7f3fa;border-radius:18px;flex-direction:column;gap:10px;margin:0;padding:12px 14px;display:flex;box-shadow:0 12px 24px #495d8214}.WKhQka_footerHead{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}.WKhQka_footerCopy{flex-direction:column;flex:auto;gap:6px;min-width:0;display:flex}.WKhQka_footerHint{color:#41506b;min-height:18px;margin:0;padding-left:20px;font-size:12px;font-weight:700;line-height:1.6;position:relative}.WKhQka_footerHint:before{content:\"\";background:var(--newsclaw-sky-blue);border-radius:999px;width:9px;height:9px;position:absolute;top:50%;left:0;transform:translateY(-50%);box-shadow:0 0 0 4px #5aa9ff1f}.WKhQka_footerHeadline{min-height:16px;color:var(--newsclaw-text-muted);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:0;padding-left:20px;font-size:10.5px;font-weight:700;line-height:1.55;display:-webkit-box;position:relative;overflow:hidden}.WKhQka_footerHeadline:before{content:\"\";background:#fb72994d;border-radius:999px;width:9px;height:9px;position:absolute;top:50%;left:0;transform:translateY(-50%);box-shadow:0 0 0 4px #fb729914}.WKhQka_footerToggle{min-height:32px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffdb;border:0;border-radius:999px;flex-shrink:0;padding:7px 12px;font-size:11px;font-weight:800;line-height:1;box-shadow:0 8px 18px #495d8214}.WKhQka_footerToggle:hover{color:var(--newsclaw-text)}.WKhQka_footerHistory{flex-direction:column;gap:8px;max-height:190px;display:flex;overflow-y:auto}.WKhQka_pendingItem{border-top:1px solid var(--newsclaw-line);grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px;display:grid}.WKhQka_pendingCopy{gap:2px;min-width:0;display:grid}.WKhQka_pendingCopy strong{overflow-wrap:anywhere;color:var(--newsclaw-text);font-size:12px;font-weight:800;line-height:1.45}.WKhQka_pendingKind,.WKhQka_pendingConfidence{color:var(--newsclaw-text-secondary);font-size:10.5px;font-weight:700}.WKhQka_pendingOpen{cursor:pointer;border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-brand-soft);min-width:52px;min-height:34px;color:var(--newsclaw-brand-strong);border-radius:999px;padding:6px 12px;font-size:11px;font-weight:800}.WKhQka_pendingOpen:hover:not(:disabled){background:#fb729933}.WKhQka_pendingOpen:disabled{opacity:.6;cursor:wait}.WKhQka_dialogueCard{box-sizing:border-box;overflow-wrap:anywhere;border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-surface-strong);width:100%;box-shadow:var(--newsclaw-shadow-sm);border-radius:14px;flex-direction:column;gap:5px;padding:12px;display:flex}.WKhQka_dialogueCard[data-card-state=confirmed]{border-color:#30b9808c}.WKhQka_dialogueCard[data-card-state=rejected]{border-color:#ef7a8694}.WKhQka_dialogueCard[data-card-state=deferred]{border-color:#8f9bb09e}.WKhQka_dialogueKicker{color:var(--newsclaw-brand-strong);letter-spacing:.06em;font-size:10.5px;font-weight:800}.WKhQka_dialogueTitle{color:var(--newsclaw-text);font-size:13.5px;font-weight:700;line-height:1.55}.WKhQka_dialogueState{color:var(--newsclaw-text-secondary);font-size:11.5px;font-weight:700}.WKhQka_dialogueEvidence{color:var(--newsclaw-text-secondary);font-size:11.5px}.WKhQka_dialogueEvidence summary{cursor:pointer;width:fit-content;color:var(--newsclaw-text-secondary);align-items:center;font-weight:700;display:flex}.WKhQka_dialogueEvidence ul{gap:5px;margin:3px 0 0 16px;line-height:1.55;display:grid}.WKhQka_dialogueActions{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:6px;display:grid}.WKhQka_dialogueAction{cursor:pointer;border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);min-width:0;min-height:34px;color:var(--newsclaw-text);border-radius:999px;padding:7px;font-size:12px;font-weight:800;transition:background .15s,transform .15s}.WKhQka_dialogueAction:hover:not(:disabled){transform:translateY(-1px)}.WKhQka_dialogueAction:disabled{cursor:default;opacity:.5}.WKhQka_dialogueAction.WKhQka_action_confirm{color:var(--newsclaw-success)}.WKhQka_dialogueAction.WKhQka_action_reject{color:var(--newsclaw-danger)}.WKhQka_dialogueAction.WKhQka_action_discuss{color:var(--newsclaw-brand-strong)}.WKhQka_contextBar{border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-surface-soft);border-radius:12px;flex-direction:column;flex:none;gap:4px;min-width:0;padding:9px 11px;display:flex}.WKhQka_contextBarHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_contextLabel{letter-spacing:.04em;color:var(--newsclaw-brand-strong);font-size:10px;font-weight:800}.WKhQka_contextTitle{color:var(--newsclaw-text);overflow-wrap:anywhere;font-size:12.5px;font-weight:800;line-height:1.45}.WKhQka_contextObservation{color:var(--newsclaw-text-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:1.55;display:-webkit-box;overflow:hidden}.WKhQka_contextInterpretation{color:#2b6cc4;font-size:10.5px;font-weight:600;line-height:1.5}.WKhQka_contextClear{color:var(--newsclaw-text-secondary);cursor:pointer;background:#fffc;border:0;border-radius:999px;flex:none;padding:4px 10px;font-size:10.5px;font-weight:700}.WKhQka_contextClear:hover{color:var(--newsclaw-text)}.WKhQka_replyQuote{border-left:3px solid var(--newsclaw-brand);background:var(--newsclaw-brand-soft);border-radius:8px;flex-direction:column;gap:1px;min-width:0;padding:6px 9px;display:flex}.WKhQka_replyQuote span{color:var(--newsclaw-brand-strong);letter-spacing:.04em;font-size:9.5px;font-weight:800}.WKhQka_replyQuote strong{color:var(--newsclaw-text-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.4;overflow:hidden}.WKhQka_viewIntro{padding:2px 4px 0}.WKhQka_viewKicker{letter-spacing:.08em;text-transform:uppercase;color:var(--newsclaw-brand);font-size:9px;font-weight:700}.WKhQka_viewIntro h2{color:var(--newsclaw-text);letter-spacing:-.02em;margin:2px 0 0;font-size:15px;font-weight:800;line-height:1.35}.WKhQka_viewIntro p{color:var(--newsclaw-text-secondary);margin:3px 0 0;font-size:11px;line-height:1.6}.WKhQka_profileCard{flex-direction:column;gap:10px;display:flex}.WKhQka_profileSummary{background:#fcfafbf5;border:1px solid #e4dce8b3;border-radius:16px;padding:14px 16px}.WKhQka_profilePortraitP{color:var(--newsclaw-text);text-indent:1.6em;margin:0;font-size:12.5px;line-height:1.85}.WKhQka_profilePortraitP:first-child{text-indent:0}.WKhQka_profileLayer{text-transform:uppercase;letter-spacing:.05em;color:var(--newsclaw-text-muted);border-bottom:1px solid #e7eef899;margin-top:10px;margin-bottom:2px;padding:5px 0;font-size:9.5px;font-weight:700}.WKhQka_profileGroup{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:16px;flex-direction:column;gap:8px;padding:12px 14px;display:flex}.WKhQka_profileGroup h3{color:var(--newsclaw-text);margin:0;font-size:12px;font-weight:800;line-height:1.4}.WKhQka_cognitionCard{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:14px;padding:8px 10px}.WKhQka_cognitionToggle{text-align:left;cursor:pointer;width:100%;color:var(--newsclaw-text);background:0 0;border:0;flex-direction:column;gap:3px;padding:0;display:flex}.WKhQka_cognitionToggle:disabled{cursor:default}.WKhQka_cognitionSummary{font-size:11.5px;font-weight:700;line-height:1.5}.WKhQka_cognitionContext{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.45}.WKhQka_cognitionMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;gap:6px;font-size:9.5px;display:flex}.WKhQka_cognitionSource{color:var(--newsclaw-brand-strong)}.WKhQka_cognitionDetails{border-top:1px dashed #d9e3f2f2;flex-direction:column;gap:5px;margin-top:7px;padding-top:7px;display:flex}.WKhQka_cognitionDetail{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.55}.WKhQka_cognitionDetailLabel{color:var(--newsclaw-text);margin-right:5px;font-weight:800}.WKhQka_profilePhaseCopy{color:var(--newsclaw-text-secondary);margin:0;font-size:12px;line-height:1.7}.WKhQka_chip[data-tone=brand]{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}.WKhQka_chip[data-tone=success]{color:var(--newsclaw-success);background:#30b9801f}.WKhQka_chip[data-tone=danger]{color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_chipWeight{opacity:.75;margin-left:3px;font-size:9px}.WKhQka_mbtiContainer{flex-direction:column;gap:8px;display:flex}.WKhQka_mbtiTypeRow{align-items:baseline;gap:8px;display:flex}.WKhQka_mbtiTypeLabel{color:var(--newsclaw-brand-strong);letter-spacing:.02em;font-size:18px;font-weight:800}.WKhQka_mbtiConfidence{color:var(--newsclaw-text-muted);background:#e7eef8f5;border-radius:999px;padding:2px 8px;font-size:9.5px;font-weight:600}.WKhQka_mbtiDimensions{flex-direction:column;gap:6px;display:flex}.WKhQka_mbtiDimRow{align-items:center;gap:8px;font-size:10.5px;display:flex}.WKhQka_mbtiDimPole{text-align:center;width:20px;color:var(--newsclaw-brand-strong);font-weight:700}.WKhQka_mbtiDimBar{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}.WKhQka_mbtiDimBarFill{background:linear-gradient(90deg,#f7828e,#c7698f);border-radius:3px;height:100%}.WKhQka_mbtiDimPct{text-align:right;width:32px;color:var(--newsclaw-text-muted);font-size:9.5px}.WKhQka_interestTree{flex-direction:column;gap:8px;display:flex}.WKhQka_interestTreeLabel{font-size:11.5px;font-weight:700}.WKhQka_interestTreeLabel[data-tone=sky]{color:var(--newsclaw-sky-blue)}.WKhQka_interestTreeLabel[data-tone=danger]{color:var(--newsclaw-danger)}.WKhQka_interestDomain{flex-direction:column;gap:5px;display:flex}.WKhQka_interestDomainHeader{align-items:center;gap:6px;display:flex}.WKhQka_interestDomainName{color:var(--newsclaw-text);font-size:12px;font-weight:800}.WKhQka_interestDomainWeight{color:var(--newsclaw-text-muted);background:#e7eef8f5;border-radius:999px;padding:1px 7px;font-size:9.5px;font-weight:600}.WKhQka_barRow{align-items:center;gap:8px;font-size:11px;display:flex}.WKhQka_barLabel{min-width:64px;color:var(--newsclaw-text-secondary)}.WKhQka_barTrack{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}.WKhQka_barFill{background:linear-gradient(90deg,#397fcb,#5e9fd9);border-radius:3px;height:100%}.WKhQka_barPct{text-align:right;width:34px;color:var(--newsclaw-text-muted);font-size:9.5px}.WKhQka_contextRow{gap:8px;font-size:11px;display:flex}.WKhQka_contextLabel{color:var(--newsclaw-text-secondary);flex:none;min-width:44px}.WKhQka_contextValue{color:var(--newsclaw-text)}.WKhQka_probe[data-tone=interest]{background:linear-gradient(135deg,#fff8e8,#fff0d5);border-color:#dd7f2d47}.WKhQka_probe[data-tone=avoidance]{background:linear-gradient(135deg,#eef7ff,#e1effc);border-color:#3b82f647}.WKhQka_probeHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_insightCard{border:1px solid var(--newsclaw-line);background:#fffffff0;border-radius:14px;flex-direction:column;gap:7px;padding:12px 14px;display:flex}.WKhQka_insightCard[data-validated]{border-color:#30b98080}.WKhQka_insightHead{align-items:flex-start;gap:6px;display:flex}.WKhQka_insightTitle{color:var(--newsclaw-text);flex:1;font-size:12px;font-weight:800;line-height:1.5}.WKhQka_insightValidated{color:var(--newsclaw-success);background:#30b9801f;border-radius:999px;flex:none;padding:2px 7px;font-size:9.5px;font-weight:700}.WKhQka_insightConfidenceRow{align-items:center;gap:8px;display:flex}.WKhQka_insightConfidenceBar{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}.WKhQka_insightConfidenceFill{background:linear-gradient(90deg,#f7828e,#c7698f);border-radius:3px;height:100%}.WKhQka_insightConfidenceLabel{color:var(--newsclaw-text-muted);text-align:right;width:32px;font-size:9.5px}.WKhQka_insightEvidenceList{color:var(--newsclaw-text-secondary);gap:4px;margin:0;padding-left:16px;font-size:11px;line-height:1.55;display:grid}.WKhQka_awarenessList{flex-direction:column;gap:8px;display:flex}.WKhQka_awarenessItem{background:#fffcf7f7;border:1px solid #f0e6d7e6;border-radius:14px;flex-direction:column;gap:4px;padding:10px 13px;display:flex}.WKhQka_awarenessHeader{align-items:center;gap:8px;display:flex}.WKhQka_awarenessItemDate{color:var(--newsclaw-text-muted);white-space:nowrap;font-size:10px}.WKhQka_awarenessEmotion{color:var(--newsclaw-brand);font-size:10px;font-weight:600}.WKhQka_awarenessObservation{color:var(--newsclaw-text);font-size:11.5px;line-height:1.65}.WKhQka_awarenessTrend{color:var(--newsclaw-text-secondary);border-left:2px solid #fb729940;padding-left:8px;font-size:11px;line-height:1.5}.WKhQka_questionCard{box-sizing:border-box;width:100%;box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(135deg,#eef7ff,#e1effc);border:1px solid #3b82f647;border-radius:14px;flex-direction:column;gap:6px;padding:12px;display:flex}.WKhQka_pendingObservation{color:var(--newsclaw-text-secondary);font-size:11px;line-height:1.55}.WKhQka_pendingInterpretation{color:var(--newsclaw-sky-blue);font-size:10.5px;font-weight:600;line-height:1.5}.WKhQka_questionObservation{color:var(--newsclaw-text);background:#ffffffb3;border-radius:8px;padding:6px 9px;font-size:11.5px;line-height:1.6}.WKhQka_questionInterpretation{color:#2b6cc4;font-size:11px;font-weight:600;line-height:1.55}.WKhQka_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729938;border-radius:16px;flex-direction:column;grid-template-columns:none;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}.WKhQka_spotlightKicker{color:var(--newsclaw-brand-strong);letter-spacing:.02em;white-space:nowrap;background:#fb72991a;border-radius:999px;padding:2px 7px;font-size:9.5px;font-weight:700}.WKhQka_spotlightMedia{color:var(--newsclaw-text-muted);white-space:nowrap;background:#0000000d;border-radius:999px;flex:none;padding:2px 6px;font-size:9.5px;font-weight:600}.WKhQka_spotlightCounter{color:var(--newsclaw-text-muted);white-space:nowrap;flex:none;font-size:10px;font-weight:600}.WKhQka_spotlightNav{width:26px;height:26px;color:var(--newsclaw-brand-strong);cursor:pointer;background:#fffc;border:1px solid #fb729938;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;font-size:14px;font-weight:700;line-height:1;transition:background .15s,border-color .15s;display:inline-flex}.WKhQka_spotlightNav:hover:not(:disabled){background:#fb729924;border-color:#fb729973}.WKhQka_spotlightNav:disabled{opacity:.32;cursor:default}.WKhQka_spotlightDismiss{width:26px;height:26px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#0000000a;border:0;border-left-width:medium;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;font-size:15px;line-height:1;transition:background .15s,color .15s;display:inline-flex}.WKhQka_spotlightRow{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;align-items:center;gap:10px;padding:8px 10px 10px;display:flex}.WKhQka_spotlightThumb{aspect-ratio:auto;object-fit:cover;background:linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:10px;flex:none;width:104px;height:58px;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}.WKhQka_spotlightThumbFallback{aspect-ratio:auto;box-sizing:border-box;width:104px;height:58px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:10px;flex:none;justify-content:center;align-items:center;padding:4px;font-size:9px;font-weight:700;line-height:1.4;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffb8}.WKhQka_spotlightText{flex:1;align-items:center;min-width:0;display:flex}.WKhQka_spotlightTitle{min-width:0;color:var(--newsclaw-text);-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;font-size:12.5px;font-weight:700;line-height:1.55;display:-webkit-box;overflow:hidden}.WKhQka_spotlightChevron{width:24px;height:24px;color:var(--newsclaw-text-muted);cursor:pointer;background:#ffffffb3;border:0;border-radius:50%;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}.WKhQka_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729947;border-radius:18px;flex-direction:column;flex-shrink:0;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}.WKhQka_spotlightCard:hover{border-color:#fb729980;box-shadow:inset 0 1px #ffffffd1,0 12px 28px #fb72992e}.WKhQka_spotlightHeader{align-items:center;gap:7px;min-width:0;padding:10px 12px 2px;display:flex}.WKhQka_spotlightMain{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;flex-direction:column;gap:8px;padding:4px 10px 10px;display:flex}.WKhQka_spotlightCover{aspect-ratio:16/9;background:linear-gradient(#fffffffa,#fff8fcf0),linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:14px;width:100%;transition:box-shadow .2s;display:block;position:relative;overflow:hidden;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}.WKhQka_spotlightCard:hover .WKhQka_spotlightCover{box-shadow:inset 0 1px #ffffffb8,0 8px 18px #fb729938}.WKhQka_spotlightHero{object-fit:cover;width:100%;height:100%;transition:transform .35s;display:block}.WKhQka_spotlightCard:hover .WKhQka_spotlightHero{transform:scale(1.03)}.WKhQka_spotlightCover:before{content:\"✨\";width:27px;height:27px;color:var(--newsclaw-brand-strong);text-align:center;pointer-events:none;z-index:2;background:#fffffff0;border-radius:999px;font-size:15px;line-height:27px;position:absolute;top:8px;left:8px;box-shadow:0 2px 8px #fb72994d}.WKhQka_spotlightCoverScrim{pointer-events:none;z-index:1;background:linear-gradient(#0000,#141a2870);height:40%;position:absolute;inset:auto 0 0}.WKhQka_spotlightScorePill{z-index:2;color:#fff;letter-spacing:.01em;background:linear-gradient(135deg,#fb7299f5,#e25885e6);border-radius:999px;padding:3px 10px;font-size:10.5px;font-weight:800;line-height:1.4;position:absolute;bottom:8px;left:8px;box-shadow:0 2px 8px #fb72995c}.WKhQka_spotlightHeroFallback{box-sizing:border-box;width:100%;height:100%;min-height:96px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb729924,#5aa9ff1a);justify-content:center;align-items:center;padding:12px 14px;font-size:11px;font-weight:700;line-height:1.55;display:flex;overflow:hidden}.WKhQka_spotlightCover:has(.WKhQka_spotlightHeroFallback){aspect-ratio:auto}.WKhQka_spotlightTitleWrap{align-items:center;gap:8px;min-width:0;padding:0 2px;display:flex}.WKhQka_spotlightTitle{min-width:0;color:var(--newsclaw-text);-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;flex:1;font-size:13px;font-weight:800;line-height:1.5;display:-webkit-box;overflow:hidden}.WKhQka_spotlightCard[data-expanded=true] .WKhQka_spotlightTitle{-webkit-line-clamp:unset;display:block}.WKhQka_spotlightChevron{width:24px;height:24px;color:var(--newsclaw-text-muted);background:#ffffffb3;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}.WKhQka_spotlightDismiss{color:var(--newsclaw-text-muted);cursor:pointer;background:0 0;border:0;border-left:1px solid #eddbe999;border-radius:0 8px 8px 0;padding:3px 7px;font-size:15px;line-height:1;transition:background .15s,color .15s}.WKhQka_spotlightDismiss:hover:not(:disabled){color:var(--newsclaw-danger);background:#ef7a861f}.WKhQka_spotlightDismiss:disabled{cursor:wait;opacity:.58}.WKhQka_spotlightBody{border-top:1px solid #eddbe999;flex-direction:column;gap:8px;padding:2px 12px 12px;display:flex}.WKhQka_spotlightBody .WKhQka_spotlightReason{margin-top:8px}.WKhQka_spotlightReason{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:10px;padding:8px 10px;font-size:11.5px;line-height:1.6}.WKhQka_spotlightScore{color:var(--newsclaw-brand-strong);font-weight:800}.WKhQka_spotlightActions{flex-wrap:wrap;gap:6px;display:flex}.WKhQka_spotlightActions .WKhQka_actionButton{flex:1;min-width:0;padding:6px 8px;font-size:11.5px}.WKhQka_spotlightComposer{align-items:flex-end;gap:6px;display:flex}.WKhQka_spotlightComposer .WKhQka_chatInput{flex:1}.WKhQka_settingsOverlay{z-index:12;backdrop-filter:blur(2px);background:#20304a47;flex-direction:column;justify-content:flex-start;display:flex;position:absolute;inset:0}.WKhQka_settingsPanel{background:radial-gradient(circle at 15% 4%, #fb72991f, transparent 30%), var(--newsclaw-bg);border-radius:18px 18px 0 0;flex-direction:column;flex:1;min-height:0;margin-top:8px;display:flex}.WKhQka_settingsHeader{border-bottom:1px solid var(--newsclaw-line);flex:none;justify-content:space-between;align-items:center;padding:14px 14px 10px;display:flex}.WKhQka_settingsHeader h2{color:var(--newsclaw-text);letter-spacing:-.02em;margin:0;font-size:15px;font-weight:800}.WKhQka_settingsHeader>div{min-width:0}.WKhQka_settingsHeader p{color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;margin:3px 0 0;font-size:9.5px;overflow:hidden}.WKhQka_settingsBack{width:30px;height:30px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffc2;border:1px solid #e6edf8eb;border-radius:10px;font-size:14px}.WKhQka_settingsBack:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}.WKhQka_settingsTabs{border-bottom:1px solid var(--newsclaw-line);scrollbar-width:none;flex:none;gap:2px;padding:8px 10px 0;display:flex;overflow-x:auto}.WKhQka_settingsTab{color:var(--newsclaw-text-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:8px 8px 0 0;padding:6px 10px 8px;font-size:11.5px;font-weight:700}.WKhQka_settingsTab:hover{color:var(--newsclaw-text);background:var(--newsclaw-interactive-bg-hover,#ffffff80)}.WKhQka_settingsTab[data-active=true]{color:var(--newsclaw-brand-strong);box-shadow:inset 0 -2px 0 var(--newsclaw-brand);font-weight:800}.WKhQka_settingsBody{flex-direction:column;flex:1;gap:10px;min-height:0;padding:12px 14px 24px;display:flex;overflow-y:auto}.WKhQka_settingsToastBar{color:var(--newsclaw-success);background:#30b9801f;border:1px solid #30b9804d;border-radius:8px;flex:none;padding:7px 10px;font-size:11.5px}.WKhQka_settingsNotice{color:var(--newsclaw-text-secondary);background:#5aa9ff1a;border:1px solid #5aa9ff42;border-radius:10px;flex:none;padding:8px 10px;font-size:11px;line-height:1.55}.WKhQka_settingsSection{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:16px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}.WKhQka_settingsSection h3{color:var(--newsclaw-text);align-items:center;gap:6px;margin:0;font-size:13px;font-weight:800;display:flex}.WKhQka_sectionIcon{font-size:14px}.WKhQka_settingsField{flex-direction:column;gap:4px;display:flex}.WKhQka_settingsField>label{color:var(--newsclaw-text-secondary);font-size:11px;font-weight:700}.WKhQka_settingsFieldRow{color:var(--newsclaw-text);align-items:center;gap:8px;font-size:11.5px;display:flex}.WKhQka_settingsFieldRow input[type=checkbox]{accent-color:var(--newsclaw-brand)}.WKhQka_settingsInput{box-sizing:border-box;width:100%;color:var(--newsclaw-text);background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:8px;padding:6px 9px;font-family:inherit;font-size:11.5px}.WKhQka_settingsInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}.WKhQka_settingsHint{color:var(--newsclaw-text-muted);margin:0;font-size:10.5px;line-height:1.5}.WKhQka_settingsActionRow{justify-content:flex-start;align-items:center;display:flex}.WKhQka_settingsRuntimeHero{background:radial-gradient(circle at 92% 10%,#30b98029,#0000 34%),#fffffff0;border:1px solid #30b9803d;border-radius:16px;justify-content:space-between;align-items:flex-start;gap:10px;padding:13px 14px;display:flex}.WKhQka_settingsRuntimeHero[data-state=degraded]{background:radial-gradient(circle at 92% 10%,#dd7f2d29,#0000 34%),#fffffff0;border-color:#dd7f2d47}.WKhQka_settingsRuntimeHero[data-state=offline]{background:radial-gradient(circle at 92% 10%,#d84a5824,#0000 34%),#fffffff0;border-color:#d84a5842}.WKhQka_settingsRuntimeHero>div{flex-direction:column;gap:4px;min-width:0;display:flex}.WKhQka_settingsRuntimeHero strong{color:var(--newsclaw-text);font-size:13px;line-height:1.35}.WKhQka_settingsRuntimeHero p{color:var(--newsclaw-text-muted);margin:0;font-size:10px}.WKhQka_settingsEyebrow{letter-spacing:.12em;color:var(--newsclaw-success);font-size:8.5px;font-weight:900}.WKhQka_settingsStatusPill{min-height:20px;color:var(--newsclaw-text-muted);background:#8290a81f;border-radius:999px;flex:none;align-items:center;padding:2px 8px;font-size:9.5px;font-weight:800;display:inline-flex}.WKhQka_settingsStatusPill[data-state=online]{color:var(--newsclaw-success);background:#30b98021}.WKhQka_settingsStatusPill[data-state=degraded]{color:#b96923;background:#dd7f2d21}.WKhQka_settingsStatusPill[data-state=offline]{color:var(--newsclaw-danger);background:#d84a581f}.WKhQka_settingsMetricGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}.WKhQka_settingsSection .WKhQka_settingsMetricGrid{margin:-2px 0 1px}.WKhQka_settingsMetric{border:1px solid var(--newsclaw-line);background:#ffffffa8;border-radius:11px;flex-direction:column;gap:2px;min-width:0;padding:9px 10px;display:flex}.WKhQka_settingsMetric>span{color:var(--newsclaw-text-muted);font-size:9.5px}.WKhQka_settingsMetric>strong{color:var(--newsclaw-text);text-overflow:ellipsis;white-space:nowrap;font-size:13px;overflow:hidden}.WKhQka_settingsMetric>small{color:var(--newsclaw-text-muted);font-size:8.5px}.WKhQka_settingsValueList{flex-direction:column;gap:0;display:flex}.WKhQka_settingsValueRow{border-bottom:1px solid var(--newsclaw-line);justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;display:flex}.WKhQka_settingsValueRow:last-child{border-bottom:0}.WKhQka_settingsValueRow>span{color:var(--newsclaw-text-muted);font-size:10.5px}.WKhQka_settingsValueRow>strong{color:var(--newsclaw-text);text-align:right;font-size:10.5px;font-weight:800}.WKhQka_settingsSourceList{flex-direction:column;gap:8px;display:flex}.WKhQka_settingsSourceCard{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:14px;flex-direction:column;gap:8px;padding:11px 12px;display:flex}.WKhQka_settingsSourceHead{justify-content:space-between;align-items:flex-start;gap:8px;display:flex}.WKhQka_settingsSourceHead>div{flex-direction:column;gap:2px;min-width:0;display:flex}.WKhQka_settingsSourceHead strong{color:var(--newsclaw-text);font-size:11.5px;line-height:1.35}.WKhQka_settingsSourceHead span:not(.WKhQka_settingsStatusPill){color:var(--newsclaw-text-muted);font-size:9.5px;line-height:1.4}.WKhQka_settingsSourceMeta{flex-wrap:wrap;gap:5px;display:flex}.WKhQka_settingsSourceMeta span{color:var(--newsclaw-text-secondary);background:#5aa9ff1a;border-radius:999px;padding:3px 7px;font-size:8.5px;font-weight:700}.WKhQka_settingsSourceError{color:var(--newsclaw-danger);word-break:break-word;background:#d84a5814;border-radius:8px;margin:0;padding:6px 8px;font-size:9.5px;line-height:1.45}.WKhQka_settingsConnectionValue{flex-direction:column;gap:4px;display:flex}.WKhQka_settingsConnectionValue>span{color:var(--newsclaw-text-muted);font-size:10px;font-weight:700}.WKhQka_settingsConnectionValue code{overflow-wrap:anywhere;border:1px solid var(--newsclaw-line);max-width:100%;color:var(--newsclaw-text);background:#f4f7fcdb;border-radius:9px;padding:7px 8px;font:10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;display:block}.WKhQka_settingsToggleRow{cursor:pointer;align-items:flex-start;gap:9px;display:flex}.WKhQka_settingsToggleRow>input{accent-color:var(--newsclaw-brand);margin:2px 0 0}.WKhQka_settingsToggleRow>span{flex-direction:column;gap:2px;display:flex}.WKhQka_settingsToggleRow strong{color:var(--newsclaw-text);font-size:11px}.WKhQka_settingsToggleRow small{color:var(--newsclaw-text-muted);font-size:9.5px}.WKhQka_settingsRefreshBar{border:1px solid var(--newsclaw-line);backdrop-filter:blur(14px);box-shadow:var(--newsclaw-shadow-sm);background:#ffffffd6;border-radius:12px;justify-content:space-between;align-items:center;gap:8px;margin-top:2px;padding:9px 10px;display:flex;position:sticky;bottom:0}.WKhQka_settingsRefreshBar>span{min-width:0;color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;overflow:hidden}.WKhQka_settingsActions{align-items:center;gap:8px;display:flex}.WKhQka_settingsToast{color:var(--newsclaw-success);font-size:11px}.WKhQka_settingsInstance{border:1px solid var(--newsclaw-line);background:#ffffffb3;border-radius:12px;flex-direction:column;gap:8px;padding:10px 11px;display:flex}.WKhQka_settingsInstanceHead{color:var(--newsclaw-text);justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:800;display:flex}.WKhQka_settingsSavebar{border:1px solid var(--newsclaw-line);backdrop-filter:blur(14px);box-shadow:var(--newsclaw-shadow-sm);background:#ffffffd1;border-radius:14px;justify-content:flex-end;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;display:flex;position:sticky;bottom:0}.WKhQka_settingsSavebarMsg{color:var(--newsclaw-text-muted);flex:1;font-size:11px}.WKhQka_probeStatus{color:var(--newsclaw-text-muted);word-break:break-word;font-size:11px;line-height:1.5}.WKhQka_probeStatus[data-tone=success]{color:var(--newsclaw-success)}.WKhQka_probeStatus[data-tone=error]{color:var(--newsclaw-danger)}.WKhQka_llmInstanceList{flex-direction:column;gap:8px;display:flex}.WKhQka_llmInstance{border:1px solid var(--newsclaw-line);background:#ffffffb3;border-radius:12px;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;display:flex}.WKhQka_llmInstanceMain{flex-direction:column;gap:3px;min-width:0;display:flex}.WKhQka_llmInstanceHead{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.WKhQka_llmInstanceName{color:var(--newsclaw-text);font-size:12px;font-weight:800}.WKhQka_llmBadge{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);border-radius:999px;padding:3px 7px;font-size:9px;font-weight:800;line-height:1}.WKhQka_llmBadge[data-tone=off]{color:var(--newsclaw-text-muted);background:#8290a829}.WKhQka_llmInstanceDetail{color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;overflow:hidden}.WKhQka_llmInstanceActions{flex:none;gap:6px;display:flex}.WKhQka_chainSection{border-top:1px dashed var(--newsclaw-line);flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;display:flex}.WKhQka_chainHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_chainHead h4{color:var(--newsclaw-text);margin:0;font-size:11.5px;font-weight:800}.WKhQka_chainEditor{flex-direction:column;gap:6px;display:flex}.WKhQka_chainList{flex-direction:column;gap:4px;display:flex}.WKhQka_chainRow{border:1px solid var(--newsclaw-line);background:#ffffff9e;border-radius:10px;align-items:center;gap:4px;padding:5px 8px;display:flex}.WKhQka_chainName{min-width:0;color:var(--newsclaw-text);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;font-weight:700;overflow:hidden}.WKhQka_chainBtn{border:1px solid var(--newsclaw-line);width:22px;height:22px;color:var(--newsclaw-text-muted);cursor:pointer;background:#ffffffb3;border-radius:7px;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}.WKhQka_chainBtn:hover:not(:disabled){color:var(--newsclaw-brand-strong);border-color:var(--newsclaw-brand)}.WKhQka_chainBtn:disabled{opacity:.35;cursor:default}.WKhQka_chainPicker{align-items:center;gap:6px;display:flex}.WKhQka_chainPicker .WKhQka_settingsInput{flex:1;min-width:0}.WKhQka_moduleRoute{border:1px solid var(--newsclaw-line);background:#ffffff9e;border-radius:12px;margin-bottom:8px;padding:8px 10px}.WKhQka_dialogOverlay{backdrop-filter:blur(3px);z-index:60;background:#141a286b;justify-content:center;align-items:flex-start;padding:6vh 14px;display:flex;position:fixed;inset:0}.WKhQka_dialogCard{border:1px solid var(--newsclaw-line);background:var(--newsclaw-bg);width:min(460px,100%);max-height:86vh;box-shadow:var(--newsclaw-shadow-lg);border-radius:16px;flex-direction:column;gap:10px;padding:14px;display:flex;overflow-y:auto}.WKhQka_dialogHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_dialogHead h3{color:var(--newsclaw-text);margin:0;font-size:13px;font-weight:800}.WKhQka_dialogFields{flex-direction:column;gap:8px;display:flex}.WKhQka_dialogActionRow{align-items:center;gap:6px;display:flex}.WKhQka_dialogActionRow .WKhQka_settingsInput{flex:1;min-width:0}.WKhQka_dialogActions{border-top:1px solid var(--newsclaw-line);flex-wrap:wrap;align-items:center;gap:8px;padding-top:10px;display:flex}.WKhQka_dialogActions .WKhQka_probeStatus{flex:100%;order:-1}.WKhQka_updateRow{color:var(--newsclaw-text-secondary);justify-content:space-between;align-items:baseline;gap:10px;padding:4px 0;font-size:11.5px;display:flex}.WKhQka_updateRow strong{color:var(--newsclaw-text);word-break:break-word;text-align:right;font-weight:800}.WKhQka_panel[data-dark=true]{--newsclaw-bg:#15161a;--newsclaw-sky:#0f1115;--newsclaw-surface:#24262ce0;--newsclaw-surface-strong:#282a31f7;--newsclaw-surface-soft:#212329d1;--newsclaw-line:#ffffff14;--newsclaw-line-strong:#fb729959;--newsclaw-text:#e9ebf1;--newsclaw-text-secondary:#b0b9ca;--newsclaw-text-muted:#8c97ad;--newsclaw-brand-soft:#fb729929;--newsclaw-sky-soft:#5aa9ff29;--newsclaw-shadow-lg:0 20px 40px #00000073;--newsclaw-shadow-sm:0 10px 22px #00000059;background:radial-gradient(circle at 15% 8%,#fb72991a,#0000 30%),radial-gradient(circle at 88% 12%,#5aa9ff1a,#0000 26%),linear-gradient(#17181d 0%,#101216 100%)}.WKhQka_panel[data-dark=true] .WKhQka_iconButton,.WKhQka_panel[data-dark=true] .WKhQka_settingsBack{color:var(--newsclaw-text-secondary);background:#ffffff0f;border-color:#ffffff1a}.WKhQka_panel[data-dark=true] .WKhQka_iconButton:hover,.WKhQka_panel[data-dark=true] .WKhQka_settingsBack:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}.WKhQka_panel[data-dark=true] .WKhQka_tab:hover{background:#ffffff0f}.WKhQka_panel[data-dark=true] .WKhQka_tab[data-active=true]{background:linear-gradient(#ffffff1a,#fb729924);box-shadow:0 10px 18px #0000004d}.WKhQka_panel[data-dark=true] .WKhQka_recHeader,.WKhQka_panel[data-dark=true] .WKhQka_card,.WKhQka_panel[data-dark=true] .WKhQka_recCard,.WKhQka_panel[data-dark=true] .WKhQka_profileGroup,.WKhQka_panel[data-dark=true] .WKhQka_settingsSection,.WKhQka_panel[data-dark=true] .WKhQka_settingsRuntimeHero,.WKhQka_panel[data-dark=true] .WKhQka_settingsSourceCard,.WKhQka_panel[data-dark=true] .WKhQka_dialogueCard,.WKhQka_panel[data-dark=true] .WKhQka_insightCard,.WKhQka_panel[data-dark=true] .WKhQka_probe,.WKhQka_panel[data-dark=true] .WKhQka_footerItem{box-shadow:none;background:linear-gradient(#26282feb,#21232aeb);border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_settingsMetric,.WKhQka_panel[data-dark=true] .WKhQka_settingsRefreshBar{box-shadow:none;background:#ffffff0a;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_settingsConnectionValue code{background:#ffffff0a;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_card:hover,.WKhQka_panel[data-dark=true] .WKhQka_recCard:hover{border-color:#fb729973;box-shadow:0 14px 26px #0006}.WKhQka_panel[data-dark=true] .WKhQka_spotlightCard{background:radial-gradient(circle at 100% 0,#fb72991f,#0000 38%),linear-gradient(#2c242cf7,#1e222cf7);border-color:#fb72994d;box-shadow:inset 0 1px #ffffff0d,0 4px 14px #0000004d}.WKhQka_panel[data-dark=true] .WKhQka_spotlightCard:hover{border-color:#fb72998c;box-shadow:inset 0 1px #ffffff0d,0 12px 28px #0006}.WKhQka_panel[data-dark=true] .WKhQka_spotlightKicker,.WKhQka_panel[data-dark=true] .WKhQka_topicBadge,.WKhQka_panel[data-dark=true] .WKhQka_chip[data-tone=brand]{background:#fb729929}.WKhQka_panel[data-dark=true] .WKhQka_spotlightMedia,.WKhQka_panel[data-dark=true] .WKhQka_stateBadge,.WKhQka_panel[data-dark=true] .WKhQka_mediaTag,.WKhQka_panel[data-dark=true] .WKhQka_poolChip,.WKhQka_panel[data-dark=true] .WKhQka_chip,.WKhQka_panel[data-dark=true] .WKhQka_contextBadge{color:var(--newsclaw-text-secondary);background:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_spotlightNav,.WKhQka_panel[data-dark=true] .WKhQka_spotlightChevron,.WKhQka_panel[data-dark=true] .WKhQka_footerToggle,.WKhQka_panel[data-dark=true] .WKhQka_pendingOpen,.WKhQka_panel[data-dark=true] .WKhQka_contextClear{background:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_actionButton{color:var(--newsclaw-text-secondary);background:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_actionButton:hover:not(:disabled){color:var(--newsclaw-text);background:#ffffff1f}.WKhQka_panel[data-dark=true] .WKhQka_savedToggle{color:var(--newsclaw-text-secondary);background:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_settingsInput,.WKhQka_panel[data-dark=true] .WKhQka_commentInput,.WKhQka_panel[data-dark=true] .WKhQka_chatInput,.WKhQka_panel[data-dark=true] .WKhQka_commentComposer textarea{color:var(--newsclaw-text);background:#181a1fe6;border-color:#ffffff1a}.WKhQka_panel[data-dark=true] .WKhQka_turnSoul,.WKhQka_panel[data-dark=true] .WKhQka_questionObservation{background:#ffffff0f;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_turnUser{background:#fb729933}.WKhQka_panel[data-dark=true] .WKhQka_profileSummary{background:#242028f0;border-color:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_awarenessItem{background:#28241ef0;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_questionCard{background:linear-gradient(135deg,#1a2433,#141d2c);border-color:#3b82f659}.WKhQka_panel[data-dark=true] .WKhQka_messageCard[data-tone=interest]{background:linear-gradient(135deg,#2b2418,#241d12);border-color:#dd7f2d66}.WKhQka_panel[data-dark=true] .WKhQka_messageCard[data-tone=avoidance]{background:linear-gradient(135deg,#141f2e,#101a26);border-color:#3b82f666}.WKhQka_panel[data-dark=true] .WKhQka_messageCard[data-tone=challenge]{background:linear-gradient(135deg,#221d33,#1b1728);border-color:#7c3aed66}.WKhQka_panel[data-dark=true] .WKhQka_messageCard[data-tone=spotlight]{background:linear-gradient(135deg,#2e1f26,#261a20);border-color:#fb729966}.WKhQka_panel[data-dark=true] .WKhQka_probe[data-tone=interest]{background:linear-gradient(135deg,#2b2418,#241d12);border-color:#dd7f2d66}.WKhQka_panel[data-dark=true] .WKhQka_probe[data-tone=avoidance]{background:linear-gradient(135deg,#141f2e,#101a26);border-color:#3b82f666}.WKhQka_panel[data-dark=true] .WKhQka_messageBody{color:#b4bece}.WKhQka_panel[data-dark=true] .WKhQka_mbtiDimBar,.WKhQka_panel[data-dark=true] .WKhQka_barTrack,.WKhQka_panel[data-dark=true] .WKhQka_insightConfidenceBar,.WKhQka_panel[data-dark=true] .WKhQka_mbtiConfidence{background:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_drawerPanel,.WKhQka_panel[data-dark=true] .WKhQka_settingsPanel{background:radial-gradient(circle at 15% 4%,#fb729914,#0000 30%),#15161a}.WKhQka_panel[data-dark=true] .WKhQka_settingsInstance{background:#ffffff0a;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_pendingItem{border-top-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_contextBar,.WKhQka_panel[data-dark=true] .WKhQka_activityFooter{background:#212329d9;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_subTabs{background:#ffffff0a;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_subTab[data-active=true]{background:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_spotlightReason{color:var(--newsclaw-text-secondary);background:#ffffff0f}.WKhQka_panel[data-dark=true] .WKhQka_spotlightBody{border-top-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_spotlightChevron{color:var(--newsclaw-text-secondary);background:#ffffff12}.WKhQka_panel[data-dark=true] .WKhQka_spotlightDismiss{border-left-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_footerHint{color:#c3cddd}.WKhQka_panel[data-dark=true] .WKhQka_settingsSavebar,.WKhQka_panel[data-dark=true] .WKhQka_llmInstance,.WKhQka_panel[data-dark=true] .WKhQka_chainRow,.WKhQka_panel[data-dark=true] .WKhQka_moduleRoute{background:#24262ce0;border-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_chainBtn{background:#ffffff0f;border-color:#ffffff1a}.WKhQka_panel[data-dark=true] .WKhQka_dialogCard{background:radial-gradient(circle at 15% 4%,#fb729914,#0000 30%),#15161a;border-color:#ffffff1a}.WKhQka_panel[data-dark=true] .WKhQka_llmBadge{background:#fb729933}.WKhQka_panel[data-dark=true] .WKhQka_actionButton:disabled{opacity:.66;color:#9aa4b8}.WKhQka_panel[data-dark=true] .WKhQka_recCover{background:linear-gradient(145deg,#fb729924,#5aa9ff1f),#1e2028f5}.WKhQka_panel[data-dark=true] .WKhQka_spotlightCover{background:linear-gradient(#282a31f5,#212329f5),linear-gradient(145deg,#fb729929,#5aa9ff1a);border-color:#ffffff24;box-shadow:inset 0 1px #ffffff0f,0 2px 8px #0000004d}.WKhQka_panel[data-dark=true] .WKhQka_spotlightCard:hover .WKhQka_spotlightCover{box-shadow:inset 0 1px #ffffff0f,0 8px 18px #0000006b}.WKhQka_panel[data-dark=true] .WKhQka_spotlightHeroFallback{color:var(--newsclaw-text);background:linear-gradient(145deg,#fb729929,#5aa9ff1f)}.WKhQka_panel[data-dark=true] .WKhQka_pinnedFooter{background:#15161ab3;border-top-color:#ffffff14}.WKhQka_panel[data-dark=true] .WKhQka_pinnedFooter .WKhQka_activityFooter{box-shadow:none;background:0 0;border:0}.WKhQka_panel[data-dark=true] .WKhQka_starButton{background:linear-gradient(#2c242cf7,#fb72991f);border-color:#fb729952}.WKhQka_sidebarButton{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary,#20304a);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:13px;font-weight:600;line-height:22px;display:flex;overflow:hidden}.WKhQka_sidebarButton:hover{background:var(--dsw-alias-interactive-bg-hover,#0000000d)}.WKhQka_sidebarButton[data-active=true]{color:#f65788;background:#fb72991f}.WKhQka_sidebarButton[data-wide=false]{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}.WKhQka_sidebarButtonIcon{object-fit:cover;background:linear-gradient(135deg,#fb7299,#ff8cb0);border-radius:6px;flex:none;width:18px;height:18px;display:block;box-shadow:0 4px 8px #fb729940}.WKhQka_sidebarButtonLabel{white-space:nowrap;overflow:hidden}.newsclaw-panel-handle:after{content:\"\";background:#20304a2e;border-radius:2px;width:2px;height:32px;transition:background .15s;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}.newsclaw-panel-handle:hover:after{background:#fb72998c}.WKhQka_monitoring{gap:10px;display:grid}.WKhQka_monitorIntro{border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);border-radius:12px;gap:3px;padding:10px 12px;display:grid}.WKhQka_monitorIntro strong{font-size:13px}.WKhQka_monitorIntro span,.WKhQka_monitorQuiet,.WKhQka_monitorMeta,.WKhQka_monitorUrl{color:var(--newsclaw-text-muted);font-size:11px;line-height:1.45}.WKhQka_monitorForm{grid-template-columns:minmax(0,1fr) 110px;gap:6px;display:grid}.WKhQka_monitorForm input,.WKhQka_monitorForm button,.WKhQka_monitorActions button{border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);min-width:0;color:var(--newsclaw-text);font:inherit;border-radius:9px}.WKhQka_monitorForm input{outline:none;height:34px;padding:0 9px}.WKhQka_monitorForm input:first-child{grid-column:1/-1}.WKhQka_monitorForm input:focus{border-color:#fb7299b3;box-shadow:0 0 0 2px #fb72991a}.WKhQka_monitorForm button{color:#fff;cursor:pointer;background:#f65788;border-color:#f65788}.WKhQka_monitorForm button:disabled,.WKhQka_monitorActions button:disabled{cursor:not-allowed;opacity:.55}.WKhQka_monitorStats{flex-wrap:wrap;gap:6px;display:flex}.WKhQka_monitorStats button{border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);color:var(--newsclaw-text-muted);font:inherit;cursor:pointer;border-radius:999px;margin-left:auto;padding:3px 9px;font-size:11px}.WKhQka_monitorStats button:disabled{cursor:not-allowed;opacity:.55}.WKhQka_monitorStats span,.WKhQka_monitorState,.WKhQka_monitorMetrics{color:var(--newsclaw-text-muted);background:#20304a0f;border-radius:999px;padding:3px 7px;font-size:10px}.WKhQka_monitorCard{border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);border-left:3px solid #57a66a;border-radius:12px;gap:6px;padding:11px;display:grid}.WKhQka_monitorCard[data-status=paused]{border-left-color:#9ba4b3}.WKhQka_monitorCard[data-status=retry_wait],.WKhQka_monitorCard[data-status=needs_attention]{border-left-color:#d17b35}.WKhQka_monitorTop{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_monitorTitle{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:700;overflow:hidden}.WKhQka_monitorUrl{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.WKhQka_monitorError{color:#a65a22;background:#d17b351a;border-radius:8px;padding:6px 8px;font-size:11px}.WKhQka_monitorActions{flex-wrap:wrap;gap:5px;display:flex}.WKhQka_monitorActions button{cursor:pointer;padding:5px 8px;font-size:11px}.WKhQka_monitorActions button:hover:not(:disabled){color:#f65788;border-color:#f657888c}.WKhQka_monitorHistory{border-top:1px solid var(--newsclaw-line);gap:5px;padding-top:8px;display:grid}.WKhQka_monitorHistoryHead{font-size:11px;font-weight:700}.WKhQka_monitorDiff{color:var(--newsclaw-text);grid-template-columns:minmax(0,1fr) auto;gap:8px;font-size:11px;display:grid}.WKhQka_monitorDiff time{color:var(--newsclaw-text-muted)}.WKhQka_monitorHistoryError{border-top:1px solid var(--newsclaw-line);color:var(--newsclaw-danger);justify-content:space-between;align-items:center;gap:8px;padding-top:8px;font-size:11px;display:flex}.WKhQka_monitorHistoryError button{border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);color:var(--newsclaw-text);font:inherit;cursor:pointer;border-radius:999px;flex:none;padding:4px 8px}.WKhQka_panel[data-dark=true] .WKhQka_monitorIntro,.WKhQka_panel[data-dark=true] .WKhQka_monitorCard,.WKhQka_panel[data-dark=true] .WKhQka_monitorForm input,.WKhQka_panel[data-dark=true] .WKhQka_monitorActions button,.WKhQka_panel[data-dark=true] .WKhQka_monitorStats button,.WKhQka_panel[data-dark=true] .WKhQka_monitorHistoryError button{background:#1e2026eb;border-color:#ffffff17}.WKhQka_panel[data-dark=true] .WKhQka_monitorStats span,.WKhQka_panel[data-dark=true] .WKhQka_monitorState,.WKhQka_panel[data-dark=true] .WKhQka_monitorMetrics{background:#ffffff12}";
		const tagId = "@newsclaw/dsh-plugin/panel.module.css";
		if (typeof document !== "undefined") {
			const existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
			const tag = existing ?? document.createElement("style");
			tag.dataset.plugin = "@newsclaw/dsh-plugin";
			tag.dataset.pluginCss = tagId;
			if (tag.textContent !== css) tag.textContent = css;
			if (existing === null) document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"action_confirm": "WKhQka_action_confirm",
			"action_discuss": "WKhQka_action_discuss",
			"action_reject": "WKhQka_action_reject",
			"actionButton": "WKhQka_actionButton",
			"activityFooter": "WKhQka_activityFooter",
			"activityLine": "WKhQka_activityLine",
			"activityRow": "WKhQka_activityRow",
			"activityTime": "WKhQka_activityTime",
			"awarenessDate": "WKhQka_awarenessDate",
			"awarenessEmotion": "WKhQka_awarenessEmotion",
			"awarenessHeader": "WKhQka_awarenessHeader",
			"awarenessItem": "WKhQka_awarenessItem",
			"awarenessItemDate": "WKhQka_awarenessItemDate",
			"awarenessList": "WKhQka_awarenessList",
			"awarenessObservation": "WKhQka_awarenessObservation",
			"awarenessRow": "WKhQka_awarenessRow",
			"awarenessTrend": "WKhQka_awarenessTrend",
			"badge": "WKhQka_badge",
			"badgeRow": "WKhQka_badgeRow",
			"barFill": "WKhQka_barFill",
			"barLabel": "WKhQka_barLabel",
			"barPct": "WKhQka_barPct",
			"barRow": "WKhQka_barRow",
			"barTrack": "WKhQka_barTrack",
			"bellBadge": "WKhQka_bellBadge",
			"body": "WKhQka_body",
			"brand": "WKhQka_brand",
			"brandCopy": "WKhQka_brandCopy",
			"brandMark": "WKhQka_brandMark",
			"brandTitle": "WKhQka_brandTitle",
			"card": "WKhQka_card",
			"cardActions": "WKhQka_cardActions",
			"cardBody": "WKhQka_cardBody",
			"cardMeta": "WKhQka_cardMeta",
			"cardTitle": "WKhQka_cardTitle",
			"cardTurn": "WKhQka_cardTurn",
			"chainBtn": "WKhQka_chainBtn",
			"chainEditor": "WKhQka_chainEditor",
			"chainHead": "WKhQka_chainHead",
			"chainList": "WKhQka_chainList",
			"chainName": "WKhQka_chainName",
			"chainPicker": "WKhQka_chainPicker",
			"chainRow": "WKhQka_chainRow",
			"chainSection": "WKhQka_chainSection",
			"chatInput": "WKhQka_chatInput",
			"chatInputRow": "WKhQka_chatInputRow",
			"chatSend": "WKhQka_chatSend",
			"chip": "WKhQka_chip",
			"chipRow": "WKhQka_chipRow",
			"chipWeight": "WKhQka_chipWeight",
			"cognitionCard": "WKhQka_cognitionCard",
			"cognitionContext": "WKhQka_cognitionContext",
			"cognitionDetail": "WKhQka_cognitionDetail",
			"cognitionDetailLabel": "WKhQka_cognitionDetailLabel",
			"cognitionDetails": "WKhQka_cognitionDetails",
			"cognitionMeta": "WKhQka_cognitionMeta",
			"cognitionSource": "WKhQka_cognitionSource",
			"cognitionSummary": "WKhQka_cognitionSummary",
			"cognitionToggle": "WKhQka_cognitionToggle",
			"commentComposer": "WKhQka_commentComposer",
			"commentInput": "WKhQka_commentInput",
			"commentRow": "WKhQka_commentRow",
			"confirmCount": "WKhQka_confirmCount",
			"confirmItem": "WKhQka_confirmItem",
			"confirmPanel": "WKhQka_confirmPanel",
			"confirmTitle": "WKhQka_confirmTitle",
			"confirmToggle": "WKhQka_confirmToggle",
			"contextBadge": "WKhQka_contextBadge",
			"contextBar": "WKhQka_contextBar",
			"contextBarHead": "WKhQka_contextBarHead",
			"contextClear": "WKhQka_contextClear",
			"contextInterpretation": "WKhQka_contextInterpretation",
			"contextLabel": "WKhQka_contextLabel",
			"contextObservation": "WKhQka_contextObservation",
			"contextRow": "WKhQka_contextRow",
			"contextTitle": "WKhQka_contextTitle",
			"contextValue": "WKhQka_contextValue",
			"coverCorner": "WKhQka_coverCorner",
			"coverWrap": "WKhQka_coverWrap",
			"dialogActionRow": "WKhQka_dialogActionRow",
			"dialogActions": "WKhQka_dialogActions",
			"dialogCard": "WKhQka_dialogCard",
			"dialogFields": "WKhQka_dialogFields",
			"dialogHead": "WKhQka_dialogHead",
			"dialogOverlay": "WKhQka_dialogOverlay",
			"dialogueAction": "WKhQka_dialogueAction",
			"dialogueActions": "WKhQka_dialogueActions",
			"dialogueCard": "WKhQka_dialogueCard",
			"dialogueEvidence": "WKhQka_dialogueEvidence",
			"dialogueKicker": "WKhQka_dialogueKicker",
			"dialogueState": "WKhQka_dialogueState",
			"dialogueTitle": "WKhQka_dialogueTitle",
			"domainWeight": "WKhQka_domainWeight",
			"drawerEmpty": "WKhQka_drawerEmpty",
			"drawerEmptySubtitle": "WKhQka_drawerEmptySubtitle",
			"drawerEmptyTitle": "WKhQka_drawerEmptyTitle",
			"drawerHeader": "WKhQka_drawerHeader",
			"drawerOverlay": "WKhQka_drawerOverlay",
			"drawerPanel": "WKhQka_drawerPanel",
			"drawerTitle": "WKhQka_drawerTitle",
			"empty": "WKhQka_empty",
			"error": "WKhQka_error",
			"expression": "WKhQka_expression",
			"feedbackStatus": "WKhQka_feedbackStatus",
			"footerCopy": "WKhQka_footerCopy",
			"footerHead": "WKhQka_footerHead",
			"footerHeadline": "WKhQka_footerHeadline",
			"footerHint": "WKhQka_footerHint",
			"footerHistory": "WKhQka_footerHistory",
			"footerItem": "WKhQka_footerItem",
			"footerItemKind": "WKhQka_footerItemKind",
			"footerItemMeta": "WKhQka_footerItemMeta",
			"footerItemSummary": "WKhQka_footerItemSummary",
			"footerToggle": "WKhQka_footerToggle",
			"header": "WKhQka_header",
			"hint": "WKhQka_hint",
			"historyRestoreLabel": "WKhQka_historyRestoreLabel",
			"historyRestoreList": "WKhQka_historyRestoreList",
			"historyRestoreRow": "WKhQka_historyRestoreRow",
			"iconButton": "WKhQka_iconButton",
			"initPrompt": "WKhQka_initPrompt",
			"initPromptCopy": "WKhQka_initPromptCopy",
			"initPromptStatus": "WKhQka_initPromptStatus",
			"insightCard": "WKhQka_insightCard",
			"insightConfidenceBar": "WKhQka_insightConfidenceBar",
			"insightConfidenceFill": "WKhQka_insightConfidenceFill",
			"insightConfidenceLabel": "WKhQka_insightConfidenceLabel",
			"insightConfidenceRow": "WKhQka_insightConfidenceRow",
			"insightEvidence": "WKhQka_insightEvidence",
			"insightEvidenceList": "WKhQka_insightEvidenceList",
			"insightHead": "WKhQka_insightHead",
			"insightNote": "WKhQka_insightNote",
			"insightTitle": "WKhQka_insightTitle",
			"insightValidated": "WKhQka_insightValidated",
			"interestDomain": "WKhQka_interestDomain",
			"interestDomainHead": "WKhQka_interestDomainHead",
			"interestDomainHeader": "WKhQka_interestDomainHeader",
			"interestDomainName": "WKhQka_interestDomainName",
			"interestDomainWeight": "WKhQka_interestDomainWeight",
			"interestTree": "WKhQka_interestTree",
			"interestTreeLabel": "WKhQka_interestTreeLabel",
			"llmBadge": "WKhQka_llmBadge",
			"llmInstance": "WKhQka_llmInstance",
			"llmInstanceActions": "WKhQka_llmInstanceActions",
			"llmInstanceDetail": "WKhQka_llmInstanceDetail",
			"llmInstanceHead": "WKhQka_llmInstanceHead",
			"llmInstanceList": "WKhQka_llmInstanceList",
			"llmInstanceMain": "WKhQka_llmInstanceMain",
			"llmInstanceName": "WKhQka_llmInstanceName",
			"loadingRow": "WKhQka_loadingRow",
			"loadMore": "WKhQka_loadMore",
			"mbtiConfidence": "WKhQka_mbtiConfidence",
			"mbtiContainer": "WKhQka_mbtiContainer",
			"mbtiDimBar": "WKhQka_mbtiDimBar",
			"mbtiDimBarFill": "WKhQka_mbtiDimBarFill",
			"mbtiDimensions": "WKhQka_mbtiDimensions",
			"mbtiDimPct": "WKhQka_mbtiDimPct",
			"mbtiDimPole": "WKhQka_mbtiDimPole",
			"mbtiDimRow": "WKhQka_mbtiDimRow",
			"mbtiTypeLabel": "WKhQka_mbtiTypeLabel",
			"mbtiTypeRow": "WKhQka_mbtiTypeRow",
			"mediaTag": "WKhQka_mediaTag",
			"messageActions": "WKhQka_messageActions",
			"messageBody": "WKhQka_messageBody",
			"messageCard": "WKhQka_messageCard",
			"messagePrompt": "WKhQka_messagePrompt",
			"messageTitle": "WKhQka_messageTitle",
			"messageType": "WKhQka_messageType",
			"moduleRoute": "WKhQka_moduleRoute",
			"monitorActions": "WKhQka_monitorActions",
			"monitorCard": "WKhQka_monitorCard",
			"monitorDiff": "WKhQka_monitorDiff",
			"monitorError": "WKhQka_monitorError",
			"monitorForm": "WKhQka_monitorForm",
			"monitorHistory": "WKhQka_monitorHistory",
			"monitorHistoryError": "WKhQka_monitorHistoryError",
			"monitorHistoryHead": "WKhQka_monitorHistoryHead",
			"monitoring": "WKhQka_monitoring",
			"monitorIntro": "WKhQka_monitorIntro",
			"monitorMeta": "WKhQka_monitorMeta",
			"monitorMetrics": "WKhQka_monitorMetrics",
			"monitorQuiet": "WKhQka_monitorQuiet",
			"monitorState": "WKhQka_monitorState",
			"monitorStats": "WKhQka_monitorStats",
			"monitorTitle": "WKhQka_monitorTitle",
			"monitorTop": "WKhQka_monitorTop",
			"monitorUrl": "WKhQka_monitorUrl",
			"newsclawSpin": "WKhQka_newsclawSpin",
			"panel": "WKhQka_panel",
			"pendingConfidence": "WKhQka_pendingConfidence",
			"pendingCopy": "WKhQka_pendingCopy",
			"pendingInterpretation": "WKhQka_pendingInterpretation",
			"pendingItem": "WKhQka_pendingItem",
			"pendingKind": "WKhQka_pendingKind",
			"pendingObservation": "WKhQka_pendingObservation",
			"pendingOpen": "WKhQka_pendingOpen",
			"pinnedFooter": "WKhQka_pinnedFooter",
			"poolChip": "WKhQka_poolChip",
			"poolChipLabel": "WKhQka_poolChipLabel",
			"poolChips": "WKhQka_poolChips",
			"poolChipValue": "WKhQka_poolChipValue",
			"portrait": "WKhQka_portrait",
			"probe": "WKhQka_probe",
			"probeActions": "WKhQka_probeActions",
			"probeConfidence": "WKhQka_probeConfidence",
			"probeDomain": "WKhQka_probeDomain",
			"probeHead": "WKhQka_probeHead",
			"probeReason": "WKhQka_probeReason",
			"probeStatus": "WKhQka_probeStatus",
			"profileCard": "WKhQka_profileCard",
			"profileGroup": "WKhQka_profileGroup",
			"profileLayer": "WKhQka_profileLayer",
			"profilePhaseCopy": "WKhQka_profilePhaseCopy",
			"profilePortraitP": "WKhQka_profilePortraitP",
			"profileSummary": "WKhQka_profileSummary",
			"questionCard": "WKhQka_questionCard",
			"questionInterpretation": "WKhQka_questionInterpretation",
			"questionObservation": "WKhQka_questionObservation",
			"recBody": "WKhQka_recBody",
			"recCard": "WKhQka_recCard",
			"recCover": "WKhQka_recCover",
			"recCoverText": "WKhQka_recCoverText",
			"recHeader": "WKhQka_recHeader",
			"recHeaderActions": "WKhQka_recHeaderActions",
			"recHeaderCopy": "WKhQka_recHeaderCopy",
			"recHeaderTitle": "WKhQka_recHeaderTitle",
			"recKicker": "WKhQka_recKicker",
			"recTitle": "WKhQka_recTitle",
			"replyQuote": "WKhQka_replyQuote",
			"savedFeedbackRow": "WKhQka_savedFeedbackRow",
			"savedToggle": "WKhQka_savedToggle",
			"sectionIcon": "WKhQka_sectionIcon",
			"sectionTitle": "WKhQka_sectionTitle",
			"settings": "WKhQka_settings",
			"settingsActionRow": "WKhQka_settingsActionRow",
			"settingsActions": "WKhQka_settingsActions",
			"settingsBack": "WKhQka_settingsBack",
			"settingsBody": "WKhQka_settingsBody",
			"settingsConnectionValue": "WKhQka_settingsConnectionValue",
			"settingsEyebrow": "WKhQka_settingsEyebrow",
			"settingsField": "WKhQka_settingsField",
			"settingsFieldRow": "WKhQka_settingsFieldRow",
			"settingsHeader": "WKhQka_settingsHeader",
			"settingsHint": "WKhQka_settingsHint",
			"settingsInput": "WKhQka_settingsInput",
			"settingsInstance": "WKhQka_settingsInstance",
			"settingsInstanceHead": "WKhQka_settingsInstanceHead",
			"settingsMetric": "WKhQka_settingsMetric",
			"settingsMetricGrid": "WKhQka_settingsMetricGrid",
			"settingsNotice": "WKhQka_settingsNotice",
			"settingsOverlay": "WKhQka_settingsOverlay",
			"settingsPanel": "WKhQka_settingsPanel",
			"settingsRefreshBar": "WKhQka_settingsRefreshBar",
			"settingsRow": "WKhQka_settingsRow",
			"settingsRuntimeHero": "WKhQka_settingsRuntimeHero",
			"settingsSavebar": "WKhQka_settingsSavebar",
			"settingsSavebarMsg": "WKhQka_settingsSavebarMsg",
			"settingsSection": "WKhQka_settingsSection",
			"settingsSourceCard": "WKhQka_settingsSourceCard",
			"settingsSourceError": "WKhQka_settingsSourceError",
			"settingsSourceHead": "WKhQka_settingsSourceHead",
			"settingsSourceList": "WKhQka_settingsSourceList",
			"settingsSourceMeta": "WKhQka_settingsSourceMeta",
			"settingsStatusPill": "WKhQka_settingsStatusPill",
			"settingsTab": "WKhQka_settingsTab",
			"settingsTabs": "WKhQka_settingsTabs",
			"settingsToast": "WKhQka_settingsToast",
			"settingsToastBar": "WKhQka_settingsToastBar",
			"settingsToggleRow": "WKhQka_settingsToggleRow",
			"settingsValueList": "WKhQka_settingsValueList",
			"settingsValueRow": "WKhQka_settingsValueRow",
			"sidebarButton": "WKhQka_sidebarButton",
			"sidebarButtonIcon": "WKhQka_sidebarButtonIcon",
			"sidebarButtonLabel": "WKhQka_sidebarButtonLabel",
			"spacer": "WKhQka_spacer",
			"spinner": "WKhQka_spinner",
			"spotlightActions": "WKhQka_spotlightActions",
			"spotlightBody": "WKhQka_spotlightBody",
			"spotlightCard": "WKhQka_spotlightCard",
			"spotlightChevron": "WKhQka_spotlightChevron",
			"spotlightComposer": "WKhQka_spotlightComposer",
			"spotlightCounter": "WKhQka_spotlightCounter",
			"spotlightCover": "WKhQka_spotlightCover",
			"spotlightCoverScrim": "WKhQka_spotlightCoverScrim",
			"spotlightDismiss": "WKhQka_spotlightDismiss",
			"spotlightHeader": "WKhQka_spotlightHeader",
			"spotlightHero": "WKhQka_spotlightHero",
			"spotlightHeroFallback": "WKhQka_spotlightHeroFallback",
			"spotlightKicker": "WKhQka_spotlightKicker",
			"spotlightKickerLine": "WKhQka_spotlightKickerLine",
			"spotlightMain": "WKhQka_spotlightMain",
			"spotlightMedia": "WKhQka_spotlightMedia",
			"spotlightNav": "WKhQka_spotlightNav",
			"spotlightReason": "WKhQka_spotlightReason",
			"spotlightRow": "WKhQka_spotlightRow",
			"spotlightScore": "WKhQka_spotlightScore",
			"spotlightScorePill": "WKhQka_spotlightScorePill",
			"spotlightText": "WKhQka_spotlightText",
			"spotlightThumb": "WKhQka_spotlightThumb",
			"spotlightThumbFallback": "WKhQka_spotlightThumbFallback",
			"spotlightTitle": "WKhQka_spotlightTitle",
			"spotlightTitleWrap": "WKhQka_spotlightTitleWrap",
			"starButton": "WKhQka_starButton",
			"starToggle": "WKhQka_starToggle",
			"stateBadge": "WKhQka_stateBadge",
			"stats": "WKhQka_stats",
			"status": "WKhQka_status",
			"statusDot": "WKhQka_statusDot",
			"statusText": "WKhQka_statusText",
			"subTab": "WKhQka_subTab",
			"subTabs": "WKhQka_subTabs",
			"syncBadgeRow": "WKhQka_syncBadgeRow",
			"syncChip": "WKhQka_syncChip",
			"syncInlineDetail": "WKhQka_syncInlineDetail",
			"syncLine": "WKhQka_syncLine",
			"syncLineDetail": "WKhQka_syncLineDetail",
			"syncLineText": "WKhQka_syncLineText",
			"syncMessage": "WKhQka_syncMessage",
			"syncResults": "WKhQka_syncResults",
			"syncToolbar": "WKhQka_syncToolbar",
			"tab": "WKhQka_tab",
			"tabBar": "WKhQka_tabBar",
			"thumb": "WKhQka_thumb",
			"thumbFallback": "WKhQka_thumbFallback",
			"toolbar": "WKhQka_toolbar",
			"topicBadge": "WKhQka_topicBadge",
			"turn": "WKhQka_turn",
			"turnSoul": "WKhQka_turnSoul",
			"turnStatus": "WKhQka_turnStatus",
			"turnUser": "WKhQka_turnUser",
			"updateRow": "WKhQka_updateRow",
			"viewIntro": "WKhQka_viewIntro",
			"viewKicker": "WKhQka_viewKicker",
			"watchToggle": "WKhQka_watchToggle"
		};
		//#endregion
		//#region lib/types/client/views.js
		/**
		* Shared card pieces plus the 推荐 (recommend) view — mirroring the canonical
		* NewsClaw surfaces (mobile web + extension popup): header card with
		* 换一批, pool status chips, spotlight banner, recommendation cards with the
		* full action set (打开原文/喜欢/稍后读/收藏/不感兴趣/评论), and the
		* expandable activity footer.
		* @module @newsclaw/dsh-plugin
		*/
		/** Canonical media display names for provider codes. */
		function mediaLabel(media) {
			return {
				cls: "财联社",
				yicai: "第一财经",
				eastmoney: "东方财富",
				"10jqka": "同花顺",
				wallstreetcn: "华尔街见闻",
				sina: "新浪财经",
				cctv: "央视新闻",
				xinhua: "新华网",
				caixin: "财新网",
				cs: "中证网",
				rss: "RSS"
			}[media.trim().toLowerCase()] ?? (media || "未知媒体");
		}
		/**
		* Normalize a news card's identity and URLs for the local saved-list payload.
		* URLs must be absolute HTTP(S); protocol-relative cover URLs are promoted to
		* `https:` and malformed values are dropped.
		*/
		function normalizeSaveIdentity(item) {
			const asAbsoluteUrl = (url, promoteProtocolRelative) => {
				if (/^https?:\/\//i.test(url)) return url;
				if (promoteProtocolRelative && /^\/\//.test(url)) return `https:${url}`;
				return "";
			};
			return {
				article_id: item.article_id !== "" ? item.article_id : item.item_key,
				original_url: asAbsoluteUrl(item.content_url, false),
				cover_url: asAbsoluteUrl(item.cover_url, true)
			};
		}
		/** Image with the shared backend proxy and a deterministic local fallback. */
		function CoverImage(props) {
			const src = imageProxyUrl(props.base, props.url);
			const [failedSource, setFailedSource] = (0, react.useState)("");
			if (src === "" || failedSource === src) return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: props.fallback });
			return (0, react_jsx_runtime.jsx)("img", {
				className: props.className,
				src,
				alt: props.alt ?? "",
				loading: props.loading ?? "lazy",
				decoding: "async",
				referrerPolicy: "no-referrer",
				crossOrigin: imageProxyCrossOrigin(props.base),
				onError: () => {
					setFailedSource(src);
					props.onError?.();
				}
			});
		}
		/** Small cover thumbnail with an optional media corner label. */
		function Thumb(props) {
			const base = props.base ?? readApiBase();
			const media = props.url !== "" ? (0, react_jsx_runtime.jsx)(CoverImage, {
				base,
				url: props.url,
				className: panel_module_css_default.thumb,
				fallback: (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.thumbFallback,
					children: "📰"
				})
			}) : (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.thumbFallback,
				children: "📰"
			});
			if (props.media !== void 0 && props.media !== "") return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.coverWrap,
				children: [media, (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.coverCorner,
					children: mediaLabel(props.media)
				})]
			});
			return media;
		}
		/** Media tag + publisher/time meta row. */
		function MetaRow(props) {
			const parts = [];
			if (props.media !== "") parts.push((0, react_jsx_runtime.jsx)("span", { children: mediaLabel(props.media) }, "m"));
			if (props.author !== void 0 && props.author !== "") parts.push((0, react_jsx_runtime.jsx)("span", { children: props.author }, "a"));
			if (props.time !== void 0 && props.time !== "") parts.push((0, react_jsx_runtime.jsx)("span", { children: formatTime(props.time) }, "t"));
			if (parts.length === 0) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.cardMeta,
				children: parts
			});
		}
		/** Compact timestamp formatter. */
		function formatTime(iso) {
			if (iso === "") return "";
			const date = new Date(iso);
			if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
			const diff = Date.now() - date.getTime();
			if (diff < 36e5) return `${Math.max(1, Math.floor(diff / 6e4))} 分钟前`;
			if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
			if (diff < 2592e6) return `${Math.floor(diff / 864e5)} 天前`;
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
		}
		/** Small action button. */
		function ActionButton(props) {
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: panel_module_css_default.actionButton,
				"data-primary": props.primary === true || void 0,
				"data-danger": props.danger === true || void 0,
				disabled: props.disabled === true,
				title: props.title,
				onClick: props.onClick,
				children: props.label
			});
		}
		/** Empty state line. */
		function EmptyState(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: props.text
			});
		}
		/** Error note. */
		function ErrorNote(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.error,
				children: props.text
			});
		}
		/** Stable idempotency key per (item identity × action): reuse on retries only. */
		function useActionId(identity, action) {
			const ref = (0, react.useRef)(/* @__PURE__ */ new Map());
			const key = `${identity}::${action}`;
			let id = ref.current.get(key);
			if (id === void 0) {
				id = stableId();
				ref.current.set(key, id);
			}
			return id;
		}
		/** Pending click ids survive an ambiguous timeout, so a user's retry is idempotent. */
		const pendingClickIds = /* @__PURE__ */ new Map();
		/** Open a content URL immediately, then report whether the weak open signal persisted. */
		function openItem(base, item, onPersistError) {
			const url = item.content_url;
			if (url === "") return;
			const identity = `${item.recommendation_id ?? ""}:${item.article_id || item.content_id}:${url}`;
			const requestId = pendingClickIds.get(identity) ?? stableId();
			pendingClickIds.set(identity, requestId);
			reportClick(base, {
				recommendation_id: item.recommendation_id,
				article_id: item.article_id !== "" ? item.article_id : item.content_id,
				content_url: item.content_url,
				media: item.media,
				title: item.title,
				request_id: requestId
			}).then(() => {
				if (pendingClickIds.get(identity) === requestId) pendingClickIds.delete(identity);
			}).catch((error) => {
				onPersistError?.(error);
			});
			window.open(url, "_blank", "noopener");
		}
		/** Pool status chips, mirroring the popup's getPoolStatusSummary language. */
		function poolStatus(status) {
			if (status === null) return [];
			const available = status.pool_available_count;
			const replenished = typeof status.last_replenished_count === "number" ? status.last_replenished_count : 0;
			const pending = status.pool_pending_count;
			return [
				{
					label: "候选池",
					value: `${available} 条可推荐`
				},
				{
					label: "处理中",
					value: `${pending} 条`
				},
				{
					label: "本轮新增",
					value: `${replenished} 条`
				}
			];
		}
		/** One recommendation card (canonical action set incl. comment composer). */
		function RecommendationCard({ base, item, onDismissed, onError }) {
			const likeId = useActionId(String(item.id), "like");
			const dislikeId = useActionId(String(item.id), "dislike");
			const dismissId = useActionId(String(item.id), "dismiss");
			const [busy, setBusy] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)("");
			const [statusTone, setStatusTone] = (0, react.useState)("info");
			const [comment, setComment] = (0, react.useState)("");
			const [composerOpen, setComposerOpen] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(null);
			const commentIds = (0, react.useRef)(/* @__PURE__ */ new Map());
			(0, react.useEffect)(() => {
				let cancelled = false;
				const key = item.item_key !== "" ? item.item_key : item.article_id;
				if (key === "") return;
				setSaved(null);
				Promise.all([fetchSavedStatus(base, "favorite", key), fetchSavedStatus(base, "watch_later", key)]).then(([favorite, watch_later]) => {
					if (!cancelled) setSaved({
						favorite,
						watch_later
					});
				}).catch((err) => {
					if (!cancelled) {
						setSaved(null);
						setStatus("收藏状态读取失败：" + (err instanceof Error ? err.message : String(err)));
						setStatusTone("error");
					}
				});
				return () => {
					cancelled = true;
				};
			}, [
				base,
				item.item_key,
				item.article_id
			]);
			const act = (0, react.useCallback)(async (action, run, done = "", doneTone = "info") => {
				setBusy(action);
				setStatus("提交中…");
				setStatusTone("info");
				try {
					await run();
					setStatus(done);
					setStatusTone(doneTone);
				} catch (err) {
					setStatus("没记上：" + (err instanceof Error ? err.message : String(err)));
					setStatusTone("error");
				} finally {
					setBusy(null);
				}
			}, []);
			const feedback = (type, requestId, done) => submitFeedback(base, {
				recommendation_id: item.id,
				feedback_type: type,
				request_id: requestId
			}).then(() => {
				setStatus(done);
			});
			const toggleSave = (listKind) => {
				const key = item.item_key !== "" ? item.item_key : item.article_id;
				const currently = saved?.[listKind] === true;
				const run = async () => {
					if (currently) await removeSaved(base, listKind, key);
					else await saveItem(base, listKind, {
						media: item.media,
						...normalizeSaveIdentity(item),
						title: item.title,
						author_name: item.publisher_name
					});
					setSaved((prev) => prev === null ? prev : {
						...prev,
						[listKind]: !currently
					});
				};
				return run();
			};
			const submitComment = () => {
				const note = comment.trim();
				if (note === "") return;
				let commentId = commentIds.current.get(note);
				if (commentId === void 0) {
					commentId = stableId();
					commentIds.current.set(note, commentId);
				}
				act("comment", async () => {
					await submitFeedback(base, {
						recommendation_id: item.id,
						feedback_type: "comment",
						note,
						request_id: commentId
					});
					commentIds.current.delete(note);
					setComment("");
				}, "评论已记下。", "success");
			};
			const anyBusy = busy !== null;
			const key = item.item_key !== "" ? item.item_key : item.article_id;
			const isText = item.cover_url === "";
			const open = () => {
				openItem(base, {
					recommendation_id: item.id,
					content_id: item.content_id,
					article_id: item.article_id,
					content_url: item.content_url,
					media: item.media,
					title: item.title
				}, (err) => {
					setStatus("原文已打开，但阅读记录未确认保存：" + (err instanceof Error ? err.message : String(err)));
					setStatusTone("error");
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.recCard,
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.recCover,
						onClick: open,
						"aria-label": item.title,
						children: [!isText && item.cover_url !== "" ? (0, react_jsx_runtime.jsx)(CoverImage, {
							base,
							url: item.cover_url,
							fallback: (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.recCoverText,
								children: item.title || item.body_text || "封面暂时加载失败"
							})
						}) : (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.recCoverText,
							children: isText && item.body_text !== "" ? item.body_text : item.title
						}), (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.coverCorner,
							children: mediaLabel(item.media)
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.recBody,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.badgeRow,
								children: [item.topic_label !== "" ? (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.topicBadge,
									children: item.topic_label
								}) : null, (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.stateBadge,
									children: item.body_level === "title" ? "标题级信息" : item.presented ? "已展示" : "新抓到"
								})]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.recTitle,
								children: item.title !== "" ? item.title : item.body_text !== "" ? item.body_text.slice(0, 80) : item.article_id
							}),
							item.why_for_you !== "" ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.expression,
								children: ["为什么适合你：", item.why_for_you]
							}) : null,
							item.impact_chain.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.expression,
								children: ["可能影响链：", item.impact_chain.join(" → ")]
							}) : null,
							item.observation_points.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.expression,
								children: ["后续观察：", item.observation_points.join("；")]
							}) : null,
							(0, react_jsx_runtime.jsx)(MetaRow, {
								media: item.media,
								author: item.publisher_name || item.technical_provider,
								time: item.published_label || item.published_at
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.cardActions,
								children: [
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "打开原文",
										primary: true,
										disabled: anyBusy || item.original_url === "",
										onClick: open
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "喜欢",
										disabled: anyBusy,
										onClick: () => void act("like", () => feedback("like", likeId, "记下了，这类新闻可以多来点。"), "记下了，这类新闻可以多来点。", "success")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.savedToggle} ${panel_module_css_default.watchToggle}`,
										"data-pressed": saved?.watch_later === true,
										"aria-pressed": saved?.watch_later === true,
										title: "稍后读",
										disabled: anyBusy || saved === null,
										onClick: () => void act("watch_later", () => toggleSave("watch_later")),
										children: (0, react_jsx_runtime.jsx)(ClockIcon, { size: 14 })
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.savedToggle} ${panel_module_css_default.starToggle}`,
										"data-pressed": saved?.favorite === true,
										"aria-pressed": saved?.favorite === true,
										title: "收藏",
										disabled: anyBusy || saved === null,
										onClick: () => void act("favorite", () => toggleSave("favorite")),
										children: (0, react_jsx_runtime.jsx)(StarIcon, { size: 14 })
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "不感兴趣",
										danger: true,
										disabled: anyBusy,
										onClick: () => void act("dislike", () => feedback("dislike", dislikeId, "记下了，这类新闻先少来点。"), "记下了，这类新闻先少来点。", "success")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "忽略",
										disabled: anyBusy,
										onClick: () => void act("ignore", () => feedback("ignore", dismissId, "已移出推荐。").then(() => {
											onDismissed(item.id);
										}), "已移出推荐。", "success")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: composerOpen ? "收起" : "说说原因",
										disabled: anyBusy,
										onClick: () => setComposerOpen((open) => !open)
									})
								]
							}),
							composerOpen ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.commentComposer,
								children: [(0, react_jsx_runtime.jsx)("textarea", {
									rows: 3,
									placeholder: "写一句为什么这条新闻对你有用，或哪里不符合需要",
									value: comment,
									disabled: anyBusy,
									onChange: (event) => setComment(event.target.value)
								}), (0, react_jsx_runtime.jsx)(ActionButton, {
									label: "发送",
									primary: true,
									disabled: anyBusy || comment.trim() === "",
									onClick: submitComment
								})]
							}) : null,
							status !== "" ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.feedbackStatus,
								"data-tone": statusTone,
								children: status
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsx)("span", {
						style: { display: "none" },
						children: key
					})
				]
			});
		}
		/** Spotlight banner — popup structure: collapsed row (16:9 thumb + kicker pills
		*  + clamped title + chevron) with a right-edge × column; clicking the row
		*  expands the body (reason + actions + chat composer). */
		function SpotlightBanner(props) {
			const { base, onError } = props;
			const [queue, setQueue] = (0, react.useState)(null);
			const [index, setIndex] = (0, react.useState)(0);
			const [expanded, setExpanded] = (0, react.useState)(true);
			const [composerOpen, setComposerOpen] = (0, react.useState)(false);
			const [chatDraft, setChatDraft] = (0, react.useState)("");
			const [chatStatus, setChatStatus] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)("");
			const [reaction, setReaction] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(null);
			const [failedCoverKey, setFailedCoverKey] = (0, react.useState)("");
			const actionIds = (0, react.useRef)(/* @__PURE__ */ new Map());
			const reload = (0, react.useCallback)(async () => {
				try {
					const items = await fetchSpotlightBatch(base);
					setQueue(items);
					setIndex(0);
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				}
			}, [base, onError]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const item = queue === null ? null : queue[Math.min(index, queue.length - 1)];
			(0, react.useEffect)(() => {
				let cancelled = false;
				if (item === void 0 || item === null) return;
				const key = item.item_key !== "" ? item.item_key : item.article_id;
				if (key === "") return;
				setSaved(null);
				Promise.all([fetchSavedStatus(base, "favorite", key), fetchSavedStatus(base, "watch_later", key)]).then(([favorite, watch_later]) => {
					if (!cancelled) setSaved({
						favorite,
						watch_later
					});
				}).catch((err) => {
					if (!cancelled) {
						setSaved(null);
						onError("收藏状态读取失败：" + (err instanceof Error ? err.message : String(err)));
					}
				});
				return () => {
					cancelled = true;
				};
			}, [base, item]);
			const respond = (0, react.useCallback)(async (target, response, message = "") => {
				setBusy(response);
				try {
					const key = `${target.article_id}:${response}:${message}`;
					let request_id = actionIds.current.get(key);
					if (request_id === void 0) {
						request_id = stableId();
						actionIds.current.set(key, request_id);
					}
					await respondToSpotlight(base, {
						article_id: target.article_id,
						response,
						title: target.title,
						message,
						request_id
					});
					if (response === "ignore") {
						setQueue((prev) => (prev ?? []).filter((candidate) => candidate.article_id !== target.article_id));
						setExpanded(false);
					} else if (response === "like") setReaction({
						kind: "like",
						text: "已记下，这类惊喜多来点。"
					});
					else if (response === "dislike") setReaction({
						kind: "dislike",
						text: "记下了，这类惊喜先少来点。"
					});
					else if (response === "open") setReaction({
						kind: "open",
						text: "已记录打开。"
					});
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [base, onError]);
			const toggleSave = (0, react.useCallback)(async (listKind) => {
				if (item === void 0 || item === null) return;
				const key = item.item_key !== "" ? item.item_key : item.article_id;
				const currently = saved?.[listKind] === true;
				setBusy(listKind);
				try {
					if (currently) await removeSaved(base, listKind, key);
					else await saveItem(base, listKind, {
						media: item.media,
						...normalizeSaveIdentity(item),
						title: item.title
					});
					setSaved((prev) => prev === null ? prev : {
						...prev,
						[listKind]: !currently
					});
					setReaction({
						kind: listKind,
						text: currently ? "已从列表移除。" : listKind === "favorite" ? "已收藏。" : "已加入稍后读。"
					});
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				item,
				onError,
				saved
			]);
			const sendChat = (0, react.useCallback)(async () => {
				if (item === void 0 || item === null) return;
				const message = chatDraft.trim();
				if (message === "") return;
				setBusy("chat");
				setChatStatus("");
				try {
					const key = `${item.article_id}:chat:${message}`;
					let request_id = actionIds.current.get(key);
					if (request_id === void 0) {
						request_id = stableId();
						actionIds.current.set(key, request_id);
					}
					await respondToSpotlight(base, {
						article_id: item.article_id,
						response: "chat",
						title: item.title,
						message,
						request_id
					});
					actionIds.current.delete(key);
					setChatDraft("");
					setChatStatus("已转达给新闻爪，它会继续追问和学习。");
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				chatDraft,
				item,
				onError
			]);
			if (queue === null) return null;
			if (queue.length === 0) return null;
			if (item === void 0 || item === null) return null;
			const anyBusy = busy !== "";
			const isText = item.cover_url === "";
			const coverKey = `${item.item_key}:${item.article_id}:${item.cover_url}`;
			const coverFailed = failedCoverKey === coverKey;
			const open = () => {
				respond(item, "view");
				openItem(base, {
					recommendation_id: void 0,
					content_id: item.content_id !== "" ? item.content_id : item.article_id,
					article_id: item.article_id,
					content_url: item.content_url,
					media: item.media,
					title: item.title
				}, (err) => {
					onError("原文已打开，但阅读记录未确认保存：" + (err instanceof Error ? err.message : String(err)));
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.spotlightCard,
				"data-expanded": expanded,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.spotlightHeader,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.spotlightKicker,
								children: "✨ 惊喜推荐"
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.spotlightMedia,
								children: mediaLabel(item.media)
							}),
							(0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.spacer }),
							queue.length > 1 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.spotlightNav,
									title: "上一条",
									disabled: index <= 0 || anyBusy,
									onClick: () => {
										setIndex((i) => Math.max(0, i - 1));
										setReaction(null);
									},
									children: "‹"
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.spotlightCounter,
									children: [
										index + 1,
										"/",
										queue.length
									]
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.spotlightNav,
									title: "下一条",
									disabled: index >= queue.length - 1 || anyBusy,
									onClick: () => {
										setIndex((i) => Math.min(queue.length - 1, i + 1));
										setReaction(null);
									},
									children: "›"
								})
							] }) : null,
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.spotlightDismiss,
								title: "忽略并不再推荐",
								disabled: anyBusy,
								onClick: () => void respond(item, "ignore"),
								children: "×"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.spotlightMain,
						onClick: () => setExpanded((v) => !v),
						"aria-expanded": expanded,
						children: [(0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.spotlightCover,
							children: [
								item.cover_url !== "" ? (0, react_jsx_runtime.jsx)(CoverImage, {
									base,
									url: item.cover_url,
									className: panel_module_css_default.spotlightHero,
									fallback: (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.spotlightHeroFallback,
										children: isText && item.body_text !== "" ? item.body_text.slice(0, 120) : "✨"
									}),
									onError: () => setFailedCoverKey(coverKey)
								}) : (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.spotlightHeroFallback,
									children: isText && item.body_text !== "" ? item.body_text.slice(0, 120) : "✨"
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.spotlightCoverScrim,
									"aria-hidden": "true"
								}),
								!coverFailed && item.cover_url !== "" && item.spotlight_score > 0 ? (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.spotlightScorePill,
									children: [
										"💗 ",
										Math.round(item.spotlight_score * 100),
										"% 匹配"
									]
								}) : null
							]
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.spotlightTitleWrap,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.spotlightTitle,
								children: item.title !== "" ? item.title : item.body_text !== "" ? item.body_text.slice(0, 80) : item.article_id
							}), (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.spotlightChevron,
								"aria-hidden": "true",
								children: expanded ? "▾" : "▸"
							})]
						})]
					}),
					expanded ? (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.spotlightBody,
						children: [
							item.spotlight_reason !== "" ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.spotlightReason,
								children: [
									(0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.spotlightScore,
										children: [Math.round(item.spotlight_score * 100), "%"]
									}),
									" · ",
									item.spotlight_reason
								]
							}) : null,
							item.body_level === "title" ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.hint,
								children: "标题级信息"
							}) : null,
							item.impact_chain.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.expression,
								children: ["可能影响链：", item.impact_chain.join(" → ")]
							}) : null,
							item.observation_points.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.expression,
								children: ["后续观察：", item.observation_points.join("；")]
							}) : null,
							(0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.spotlightActions,
								children: [
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "打开原文",
										primary: true,
										disabled: anyBusy || item.original_url === "",
										onClick: open
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: reaction?.kind === "like" ? "已喜欢" : "喜欢",
										primary: reaction?.kind === "like",
										disabled: anyBusy || reaction?.kind === "like",
										onClick: () => void respond(item, "like")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: saved?.watch_later === true ? "已稍后读" : "稍后读",
										disabled: anyBusy || saved === null,
										onClick: () => void toggleSave("watch_later")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: saved?.favorite === true ? "已收藏" : "收藏",
										disabled: anyBusy || saved === null,
										onClick: () => void toggleSave("favorite")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: "不感兴趣",
										danger: true,
										disabled: anyBusy,
										onClick: () => void respond(item, "dislike")
									}),
									(0, react_jsx_runtime.jsx)(ActionButton, {
										label: composerOpen ? "收起" : "聊一聊",
										disabled: anyBusy,
										onClick: () => setComposerOpen((v) => !v)
									})
								]
							}),
							composerOpen ? (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.spotlightComposer,
								children: [(0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.chatInput,
									rows: 2,
									placeholder: "说说你为什么想点开，或者哪里还拿不准",
									value: chatDraft,
									disabled: anyBusy,
									onChange: (event) => setChatDraft(event.target.value)
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.chatSend,
									disabled: anyBusy || chatDraft.trim() === "",
									onClick: () => void sendChat(),
									children: "发送"
								})]
							}) : null,
							chatStatus !== "" ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.feedbackStatus,
								children: chatStatus
							}) : null,
							reaction !== null ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.feedbackStatus,
								"data-tone": reaction.kind === "dislike" ? "error" : "success",
								children: reaction.text
							}) : null
						]
					}) : null
				]
			});
		}
		/** Activity footer — popup-style: collapsed line (summary + headline) with a
		*  更多/收起 toggle; expanded rows are footer-item cards with a kind pill,
		*  time and summary, plus a dashed load-more button. */
		function ActivityFooter(props) {
			const { base } = props;
			const [feed, setFeed] = (0, react.useState)(null);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [loadingMore, setLoadingMore] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const reload = (0, react.useCallback)(async () => {
				setError("");
				try {
					setFeed(await fetchActivityFeed(base, { limit: 5 }));
				} catch (err) {
					setFeed(null);
					setError(err instanceof Error ? err.message : String(err));
				}
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const loadMore = (0, react.useCallback)(async () => {
				if (feed === null || !feed.hasMore || loadingMore) return;
				setLoadingMore(true);
				setError("");
				try {
					const next = await fetchActivityFeed(base, {
						limit: 5,
						before: feed.nextCursor
					});
					setFeed((prev) => prev === null ? next : {
						...next,
						items: [...prev.items, ...next.items]
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setLoadingMore(false);
				}
			}, [
				base,
				feed,
				loadingMore
			]);
			if (feed === null) return error === "" ? null : (0, react_jsx_runtime.jsx)(ErrorNote, { text: `后台动态读取失败：${error}` });
			if (feed.items.length === 0 && feed.liveSummary === "" && feed.headline === "") return null;
			const summaryOf = (item) => {
				if (typeof item.summary === "string" && item.summary !== "") return item.summary;
				const kind = typeof item.kind === "string" ? item.kind : "";
				return kind !== "" ? kind.replace(/[._]/g, " ") : JSON.stringify(item).slice(0, 120);
			};
			const kindOf = (item) => typeof item.kind === "string" && item.kind !== "" ? item.kind : "动态";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.activityFooter,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.footerHead,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.footerCopy,
							children: [(0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.footerHint,
								children: feed.liveSummary !== "" ? feed.liveSummary : "新闻爪正在替你留意新信息。"
							}), (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.footerHeadline,
								children: feed.headline !== "" ? feed.headline : "最近还没新动静，先多刷一阵。"
							})]
						}), feed.items.length > 0 ? (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.footerToggle,
							"aria-expanded": expanded,
							onClick: () => setExpanded((v) => !v),
							children: expanded ? "收起" : "更多"
						}) : null]
					}),
					error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: `加载更多失败：${error}` }) : null,
					expanded && feed.items.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.footerHistory,
						children: [feed.items.map((item, i) => (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.footerItem,
							children: [(0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.footerItemMeta,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.footerItemKind,
									children: kindOf(item)
								}), (0, react_jsx_runtime.jsx)("span", { children: typeof item.occurred_at === "string" && item.occurred_at !== "" ? formatTime(item.occurred_at) : "" })]
							}), (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.footerItemSummary,
								children: summaryOf(item)
							})]
						}, String(item.id ?? i))), feed.hasMore ? (0, react_jsx_runtime.jsx)(ActionButton, {
							label: "加载更多",
							disabled: loadingMore,
							onClick: () => void loadMore()
						}) : null]
					}) : null
				]
			});
		}
		/** Read-only first-setup handoff. DSH never force-rebuilds an existing profile. */
		function InitPrompt(props) {
			const { base, status, onRefresh, busy } = props;
			const failed = status.status === "failed";
			const running = status.running || status.status === "running";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.initPrompt,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.initPromptCopy,
					children: [
						(0, react_jsx_runtime.jsx)("strong", { children: running ? "首次设置正在进行" : failed ? "首次设置需要重试" : "先完成新闻爪首次设置" }),
						(0, react_jsx_runtime.jsx)("span", { children: running ? "新闻爪正在抓取首批真实新闻并建立画像。" : "兴趣方向与数据源需要在电脑版填写；已有画像不会被这里重建。" }),
						status.detail !== "" ? (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.initPromptStatus,
							role: "status",
							children: status.detail
						}) : null
					]
				}), running ? (0, react_jsx_runtime.jsx)(ActionButton, {
					label: busy ? "刷新中…" : "刷新进度",
					primary: true,
					disabled: busy,
					onClick: onRefresh
				}) : (0, react_jsx_runtime.jsx)(ActionButton, {
					label: failed ? "去电脑版检查并重试" : "去电脑版完成首次设置",
					primary: true,
					onClick: () => {
						window.open(`${base}/web`, "_blank", "noopener");
					}
				})]
			});
		}
		/** 推荐 tab: header + pool status + spotlight + recommendation cards + activity. */
		function RecommendView(props) {
			const { base, refreshKey } = props;
			const [items, setItems] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)(null);
			const [bootstrap, setBootstrap] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)("");
			const [excluded, setExcluded] = (0, react.useState)([]);
			const reload = (0, react.useCallback)(async () => {
				setBusy("refresh");
				setError("");
				const [recs, runtime, bootstrapState] = await Promise.allSettled([
					fetchRecommendations(base),
					fetchRuntimeStatus(base),
					fetchNewsBootstrapStatus(base)
				]);
				if (recs.status === "fulfilled") {
					setItems(recs.value);
					setExcluded([]);
				} else setError(recs.reason instanceof Error ? recs.reason.message : String(recs.reason));
				if (runtime.status === "fulfilled") setStatus(runtime.value);
				if (bootstrapState.status === "fulfilled") setBootstrap(bootstrapState.value);
				const auxiliaryFailures = [runtime, bootstrapState].filter((result) => result.status === "rejected").length;
				if (recs.status === "fulfilled" && auxiliaryFailures > 0) setError("推荐已刷新，但部分运行状态读取失败；请稍后再试。");
				setBusy("");
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const run = (0, react.useCallback)(async (label, action) => {
				setBusy(label);
				setError("");
				try {
					const next = await action();
					setItems(next);
					setExcluded([]);
					await fetchRuntimeStatus(base).then(setStatus).catch(() => {
						setError("内容已更新，但运行状态暂时读取失败。");
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [base]);
			const visibleIds = items?.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean) ?? [];
			const excludeAll = [...excluded, ...visibleIds];
			const [exhausted, setExhausted] = (0, react.useState)(false);
			const sentinelRef = (0, react.useRef)(null);
			const [appendBlocked, setAppendBlocked] = (0, react.useState)(false);
			const appendMore = (0, react.useCallback)(async () => {
				if (items === null || busy !== "" || exhausted || appendBlocked) return;
				setBusy("append-auto");
				setError("");
				try {
					const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...items.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean)] });
					if (next.length === 0) setExhausted(true);
					else {
						setItems((prev) => [...prev ?? [], ...next]);
						setExcluded((prev) => [...prev, ...items.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean)]);
					}
					await fetchRuntimeStatus(base).then(setStatus).catch(() => {
						setError("新闻已追加，但运行状态暂时读取失败。");
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
					setAppendBlocked(true);
				} finally {
					setBusy("");
				}
			}, [
				base,
				busy,
				exhausted,
				appendBlocked,
				items,
				excluded
			]);
			const appendManual = (0, react.useCallback)(async () => {
				if (items === null || busy !== "") return;
				setBusy("append");
				setError("");
				try {
					const currentIds = items.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean);
					const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...currentIds] });
					if (next.length === 0) setExhausted(true);
					else {
						const seen = new Set(currentIds);
						const fresh = next.filter((item) => {
							const key = item.item_key !== "" ? item.item_key : item.article_id;
							if (key === "" || seen.has(key)) return false;
							seen.add(key);
							return true;
						});
						if (fresh.length === 0) setExhausted(true);
						else {
							setItems((prev) => [...prev ?? [], ...fresh]);
							setExcluded((prev) => [...prev, ...currentIds]);
							setExhausted(false);
						}
					}
					await fetchRuntimeStatus(base).then(setStatus).catch(() => {
						setError("新闻已追加，但运行状态暂时读取失败。");
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				busy,
				excluded,
				items
			]);
			const appendMoreRef = (0, react.useRef)(async () => void 0);
			appendMoreRef.current = appendMore;
			(0, react.useEffect)(() => {
				const el = sentinelRef.current;
				if (el === null) return;
				const root = el.parentElement;
				const observer = new IntersectionObserver((entries) => {
					for (const entry of entries) if (entry.isIntersecting) appendMoreRef.current();
				}, {
					root,
					rootMargin: "800px 0px 800px 0px"
				});
				observer.observe(el);
				return () => {
					observer.disconnect();
				};
			}, []);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.recHeader,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.recHeaderCopy,
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.recKicker,
								children: "For You"
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.recHeaderTitle,
								children: "今天值得你理解的新闻"
							}),
							status !== null ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.poolChips,
								children: poolStatus(status).map((chip) => (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.poolChip,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.poolChipLabel,
										children: chip.label
									}), (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.poolChipValue,
										children: chip.value
									})]
								}, chip.label))
							}) : null
						]
					}), (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.recHeaderActions,
						children: [(0, react_jsx_runtime.jsx)(ActionButton, {
							label: "刷新",
							disabled: busy !== "",
							onClick: () => {
								setExhausted(false);
								setAppendBlocked(false);
								reload();
							}
						}), (0, react_jsx_runtime.jsx)(ActionButton, {
							label: "换一批",
							disabled: busy !== "",
							onClick: () => {
								setExhausted(false);
								setAppendBlocked(false);
								run("reshuffle", () => reshuffleRecommendations(base, { excludedArticleIds: excludeAll }));
							}
						})]
					})]
				}),
				error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
				bootstrap !== null && !bootstrap.profile_ready ? (0, react_jsx_runtime.jsx)(InitPrompt, {
					base,
					status: bootstrap,
					onRefresh: () => void reload(),
					busy: busy !== ""
				}) : null,
				(0, react_jsx_runtime.jsx)(SpotlightBanner, {
					base,
					onError: setError
				}, `spotlight-${refreshKey}`),
				items !== null && items.length === 0 ? (0, react_jsx_runtime.jsx)(EmptyState, { text: "推荐池暂时为空。可以先完成首次设置，或等新闻源下一轮刷新。" }) : null,
				items?.map((item) => (0, react_jsx_runtime.jsx)(RecommendationCard, {
					base,
					item,
					onDismissed: (id) => setItems((prev) => (prev ?? []).filter((card) => card.id !== id)),
					onError: setError
				}, item.id)),
				items !== null && items.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.cardActions,
					children: [(0, react_jsx_runtime.jsx)(ActionButton, {
						label: "追加一批",
						disabled: busy !== "" || exhausted,
						onClick: () => {
							setAppendBlocked(false);
							appendManual();
						}
					}), (0, react_jsx_runtime.jsx)(ActionButton, {
						label: "刷新",
						disabled: busy !== "",
						onClick: () => {
							setExhausted(false);
							setAppendBlocked(false);
							reload();
						}
					})]
				}) : null,
				exhausted ? (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.hint,
					style: { textAlign: "center" },
					children: "这池先翻到头了，后台还在继续补货。"
				}) : null,
				busy === "append-auto" || busy === "append" ? (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.loadingRow,
					role: "status",
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.spinner,
						"aria-hidden": "true"
					}), "正在加载下一批…"]
				}) : null,
				(0, react_jsx_runtime.jsx)("div", {
					ref: sentinelRef,
					style: { height: 2 },
					"aria-hidden": "true"
				})
			] });
		}
		//#endregion
		//#region lib/types/client/library.js
		/** NewsClaw local library: later, favorites and recent reading history. */
		const LIBRARY_TABS = [
			{
				key: "watch_later",
				label: "稍后读"
			},
			{
				key: "favorite",
				label: "收藏"
			},
			{
				key: "history",
				label: "阅读记录"
			},
			{
				key: "monitoring",
				label: "网页监控"
			}
		];
		const HISTORY_CATEGORIES = [
			{
				key: "clicked",
				label: "打开过"
			},
			{
				key: "shown",
				label: "展示过"
			},
			{
				key: "removed",
				label: "移除的"
			}
		];
		function articleId(item) {
			if (item.article_id !== "") return item.article_id;
			if (item.content_id !== "") return item.content_id;
			return item.item_key;
		}
		async function postSavedFeedback(base, item, feedbackType, note, eventId) {
			const id = articleId(item);
			const result = await sendBehaviorEvents(base, [{
				type: "feedback",
				media: item.media,
				title: item.title,
				url: item.content_url,
				timestamp: Date.now(),
				metadata: {
					feedback_type: feedbackType,
					article_id: id,
					feedback_note: note,
					saved_feedback: true
				},
				event_id: eventId
			}]);
			if (result.accepted < 1) throw new Error(result.rejected[0]?.reason || "反馈没有保存，请稍后重试。");
		}
		function SavedCard(props) {
			const { base, listKind, item, removing, onRemove } = props;
			const otherKind = listKind === "favorite" ? "watch_later" : "favorite";
			const [otherSaved, setOtherSaved] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)("");
			const [status, setStatus] = (0, react.useState)("");
			const actionIds = (0, react.useRef)(/* @__PURE__ */ new Map());
			(0, react.useEffect)(() => {
				let cancelled = false;
				setOtherSaved(null);
				setStatus("");
				fetchSavedStatus(base, otherKind, item.item_key).then((saved) => {
					if (!cancelled) setOtherSaved(saved);
				}).catch((error) => {
					if (!cancelled) {
						setOtherSaved(null);
						setStatus("另一列表状态读取失败：" + (error instanceof Error ? error.message : String(error)));
					}
				});
				return () => {
					cancelled = true;
				};
			}, [
				base,
				item.item_key,
				otherKind
			]);
			const toggleOther = (0, react.useCallback)(async () => {
				if (otherSaved === null) return;
				setBusy("other");
				setStatus("");
				try {
					if (otherSaved) await removeSaved(base, otherKind, item.item_key);
					else await saveItem(base, otherKind, {
						article_id: articleId(item),
						media: item.media,
						original_url: item.content_url,
						title: item.title,
						author_name: item.author_name,
						cover_url: item.cover_url
					});
					setOtherSaved((value) => value === null ? null : !value);
					setStatus(otherSaved ? "已从另一列表移除。" : otherKind === "favorite" ? "已加入收藏。" : "已加入稍后读。");
				} catch (error) {
					setStatus(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy("");
				}
			}, [
				base,
				item,
				otherKind,
				otherSaved
			]);
			const feedback = (0, react.useCallback)(async (kind, note = "") => {
				setBusy(kind);
				setStatus("");
				try {
					const key = `${kind}:${note}`;
					let eventId = actionIds.current.get(key);
					if (eventId === void 0) {
						eventId = stableId();
						actionIds.current.set(key, eventId);
					}
					await postSavedFeedback(base, item, kind, note, eventId);
					actionIds.current.delete(key);
					setStatus("这条反馈已用于更新你的画像。");
				} catch (error) {
					setStatus(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy("");
				}
			}, [base, item]);
			const comment = (0, react.useCallback)(() => {
				const value = window.prompt("这条新闻为什么对你有用，或哪里不符合你的需要？")?.trim() ?? "";
				if (value !== "") feedback("comment", value);
			}, [feedback]);
			const anyBusy = removing !== "" || busy !== "";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.card,
				children: [(0, react_jsx_runtime.jsx)(Thumb, {
					base,
					url: item.cover_url,
					title: item.title,
					kind: "article",
					media: item.media
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.cardBody,
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.cardTitle,
							children: item.title || item.item_key
						}),
						(0, react_jsx_runtime.jsx)(MetaRow, {
							media: item.media,
							author: item.author_name,
							time: item.added_at
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.cardActions,
							children: [(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "打开原文",
								primary: true,
								disabled: anyBusy || item.content_url === "",
								onClick: () => {
									openItem(base, {
										content_id: item.content_id,
										article_id: articleId(item),
										content_url: item.content_url,
										media: item.media,
										title: item.title
									}, (error) => {
										setStatus("原文已打开，但阅读记录未确认保存：" + (error instanceof Error ? error.message : String(error)));
									});
								}
							}), (0, react_jsx_runtime.jsx)(ActionButton, {
								label: "移除",
								danger: true,
								disabled: anyBusy,
								onClick: () => onRemove(item.item_key)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.savedFeedbackRow,
							children: [
								(0, react_jsx_runtime.jsx)(ActionButton, {
									label: "喜欢",
									disabled: anyBusy,
									onClick: () => void feedback("like")
								}),
								(0, react_jsx_runtime.jsx)(ActionButton, {
									label: "不感兴趣",
									disabled: anyBusy,
									onClick: () => void feedback("dislike")
								}),
								(0, react_jsx_runtime.jsx)(ActionButton, {
									label: "聊一聊",
									disabled: anyBusy,
									onClick: comment
								}),
								(0, react_jsx_runtime.jsx)(ActionButton, {
									label: otherKind === "favorite" ? otherSaved ? "取消收藏" : "收藏" : otherSaved ? "取消稍后读" : "稍后读",
									disabled: anyBusy || otherSaved === null,
									onClick: () => void toggleOther()
								})
							]
						}),
						status !== "" ? (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.feedbackStatus,
							children: status
						}) : null
					]
				})]
			});
		}
		function SavedList(props) {
			const { base, listKind } = props;
			const [items, setItems] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const [removing, setRemoving] = (0, react.useState)("");
			const reload = (0, react.useCallback)(async () => {
				setError("");
				try {
					setItems((await fetchSaved(base, listKind)).items);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [base, listKind]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const remove = (0, react.useCallback)(async (itemKey) => {
				setRemoving(itemKey);
				try {
					await removeSaved(base, listKind, itemKey);
					await reload();
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setRemoving("");
				}
			}, [
				base,
				listKind,
				reload
			]);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
				items !== null && items.length === 0 ? (0, react_jsx_runtime.jsx)(EmptyState, { text: listKind === "favorite" ? "还没有收藏。" : "还没有稍后读的新闻。" }) : null,
				items?.map((item) => (0, react_jsx_runtime.jsx)(SavedCard, {
					base,
					listKind,
					item,
					removing,
					onRemove: (key) => void remove(key)
				}, item.item_key))
			] });
		}
		function historyLabel(context) {
			if (context === "favorite") return "收藏";
			if (context === "watch_later") return "稍后读";
			if (context === "dismiss" || context === "ignore") return "不再推荐";
			if (context === "dislike") return "不感兴趣";
			return context;
		}
		function HistoryContextBadges({ item }) {
			const contexts = item.contexts.length > 0 ? item.contexts : item.context !== "" ? [{
				context: item.context,
				occurred_at: item.occurred_at,
				restored: item.restored
			}] : [];
			if (contexts.length === 0) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.badgeRow,
				children: contexts.map((context) => (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.contextBadge,
					"data-kind": context.restored ? "restored" : void 0,
					children: [historyLabel(context.context), context.restored ? " · 已恢复" : ""]
				}, `${context.context}:${context.occurred_at}`))
			});
		}
		function HistoryList({ base }) {
			const [category, setCategory] = (0, react.useState)("clicked");
			const [items, setItems] = (0, react.useState)(null);
			const [total, setTotal] = (0, react.useState)(0);
			const [cursor, setCursor] = (0, react.useState)("");
			const [hasMore, setHasMore] = (0, react.useState)(false);
			const [loadingMore, setLoadingMore] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const load = (0, react.useCallback)(async (nextCursor = "", append = false) => {
				setError("");
				try {
					const page = await fetchContentHistory(base, category, nextCursor);
					setItems((previous) => append && previous !== null ? [...previous, ...page.items] : page.items);
					setTotal(page.total);
					setCursor(page.nextCursor);
					setHasMore(page.hasMore);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [base, category]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const loadMore = (0, react.useCallback)(async () => {
				if (!hasMore || loadingMore) return;
				setLoadingMore(true);
				await load(cursor, true);
				setLoadingMore(false);
			}, [
				cursor,
				hasMore,
				load,
				loadingMore
			]);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.subTabs,
					children: HISTORY_CATEGORIES.map((row) => (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.subTab,
						"data-active": category === row.key,
						onClick: () => setCategory(row.key),
						children: row.label
					}, row.key))
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.hint,
					children: [
						"近 30 天 · 共 ",
						total,
						" 条"
					]
				}),
				error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
				items !== null && items.length === 0 ? (0, react_jsx_runtime.jsx)(EmptyState, { text: "这个分类还没有记录。" }) : null,
				items?.map((item) => (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.card,
					children: [(0, react_jsx_runtime.jsx)(Thumb, {
						base,
						url: item.cover_url,
						title: item.title,
						kind: "article",
						media: item.media
					}), (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.cardBody,
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardTitle,
								children: item.title || item.body_text.slice(0, 60) || item.item_key
							}),
							(0, react_jsx_runtime.jsx)(MetaRow, {
								media: item.media,
								author: item.author_name,
								time: item.occurred_at
							}),
							(0, react_jsx_runtime.jsx)(HistoryContextBadges, { item }),
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardActions,
								children: (0, react_jsx_runtime.jsx)(ActionButton, {
									label: "打开原文",
									primary: true,
									disabled: item.content_url === "",
									onClick: () => {
										openItem(base, {
											recommendation_id: item.recommendation_id ?? void 0,
											content_id: item.content_id,
											article_id: item.content_id !== "" ? item.content_id : item.item_key,
											content_url: item.content_url,
											media: item.media,
											title: item.title
										}, (cause) => {
											setError("原文已打开，但阅读记录未确认保存：" + (cause instanceof Error ? cause.message : String(cause)));
										});
									}
								})
							})
						]
					})]
				}, `${item.item_key}:${item.occurred_at}`)),
				hasMore ? (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.loadMore,
					disabled: loadingMore,
					onClick: () => void loadMore(),
					children: loadingMore ? "加载中…" : "加载更多"
				}) : null
			] });
		}
		function monitorStatus(status) {
			if (status === "active") return "监控中";
			if (status === "paused") return "已暂停";
			if (status === "retry_wait") return "等待重试";
			if (status === "needs_attention") return "需要处理";
			return status || "状态未知";
		}
		function shortTime(value) {
			if (value === "") return "尚未检查";
			const parsed = new Date(value);
			return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		function MonitorHistoryFold({ history }) {
			const meaningful = history.diffs.filter((item) => item.classification === "meaningful").slice(0, 3);
			const totalVersions = Math.max(history.monitor.current_version, history.versions.length);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.monitorHistory,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.monitorHistoryHead,
					children: [
						"已留存 ",
						totalVersions,
						" 个版本"
					]
				}), meaningful.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.monitorQuiet,
					children: "还没有确认的正文变化。"
				}) : meaningful.map((item) => (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.monitorDiff,
					children: [(0, react_jsx_runtime.jsx)("span", { children: item.summary || "正文发生变化" }), (0, react_jsx_runtime.jsx)("time", { children: shortTime(item.created_at) })]
				}, item.diff_id))]
			});
		}
		function WebMonitoringView({ base }) {
			const [items, setItems] = (0, react.useState)(null);
			const [url, setUrl] = (0, react.useState)("");
			const [label, setLabel] = (0, react.useState)("");
			const [adding, setAdding] = (0, react.useState)(false);
			const [busyIds, setBusyIds] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [error, setError] = (0, react.useState)("");
			const [status, setStatus] = (0, react.useState)("");
			const [expanded, setExpanded] = (0, react.useState)("");
			const [history, setHistory] = (0, react.useState)({});
			const [historyErrors, setHistoryErrors] = (0, react.useState)({});
			const actionIds = (0, react.useRef)(/* @__PURE__ */ new Map());
			const reloadGeneration = (0, react.useRef)(0);
			const busyIdsRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const expandedRef = (0, react.useRef)("");
			const historySignatures = (0, react.useRef)(/* @__PURE__ */ new Map());
			const historyLoadGenerations = (0, react.useRef)(/* @__PURE__ */ new Map());
			expandedRef.current = expanded;
			const setMonitorBusy = (0, react.useCallback)((monitorId, value) => {
				const next = new Set(busyIdsRef.current);
				if (value) next.add(monitorId);
				else next.delete(monitorId);
				busyIdsRef.current = next;
				setBusyIds(next);
			}, []);
			const reload = (0, react.useCallback)(async () => {
				const generation = ++reloadGeneration.current;
				setError("");
				try {
					const next = await fetchWebMonitors(base);
					if (generation === reloadGeneration.current) setItems(next);
				} catch (cause) {
					if (generation === reloadGeneration.current) setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
				const interval = window.setInterval(() => {
					reload();
				}, 3e4);
				return () => {
					window.clearInterval(interval);
					reloadGeneration.current += 1;
				};
			}, [reload]);
			const add = (0, react.useCallback)(async () => {
				const target = url.trim();
				if (target === "" || adding) return;
				setAdding(true);
				setError("");
				setStatus("正在读取正文并建立首个基线…");
				try {
					const created = await createWebMonitor(base, {
						url: target,
						label: label.trim(),
						requestId: stableId()
					});
					setUrl("");
					setLabel("");
					if (created.initialCheckStatus === "baseline" || created.item.has_baseline) setStatus("已建立基线；以后只有正文发生真实变化才会提醒。");
					else setStatus("监控已保存，但首次读取没有建立基线；可在列表中查看原因并重新检查。");
					await reload();
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
					setStatus("");
				} finally {
					setAdding(false);
				}
			}, [
				adding,
				base,
				label,
				reload,
				url
			]);
			const act = (0, react.useCallback)(async (item, action) => {
				if (busyIdsRef.current.has(item.monitor_id)) return;
				if (action === "remove" && !window.confirm(`移除“${item.label || item.display_url}”的监控？历史版本不会删除。`)) return;
				const key = `${item.monitor_id}:${action}`;
				let requestId = actionIds.current.get(key);
				if (requestId === void 0) {
					requestId = stableId();
					actionIds.current.set(key, requestId);
				}
				setMonitorBusy(item.monitor_id, true);
				setError("");
				setStatus(action === "check" ? "正在检查正文变化…" : "");
				try {
					const checkResult = action === "check" ? await checkWebMonitor(base, item.monitor_id, requestId) : null;
					if (action !== "check") await setWebMonitorState(base, item.monitor_id, action);
					actionIds.current.delete(key);
					const historyWasOpen = expandedRef.current === item.monitor_id;
					if (action === "check" && historyWasOpen) {
						setHistory((previous) => {
							const next = { ...previous };
							delete next[item.monitor_id];
							return next;
						});
						setHistoryErrors((previous) => {
							const next = { ...previous };
							delete next[item.monitor_id];
							return next;
						});
					}
					await reload();
					if (action === "check" && historyWasOpen) try {
						const refreshed = await fetchWebMonitorHistory(base, item.monitor_id);
						historySignatures.current.set(item.monitor_id, `${refreshed.monitor.current_version}:${refreshed.monitor.change_count}`);
						setHistory((previous) => ({
							...previous,
							[item.monitor_id]: refreshed
						}));
						setHistoryErrors((previous) => {
							const next = { ...previous };
							delete next[item.monitor_id];
							return next;
						});
					} catch (historyError) {
						const message = historyError instanceof Error ? historyError.message : String(historyError);
						setHistoryErrors((previous) => ({
							...previous,
							[item.monitor_id]: message
						}));
						setError("检查已完成，但版本列表刷新失败：" + message);
					}
					if (action === "check") {
						const checkStatus = checkResult?.status ?? "";
						if (checkStatus === "changed") setStatus("发现正文变化，已写入事件档案和消息。");
						else if (checkStatus === "baseline") setStatus("已建立正文基线。");
						else if (checkStatus === "unchanged" || checkStatus === "noise_only") setStatus("检查完成，正文没有确认变化。");
						else if (checkStatus === "retry_wait") {
							setStatus("本次读取失败，系统会自动重试。");
							setError(checkResult?.error || "本次读取失败，系统会自动重试。");
						} else if (checkStatus === "failed") {
							setStatus("本次检查失败，需要处理。");
							setError(checkResult?.error || "本次检查失败，需要处理。");
						} else if (checkStatus === "cancelled") setStatus("本次检查已取消。");
						else {
							setStatus("");
							setError("检查结果状态未知，请刷新后查看。");
						}
					} else setStatus("");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
					setStatus("");
				} finally {
					setMonitorBusy(item.monitor_id, false);
				}
			}, [
				base,
				history,
				reload,
				setMonitorBusy
			]);
			const toggleHistory = (0, react.useCallback)(async (item, force = false) => {
				const monitorId = item.monitor_id;
				if (busyIdsRef.current.has(monitorId)) return;
				if (expandedRef.current === monitorId && !force) {
					const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1;
					historyLoadGenerations.current.set(monitorId, generation);
					expandedRef.current = "";
					setExpanded("");
					return;
				}
				expandedRef.current = monitorId;
				setExpanded(monitorId);
				const generation = (historyLoadGenerations.current.get(monitorId) ?? 0) + 1;
				historyLoadGenerations.current.set(monitorId, generation);
				historySignatures.current.delete(monitorId);
				setHistory((previous) => {
					const next = { ...previous };
					delete next[monitorId];
					return next;
				});
				setHistoryErrors((previous) => {
					const next = { ...previous };
					delete next[monitorId];
					return next;
				});
				setMonitorBusy(monitorId, true);
				try {
					const value = await fetchWebMonitorHistory(base, monitorId);
					if (historyLoadGenerations.current.get(monitorId) !== generation) return;
					historySignatures.current.set(monitorId, `${value.monitor.current_version}:${value.monitor.change_count}`);
					setHistory((previous) => ({
						...previous,
						[monitorId]: value
					}));
				} catch (cause) {
					if (historyLoadGenerations.current.get(monitorId) !== generation) return;
					setHistoryErrors((previous) => ({
						...previous,
						[monitorId]: cause instanceof Error ? cause.message : String(cause)
					}));
				} finally {
					setMonitorBusy(monitorId, false);
				}
			}, [base, setMonitorBusy]);
			(0, react.useEffect)(() => {
				if (expanded === "" || items === null || busyIds.has(expanded)) return;
				const item = items.find((row) => row.monitor_id === expanded);
				const cached = history[expanded];
				if (item === void 0 || cached === void 0) return;
				if (item.current_version > cached.monitor.current_version || item.change_count > cached.monitor.change_count) toggleHistory(item, true);
			}, [
				busyIds,
				expanded,
				history,
				items,
				toggleHistory
			]);
			const totalChanges = items?.reduce((sum, item) => sum + item.change_count, 0) ?? 0;
			const attention = items?.filter((item) => item.status === "needs_attention" || item.status === "retry_wait").length ?? 0;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.monitoring,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.monitorIntro,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: "盯住变化，不重复读整篇" }), (0, react_jsx_runtime.jsx)("span", { children: "添加公开网页或 PDF；首轮只建基线，之后正文真变了才进入事件档案。" })]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.monitorForm,
						children: [
							(0, react_jsx_runtime.jsx)("input", {
								"aria-label": "网页或 PDF 地址",
								placeholder: "粘贴公开网页或 PDF 地址",
								value: url,
								onChange: (event) => setUrl(event.currentTarget.value)
							}),
							(0, react_jsx_runtime.jsx)("input", {
								"aria-label": "监控名称",
								placeholder: "名称（可不填）",
								value: label,
								onChange: (event) => setLabel(event.currentTarget.value)
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: adding || url.trim() === "",
								onClick: () => void add(),
								children: adding ? "建立中…" : "开始监控"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.monitorStats,
						children: [items === null ? (0, react_jsx_runtime.jsx)("span", { children: "记录尚未载入" }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsxs)("span", { children: [items.length, " 个监控"] }),
							(0, react_jsx_runtime.jsxs)("span", { children: [totalChanges, " 次确认变化"] }),
							(0, react_jsx_runtime.jsxs)("span", { children: [attention, " 个待处理"] })
						] }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: adding,
							onClick: () => void reload(),
							children: "刷新"
						})]
					}),
					status !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.monitorQuiet,
						children: status
					}) : null,
					error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
					items !== null && items.length === 0 ? (0, react_jsx_runtime.jsx)(EmptyState, { text: "还没有网页监控。先添加一个经常更新的政策页、公告页或 PDF。" }) : null,
					items?.map((item) => {
						const itemBusy = busyIds.has(item.monitor_id);
						const folded = history[item.monitor_id];
						const historyError = historyErrors[item.monitor_id] ?? "";
						return (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.monitorCard,
							"data-status": item.status,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.monitorTop,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.monitorState,
										children: monitorStatus(item.status)
									}), (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.monitorMetrics,
										children: [
											"V",
											item.current_version || "—",
											" · ",
											item.change_count,
											" 次变化"
										]
									})]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.monitorTitle,
									children: item.label || item.display_url
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.monitorUrl,
									children: item.display_url
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.monitorMeta,
									children: [
										"上次成功：",
										shortTime(item.last_success_at),
										" · 下次：",
										shortTime(item.next_check_at)
									]
								}),
								item.last_error !== "" ? (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.monitorError,
									children: item.last_error
								}) : null,
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.monitorActions,
									children: [
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: itemBusy || item.status === "paused",
											onClick: () => void act(item, "check"),
											children: "立即检查"
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: itemBusy,
											onClick: () => void act(item, item.status === "paused" ? "resume" : "pause"),
											children: item.status === "paused" ? "继续" : "暂停"
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: itemBusy,
											onClick: () => void toggleHistory(item),
											children: expanded === item.monitor_id ? "收起版本" : "版本记录"
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: itemBusy,
											onClick: () => void act(item, "remove"),
											children: "移除"
										})
									]
								}),
								expanded === item.monitor_id ? folded !== void 0 ? (0, react_jsx_runtime.jsx)(MonitorHistoryFold, { history: folded }) : historyError !== "" ? (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.monitorHistoryError,
									children: [(0, react_jsx_runtime.jsx)("span", { children: historyError }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void toggleHistory(item, true),
										children: "重新读取"
									})]
								}) : (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.monitorQuiet,
									children: "正在读取版本…"
								}) : null
							]
						}, item.monitor_id);
					})
				]
			});
		}
		function LibraryView({ base }) {
			const [tab, setTab] = (0, react.useState)("watch_later");
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.subTabs,
					children: LIBRARY_TABS.map((row) => (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.subTab,
						"data-active": tab === row.key,
						onClick: () => setTab(row.key),
						children: row.label
					}, row.key))
				}),
				tab === "watch_later" ? (0, react_jsx_runtime.jsx)(SavedList, {
					base,
					listKind: "watch_later"
				}, `later-${base}`) : null,
				tab === "favorite" ? (0, react_jsx_runtime.jsx)(SavedList, {
					base,
					listKind: "favorite"
				}, `favorite-${base}`) : null,
				tab === "history" ? (0, react_jsx_runtime.jsx)(HistoryList, { base }, `history-${base}`) : null,
				tab === "monitoring" ? (0, react_jsx_runtime.jsx)(WebMonitoringView, { base }, `monitoring-${base}`) : null
			] });
		}
		//#endregion
		//#region lib/types/client/dialogue.js
		/**
		* 对话 view — mirrors the canonical dialogue surface: pending confirmations
		* (待聊确认), hypothesis cards with optimistic four-state actions
		* (准/不准/聊聊/稍后) and state labels, the 聊聊 → dialogue-context flow
		* (subsequent messages reply to the card), and durable chat turns.
		* @module @newsclaw/dsh-plugin
		*/
		const CHAT_SESSION = "dsh";
		const CONTEXT_KEY = "newsclaw.dialogue-context";
		function readContext() {
			try {
				const raw = localStorage.getItem(CONTEXT_KEY);
				if (raw === null) return null;
				const parsed = JSON.parse(raw);
				if (typeof parsed.turnId === "string" && parsed.turnId !== "") return {
					turnId: parsed.turnId,
					title: typeof parsed.title === "string" ? parsed.title : "",
					kind: parsed.kind === "confusion" ? "confusion" : "hypothesis",
					...typeof parsed.observation === "string" ? { observation: parsed.observation } : {},
					...typeof parsed.interpretation === "string" ? { interpretation: parsed.interpretation } : {}
				};
				return null;
			} catch {
				return null;
			}
		}
		function writeContext(sel) {
			try {
				if (sel === null) localStorage.removeItem(CONTEXT_KEY);
				else localStorage.setItem(CONTEXT_KEY, JSON.stringify(sel));
			} catch {}
		}
		/** Terminal card states hide the action set (same as the shared helper). */
		const TERMINAL_CARD_STATES = /* @__PURE__ */ new Set([
			"confirmed",
			"rejected",
			"revised",
			"deferred"
		]);
		/** Canonical state labels (mobile/popup shared helper). */
		const CARD_STATE_LABELS = {
			confirmed: "已确认",
			rejected: "已标记不准",
			revised: "已按你的修正记下",
			discussing: "正在聊这条",
			deferred: "已稍后再聊",
			processing: "正在处理，以后端结算为准",
			retryable_error: "处理结果暂未同步，可刷新或重试"
		};
		/** Canonical action labels (popup uses short pills). */
		const CARD_ACTIONS = [
			{
				action: "confirm",
				label: "准"
			},
			{
				action: "reject",
				label: "不准"
			},
			{
				action: "discuss",
				label: "聊聊"
			},
			{
				action: "defer",
				label: "稍后"
			}
		];
		/** Optimistic next state per action (shared helper's applyOptimisticCardAction). */
		const OPTIMISTIC_STATE = {
			confirm: "confirmed",
			reject: "rejected",
			discuss: "discussing",
			defer: "deferred"
		};
		/** Read the durable card state (defaults to pending). */
		function cardState(turn) {
			const state = typeof turn.payload?.state === "string" ? turn.payload.state : "";
			return state !== "" ? state : "pending";
		}
		/** Poll one pending turn until it settles. */
		async function waitForTurn(base, turnId, signal) {
			for (let attempt = 0; attempt < 60; attempt += 1) {
				if (signal?.aborted === true) throw new Error("已取消");
				const turn = await fetchChatTurn(base, turnId, signal);
				if (turn.status !== "pending") return turn;
				await new Promise((resolve) => window.setTimeout(resolve, 2e3));
			}
			throw new Error("对话回合等待超时");
		}
		/** One pending confirmation row (待聊确认 panel, canonical pending-item). */
		function ConfirmationItem(props) {
			const { base, item, onOpened, onError } = props;
			const [busy, setBusy] = (0, react.useState)(false);
			const open = (0, react.useCallback)(async () => {
				setBusy(true);
				try {
					const turn = await openPendingConfirmation(base, item.ref);
					onOpened(turn);
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [
				base,
				item.ref,
				onError,
				onOpened
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.pendingItem,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.pendingCopy,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.pendingKind,
							children: item.kind === "confusion" ? "有点疑惑" : "想确认"
						}),
						(0, react_jsx_runtime.jsx)("strong", { children: item.title !== "" ? item.title : item.ref }),
						item.observation !== "" ? (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.pendingObservation,
							children: item.observation
						}) : null,
						item.interpretation !== "" ? (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.pendingInterpretation,
							children: item.interpretation
						}) : null,
						item.confidence > 0 ? (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.pendingConfidence,
							children: [Math.round(item.confidence * 100), "%"]
						}) : null
					]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.pendingOpen,
					disabled: busy,
					onClick: () => void open(),
					children: busy ? "打开中…" : "打开"
				})]
			});
		}
		/** One hypothesis card turn with optimistic four-state actions. */
		function CardTurnBlock(props) {
			const { base, turn, onDiscuss, onChanged, onError } = props;
			const [state, setState] = (0, react.useState)(() => cardState(turn));
			const [busy, setBusy] = (0, react.useState)("");
			const payload = turn.payload ?? {};
			const title = typeof payload.title === "string" && payload.title !== "" ? payload.title : turn.subject_title !== "" ? turn.subject_title : "这条猜测";
			const evidence = Array.isArray(payload.evidence_refs) ? payload.evidence_refs.map(String).filter(Boolean) : [];
			const terminal = TERMINAL_CARD_STATES.has(state);
			const act = (0, react.useCallback)(async (action) => {
				setBusy(action);
				setState(OPTIMISTIC_STATE[action] ?? cardState(turn));
				try {
					const response = await actOnChatCard(base, turn.turn_id, action);
					const verdict = typeof response === "object" && response !== null ? String(response.state ?? response.verdict ?? "").toLowerCase() : "";
					if (verdict !== "") setState(verdict);
					if (action === "discuss") onDiscuss(turn);
					onChanged();
				} catch (err) {
					setState(cardState(turn));
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				onChanged,
				onDiscuss,
				onError,
				turn
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.dialogueCard,
				"data-card-state": state,
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogueKicker,
						children: "新闻爪的猜测"
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogueTitle,
						children: title
					}),
					evidence.length > 0 ? (0, react_jsx_runtime.jsxs)("details", {
						className: panel_module_css_default.dialogueEvidence,
						children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
							"依据（",
							evidence.length,
							"）"
						] }), (0, react_jsx_runtime.jsx)("ul", { children: evidence.slice(0, 5).map((line, i) => (0, react_jsx_runtime.jsx)("li", { children: line }, i)) })]
					}) : null,
					CARD_STATE_LABELS[state] !== void 0 && CARD_STATE_LABELS[state] !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogueState,
						role: "status",
						children: CARD_STATE_LABELS[state]
					}) : null,
					!terminal ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogueActions,
						"aria-label": "确认这条猜测",
						children: CARD_ACTIONS.map((entry) => (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.dialogueAction} ${panel_module_css_default[`action_${entry.action}`] ?? ""}`,
							disabled: busy !== "" || state === "discussing" && entry.action === "discuss",
							onClick: () => void act(entry.action),
							children: entry.label
						}, entry.action))
					}) : null
				]
			});
		}
		/** 对话 tab. */
		function ChatView(props) {
			const { base } = props;
			const [turns, setTurns] = (0, react.useState)(null);
			const [confirmations, setConfirmations] = (0, react.useState)(null);
			const [confirmOpen, setConfirmOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [draft, setDraft] = (0, react.useState)("");
			const [sending, setSending] = (0, react.useState)(false);
			const [context, setContextState] = (0, react.useState)(() => readContext());
			const setContext = (0, react.useCallback)((sel) => {
				writeContext(sel);
				setContextState(sel);
			}, []);
			const scrollRef = (0, react.useRef)(null);
			const turnIds = (0, react.useRef)(/* @__PURE__ */ new Map());
			const reload = (0, react.useCallback)(async () => {
				setError("");
				const [history, pending] = await Promise.allSettled([fetchChatTurns(base, CHAT_SESSION), fetchPendingConfirmations(base)]);
				if (history.status === "fulfilled") setTurns(history.value);
				if (pending.status === "fulfilled") setConfirmations(pending.value);
				if (history.status === "rejected" && pending.status === "rejected") setError("对话与待聊确认都读取失败，请稍后重试。");
				else if (history.status === "rejected") setError("待聊确认已读取，但对话记录读取失败：" + (history.reason instanceof Error ? history.reason.message : String(history.reason)));
				else if (pending.status === "rejected") setError("对话记录已读取，但待聊确认读取失败：" + (pending.reason instanceof Error ? pending.reason.message : String(pending.reason)));
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			(0, react.useEffect)(() => {
				const el = scrollRef.current;
				if (el !== null) el.scrollTop = el.scrollHeight;
			}, [turns, sending]);
			/** Start one durable turn (optionally bound to the discussion context). */
			const send = (0, react.useCallback)(async () => {
				const message = draft.trim();
				if (message === "" || sending) return;
				setSending(true);
				setError("");
				const requestKey = `${context?.turnId ?? ""}:${message}`;
				let turnId = turnIds.current.get(requestKey);
				if (turnId === void 0) {
					turnId = `dsh-${stableId()}`;
					turnIds.current.set(requestKey, turnId);
				}
				const optimistic = {
					turn_id: turnId,
					session: CHAT_SESSION,
					scope: "chat",
					message,
					reply: "",
					status: "pending",
					error: "",
					subject_title: "",
					reply_to_turn_id: context?.turnId
				};
				setTurns((prev) => [...prev ?? [], optimistic]);
				setDraft("");
				try {
					const started = await startChatTurn(base, message, CHAT_SESSION, context?.turnId, turnId);
					setTurns((prev) => [...(prev ?? []).filter((t) => t.turn_id !== optimistic.turn_id), started]);
					const settled = await waitForTurn(base, started.turn_id);
					setTurns((prev) => (prev ?? []).map((t) => t.turn_id === started.turn_id ? settled : t));
					turnIds.current.delete(requestKey);
					await reload();
				} catch (err) {
					setTurns((prev) => (prev ?? []).filter((t) => t.turn_id !== optimistic.turn_id));
					setDraft((current) => current === "" ? message : current);
					const friendly = err instanceof ApiError && err.status === 409 ? "这条上下文已经失效（卡片可能已结算，或另开了一条讨论）。点「清除」后重发，或回到卡片重新点「聊聊」。" : err instanceof Error ? err.message : String(err);
					await reload().catch(() => void 0);
					setError(friendly);
				} finally {
					setSending(false);
				}
			}, [
				base,
				context,
				draft,
				reload,
				sending
			]);
			const onKeyDown = (0, react.useCallback)((event) => {
				if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
					event.preventDefault();
					send();
				}
			}, [send]);
			const visibleTurns = turns?.filter((t) => t.message !== "" || t.reply !== "" || t.payload !== void 0 && Object.keys(t.payload).length > 0) ?? null;
			const cardTurns = visibleTurns?.filter((t) => t.payload !== void 0 && t.payload.type === "card") ?? [];
			const activeCardTurns = cardTurns.filter((t) => !TERMINAL_CARD_STATES.has(cardState(t)));
			const handledCardCount = cardTurns.length - activeCardTurns.length;
			const questionTurns = visibleTurns?.filter((t) => t.payload !== void 0 && t.payload.type === "question") ?? [];
			const plainTurns = visibleTurns?.filter((t) => !cardTurns.includes(t) && !questionTurns.includes(t)) ?? [];
			/** Resolve the card a bound reply belongs to (canonical reply-quote). */
			const targetOf = (turn) => {
				const replyTo = turn.reply_to_turn_id ?? "";
				if (replyTo === "") return null;
				const target = cardTurns.find((c) => c.turn_id === replyTo);
				if (target === void 0) return null;
				return { title: typeof target.payload?.title === "string" && target.payload.title !== "" ? target.payload.title : target.subject_title };
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.hint,
							children: "苏格拉底式对话 · 自动反馈进画像"
						}),
						(0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.spacer }),
						(0, react_jsx_runtime.jsx)(ActionButton, {
							label: "刷新",
							disabled: sending,
							onClick: () => void reload()
						})
					]
				}),
				error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
				confirmations !== null && confirmations.items.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.confirmPanel,
					children: [(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.confirmToggle,
						onClick: () => setConfirmOpen((open) => !open),
						children: ["待聊确认", (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.confirmCount,
							children: confirmations.items.length
						})]
					}), confirmOpen ? confirmations.items.map((item) => (0, react_jsx_runtime.jsx)(ConfirmationItem, {
						base,
						item,
						onOpened: (turn) => {
							if (turn.payload?.type === "question") setContext({
								turnId: turn.turn_id,
								title: turn.subject_title !== "" ? turn.subject_title : "这条疑惑",
								kind: "confusion",
								observation: item.observation,
								interpretation: item.interpretation
							});
							reload();
						},
						onError: setError
					}, item.ref)) : null]
				}) : null,
				(0, react_jsx_runtime.jsxs)("div", {
					ref: scrollRef,
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10,
						overflowY: "auto",
						minHeight: 0,
						flex: 1
					},
					children: [
						plainTurns !== null && plainTurns.length === 0 && activeCardTurns.length === 0 ? (0, react_jsx_runtime.jsx)(EmptyState, { text: "还没有对话。聊聊你最近在看什么、对什么好奇，NewsClaw 会边聊边更新你的画像。" }) : null,
						handledCardCount > 0 ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.hint,
							style: { textAlign: "center" },
							children: [
								"已处理 ",
								handledCardCount,
								" 张确认卡"
							]
						}) : null,
						questionTurns.map((turn) => {
							const ctx = context !== null && context.turnId === turn.turn_id ? context : null;
							return (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.questionCard,
								children: [
									(0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.dialogueKicker,
										children: "有点疑惑"
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.dialogueTitle,
										children: turn.subject_title !== "" ? turn.subject_title : "这条疑惑"
									}),
									ctx !== null && ctx.observation !== void 0 && ctx.observation !== "" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.questionObservation,
										children: ctx.observation
									}) : null,
									ctx !== null && ctx.interpretation !== void 0 && ctx.interpretation !== "" ? (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.questionInterpretation,
										children: ["它自己的理解：", ctx.interpretation]
									}) : null,
									turn.reply !== "" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnSoul,
										style: { maxWidth: "100%" },
										children: turn.reply
									}) : null,
									turn.status === "pending" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnStatus,
										children: "思考中…"
									}) : null
								]
							}, turn.turn_id);
						}),
						activeCardTurns.map((turn) => (0, react_jsx_runtime.jsx)(CardTurnBlock, {
							base,
							turn,
							onDiscuss: (target) => setContext({
								turnId: target.turn_id,
								title: typeof target.payload?.title === "string" ? target.payload.title : target.subject_title,
								kind: "hypothesis"
							}),
							onChanged: () => void reload(),
							onError: setError
						}, turn.turn_id)),
						plainTurns.map((turn) => {
							const quote = targetOf(turn);
							return (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.turn,
								children: [
									quote !== null ? (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.replyQuote,
										children: [(0, react_jsx_runtime.jsx)("span", { children: "回复新闻爪的猜测" }), (0, react_jsx_runtime.jsx)("strong", {
											title: quote.title,
											children: quote.title
										})]
									}) : null,
									(0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnUser,
										children: turn.message
									}),
									turn.reply !== "" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnSoul,
										children: turn.reply
									}) : null,
									turn.status === "pending" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnStatus,
										children: "思考中…"
									}) : null,
									turn.status === "error" ? (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.turnStatus,
										children: ["出错：", turn.error !== "" ? turn.error : "未知"]
									}) : null,
									turn.updated_at !== void 0 && turn.updated_at !== "" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.turnStatus,
										children: formatTime(turn.updated_at)
									}) : null
								]
							}, turn.turn_id);
						})
					]
				}),
				context !== null ? (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.contextBar,
					role: "status",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextBarHead,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.contextLabel,
								children: context.kind === "confusion" ? "正在回复“有点疑惑”" : "正在回复新闻爪的猜测"
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.contextClear,
								onClick: () => setContext(null),
								children: "清除"
							})]
						}),
						(0, react_jsx_runtime.jsx)("strong", {
							className: panel_module_css_default.contextTitle,
							title: context.title,
							children: context.title
						}),
						context.kind === "confusion" && context.observation !== void 0 && context.observation !== "" ? (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.contextObservation,
							children: context.observation
						}) : null,
						context.kind === "confusion" && context.interpretation !== void 0 && context.interpretation !== "" ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.contextInterpretation,
							children: ["它自己的理解：", context.interpretation]
						}) : null
					]
				}) : null,
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.chatInputRow,
					children: [(0, react_jsx_runtime.jsx)("textarea", {
						className: panel_module_css_default.chatInput,
						rows: 2,
						placeholder: "聊聊你最近对什么感兴趣…",
						value: draft,
						disabled: sending,
						onChange: (event) => setDraft(event.target.value),
						onKeyDown
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.chatSend,
						disabled: sending || draft.trim() === "",
						onClick: () => void send(),
						children: "发送"
					})]
				})
			] });
		}
		//#endregion
		//#region lib/types/client/profile.js
		/**
		* 画像 view — the popup's profile-card structure: view intro, portrait
		* summary, layer headers (Core/Values/Interest/Role/Surface), group cards
		* with chips / MBTI bars / interest trees / style bars, speculative probes,
		* insight cards with confidence bars, and the awareness list.
		* @module @newsclaw/dsh-plugin
		*/
		/** Split the portrait prose into breathing paragraphs (~2 sentences each). */
		function portraitParagraphs(text) {
			const sentences = text.replace(/([。!?！？])\s*/g, "$1").split("").map((s) => s.trim()).filter(Boolean);
			const paragraphs = [];
			let bucket = "";
			for (const sentence of sentences) {
				bucket += sentence;
				if (bucket.length >= 60) {
					paragraphs.push(bucket);
					bucket = "";
				}
			}
			if (bucket !== "") paragraphs.push(bucket);
			return paragraphs.length > 0 ? paragraphs : [text];
		}
		/** Chips row (tone: brand/success/danger/default). */
		function Chips(props) {
			if (props.chips.length === 0) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.chipRow,
				children: props.chips.map((chip) => (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.chip,
					"data-tone": props.tone,
					children: chip
				}, chip))
			});
		}
		/** One profile group card (popup .profile-group). */
		function Group(props) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.profileGroup,
				children: [props.title !== void 0 ? (0, react_jsx_runtime.jsx)("h3", { children: props.title }) : null, props.children]
			});
		}
		/** Uppercase layer divider (popup .profile-layer-header). */
		function Layer(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.profileLayer,
				children: props.label
			});
		}
		/** MBTI display: big type label + confidence pill + dimension bars. */
		function MbtiBlock(props) {
			const { mbti } = props;
			if (mbti.type === "") return null;
			const dimensions = mbti.dimensions !== void 0 ? Object.entries(mbti.dimensions) : [];
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.mbtiContainer,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.mbtiTypeRow,
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.mbtiTypeLabel,
						children: mbti.type
					}), (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.mbtiConfidence,
						children: [
							"置信 ",
							Math.round(mbti.confidence * 100),
							"%"
						]
					})]
				}), dimensions.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.mbtiDimensions,
					children: dimensions.map(([dim, val]) => (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.mbtiDimRow,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.mbtiDimPole,
								children: val.pole.slice(0, 1)
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.mbtiDimBar,
								children: (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.mbtiDimBarFill,
									style: { width: `${Math.round(val.strength * 100)}%` }
								})
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.mbtiDimPct,
								children: [Math.round(val.strength * 100), "%"]
							})
						]
					}, dim))
				}) : null]
			});
		}
		/** Interest tree: 喜欢/不喜欢 labelled domain lists with weighted specifics. */
		function InterestTree(props) {
			if (props.domains.length === 0) return null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.interestTree,
				children: [(0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.interestTreeLabel,
					"data-tone": props.tone,
					children: props.label
				}), props.domains.map((domain) => (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.interestDomain,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.interestDomainHeader,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.interestDomainName,
							children: domain.domain
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.interestDomainWeight,
							children: [Math.round(domain.weight * 100), "%"]
						})]
					}), domain.specifics.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.chipRow,
						children: domain.specifics.map((spec) => (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.chip,
							"data-tone": props.tone === "danger" ? "danger" : void 0,
							children: [
								spec.name,
								" ",
								(0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.chipWeight,
									children: [Math.round(spec.weight * 100), "%"]
								})
							]
						}, spec.name))
					}) : null]
				}, domain.domain))]
			});
		}
		/** One percentage bar row (style bars / exploration). */
		function BarRow(props) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.barRow,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.barLabel,
						children: props.label
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.barTrack,
						children: (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.barFill,
							style: { width: `${Math.min(100, Math.max(0, props.pct))}%` }
						})
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.barPct,
						children: [props.pct, "%"]
					})
				]
			});
		}
		/** One speculative probe card (interest or avoidance) with three actions. */
		function ProbeCard(props) {
			const { base, kind, domain, reason, confidence, onAnswered, onError } = props;
			const [busy, setBusy] = (0, react.useState)("");
			const [requestIds] = (0, react.useState)(() => ({
				confirm: stableId(),
				reject: stableId(),
				defer: stableId()
			}));
			const answer = (0, react.useCallback)(async (response) => {
				setBusy(response);
				try {
					const request_id = requestIds[response] ?? stableId();
					if (kind === "interest") await respondInterestProbe(base, {
						domain,
						response,
						request_id
					});
					else await respondAvoidanceProbe(base, {
						domain,
						response,
						request_id
					});
					onAnswered();
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				domain,
				kind,
				onAnswered,
				onError,
				requestIds
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.probe,
				"data-tone": kind,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.probeHead,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.probeDomain,
							children: domain
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.probeConfidence,
							children: [Math.round(confidence * 100), "%"]
						})]
					}),
					reason !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.probeReason,
						children: reason
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.probeActions,
						children: [
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "确实",
								primary: true,
								disabled: busy !== "",
								onClick: () => void answer("confirm")
							}),
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "放一放",
								disabled: busy !== "",
								onClick: () => void answer("defer")
							}),
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "不对",
								danger: true,
								disabled: busy !== "",
								onClick: () => void answer("reject")
							})
						]
					})
				]
			});
		}
		/** One recent cognition update card (popup .cognition-card). */
		function CognitionCard(props) {
			const { item } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const expandable = item.reasoning !== "" || item.evidence !== "" || item.impact !== "";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.cognitionCard,
				"data-expanded": open || void 0,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: panel_module_css_default.cognitionToggle,
					disabled: !expandable,
					onClick: () => setOpen((v) => !v),
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.cognitionSummary,
							children: item.summary !== "" ? item.summary : "新闻爪更新了一条认知"
						}),
						item.context_line !== "" ? (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.cognitionContext,
							children: item.context_line
						}) : null,
						(0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.cognitionMeta,
							children: [item.source_label !== "" ? (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cognitionSource,
								children: item.source_label
							}) : null, item.created_at !== "" ? (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cognitionTime,
								children: formatTime(item.created_at)
							}) : null]
						})
					]
				}), expandable && open ? (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.cognitionDetails,
					children: [
						item.impact !== "" ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.cognitionDetail,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cognitionDetailLabel,
								children: "影响"
							}), item.impact]
						}) : null,
						item.reasoning !== "" ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.cognitionDetail,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cognitionDetailLabel,
								children: "推理"
							}), item.reasoning]
						}) : null,
						item.evidence !== "" ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.cognitionDetail,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cognitionDetailLabel,
								children: "依据"
							}), item.evidence]
						}) : null
					]
				}) : null]
			});
		}
		/** 画像 tab. */
		function ProfileView(props) {
			const { base } = props;
			const [profile, setProfile] = (0, react.useState)(void 0);
			const [cognition, setCognition] = (0, react.useState)({
				items: [],
				hasMore: false,
				nextCursor: ""
			});
			const [cognitionLoading, setCognitionLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const reload = (0, react.useCallback)(async () => {
				setError("");
				try {
					const next = await fetchProfileSummary(base);
					setProfile(next);
					if (next !== null) setCognition({
						items: next.recent_cognition_updates,
						hasMore: next.has_more_cognition_updates,
						nextCursor: next.next_cognition_cursor
					});
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
					setProfile((current) => current === void 0 ? null : current);
				}
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const loadMoreCognition = (0, react.useCallback)(async () => {
				if (!cognition.hasMore || cognitionLoading) return;
				setCognitionLoading(true);
				try {
					const next = await fetchProfileSummary(base, {
						limit: 5,
						cursor: cognition.nextCursor
					});
					if (next === null) return;
					setCognition((prev) => ({
						items: [...prev.items, ...next.recent_cognition_updates],
						hasMore: next.has_more_cognition_updates,
						nextCursor: next.next_cognition_cursor
					}));
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setCognitionLoading(false);
				}
			}, [
				base,
				cognition.hasMore,
				cognition.nextCursor,
				cognitionLoading
			]);
			if (profile === void 0) return (0, react_jsx_runtime.jsx)(EmptyState, { text: "加载中…" });
			if (profile === null) return error !== "" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(ErrorNote, { text: `画像读取失败：${error}` }), (0, react_jsx_runtime.jsx)(ActionButton, {
				label: "重试",
				onClick: () => void reload()
			})] }) : (0, react_jsx_runtime.jsx)(EmptyState, { text: "画像尚未生成，请先在电脑版完成首次设置。" });
			const activeInterests = profile.speculative_interests.filter((p) => p.status === "active");
			const activeAvoidances = profile.speculative_avoidances.filter((p) => p.status === "active");
			const styleBars = [];
			if (profile.style.quality_sensitivity > 0) styleBars.push({
				label: "质量敏感度",
				value: Math.round(profile.style.quality_sensitivity * 100)
			});
			if (profile.style.humor_preference > 0) styleBars.push({
				label: "幽默偏好",
				value: Math.round(profile.style.humor_preference * 100)
			});
			if (profile.style.depth_preference > 0) styleBars.push({
				label: "深度偏好",
				value: Math.round(profile.style.depth_preference * 100)
			});
			const contextRows = [];
			if (profile.context.weekday_patterns !== "") contextRows.push({
				label: "工作日",
				value: profile.context.weekday_patterns
			});
			if (profile.context.weekend_patterns !== "") contextRows.push({
				label: "周末",
				value: profile.context.weekend_patterns
			});
			if (profile.context.time_of_day_patterns !== "") contextRows.push({
				label: "时段",
				value: profile.context.time_of_day_patterns
			});
			if (profile.context.session_type !== "") contextRows.push({
				label: "场景",
				value: profile.context.session_type
			});
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.viewIntro,
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.viewKicker,
							children: "Profile"
						}),
						(0, react_jsx_runtime.jsx)("h2", { children: "我感觉你大概是这样的" }),
						(0, react_jsx_runtime.jsx)("p", { children: "不是光看你点过啥，我主要在看你会为哪种东西停下来。" })
					]
				}),
				error !== "" ? (0, react_jsx_runtime.jsx)(ErrorNote, { text: error }) : null,
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.profileCard,
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.profileSummary,
							children: portraitParagraphs(profile.personality_portrait).map((paragraph, i) => (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.profilePortraitP,
								children: paragraph
							}, i))
						}),
						(0, react_jsx_runtime.jsx)(Layer, { label: "Core — 比较稳定的底色" }),
						(0, react_jsx_runtime.jsx)(Group, {
							title: "核心特质",
							children: (0, react_jsx_runtime.jsx)(Chips, {
								chips: profile.core_traits,
								tone: "brand"
							})
						}),
						profile.deep_needs.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
							title: "深层需求",
							children: (0, react_jsx_runtime.jsx)(Chips, { chips: profile.deep_needs })
						}) : null,
						profile.mbti.type !== "" ? (0, react_jsx_runtime.jsx)(Group, {
							title: "MBTI",
							children: (0, react_jsx_runtime.jsx)(MbtiBlock, { mbti: profile.mbti })
						}) : null,
						profile.values.length > 0 || profile.motivational_drivers.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Layer, { label: "Values — 你在内容里长期在找什么" }),
							profile.values.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "价值偏好",
								children: (0, react_jsx_runtime.jsx)(Chips, {
									chips: profile.values,
									tone: "success"
								})
							}) : null,
							profile.motivational_drivers.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "内在驱动力",
								children: (0, react_jsx_runtime.jsx)(Chips, { chips: profile.motivational_drivers })
							}) : null
						] }) : null,
						profile.likes.length > 0 || profile.dislikes.length > 0 || profile.favorite_sources.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Layer, { label: "Interest — 你最近在看什么" }),
							profile.likes.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "感兴趣的方向",
								children: (0, react_jsx_runtime.jsx)(InterestTree, {
									label: "喜欢",
									tone: "sky",
									domains: profile.likes
								})
							}) : null,
							profile.dislikes.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "明显会避开",
								children: (0, react_jsx_runtime.jsx)(InterestTree, {
									label: "不喜欢",
									tone: "danger",
									domains: profile.dislikes
								})
							}) : null,
							profile.favorite_sources.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "常看的媒体来源",
								children: (0, react_jsx_runtime.jsx)(Chips, {
									chips: profile.favorite_sources,
									tone: "brand"
								})
							}) : null
						] }) : null,
						profile.life_stage !== "" || profile.current_phase !== "" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Layer, { label: "Role — 这阵子的状态" }), (0, react_jsx_runtime.jsxs)(Group, { children: [profile.life_stage !== "" ? (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.profilePhaseCopy,
							children: profile.life_stage
						}) : null, profile.current_phase !== "" ? (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.profilePhaseCopy,
							children: profile.current_phase
						}) : null] })] }) : null,
						profile.cognitive_style.length > 0 || styleBars.length > 0 || contextRows.length > 0 || profile.exploration_openness > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Layer, { label: "Surface — 你怎么看内容" }),
							profile.cognitive_style.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "认知风格",
								children: (0, react_jsx_runtime.jsx)(Chips, { chips: profile.cognitive_style })
							}) : null,
							profile.style.preferred_duration !== "" || profile.style.preferred_pace !== "" ? (0, react_jsx_runtime.jsxs)(Group, {
								title: "口味",
								children: [profile.style.preferred_duration !== "" ? (0, react_jsx_runtime.jsxs)("p", {
									className: panel_module_css_default.profilePhaseCopy,
									children: ["偏好篇幅：", profile.style.preferred_duration]
								}) : null, profile.style.preferred_pace !== "" ? (0, react_jsx_runtime.jsxs)("p", {
									className: panel_module_css_default.profilePhaseCopy,
									children: ["喜欢节奏：", profile.style.preferred_pace]
								}) : null]
							}) : null,
							styleBars.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "偏好",
								children: styleBars.map((bar) => (0, react_jsx_runtime.jsx)(BarRow, {
									label: bar.label,
									pct: bar.value
								}, bar.label))
							}) : null,
							profile.exploration_openness > 0 ? (0, react_jsx_runtime.jsx)(BarRow, {
								label: "探索开放度",
								pct: Math.round(profile.exploration_openness * 100)
							}) : null,
							contextRows.length > 0 ? (0, react_jsx_runtime.jsx)(Group, {
								title: "场景",
								children: contextRows.map((row) => (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.contextRow,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.contextLabel,
										children: row.label
									}), (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.contextValue,
										children: row.value
									})]
								}, row.label))
							}) : null
						] }) : null,
						activeInterests.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Layer, { label: "推测性兴趣" }), activeInterests.map((probe) => (0, react_jsx_runtime.jsx)(ProbeCard, {
							base,
							kind: "interest",
							domain: probe.domain,
							reason: probe.reason,
							confidence: probe.confidence,
							onAnswered: () => void reload(),
							onError: setError
						}, probe.domain))] }) : null,
						activeAvoidances.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Layer, { label: "推测性避雷" }), activeAvoidances.map((probe) => (0, react_jsx_runtime.jsx)(ProbeCard, {
							base,
							kind: "avoidance",
							domain: probe.domain,
							reason: probe.reason,
							confidence: probe.confidence,
							onAnswered: () => void reload(),
							onError: setError
						}, probe.domain))] }) : null,
						cognition.items.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Layer, { label: "新闻爪最近新记住了什么" }),
							cognition.items.map((item) => (0, react_jsx_runtime.jsx)(CognitionCard, { item }, `${item.created_at}:${item.summary}`)),
							cognition.hasMore ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardActions,
								children: (0, react_jsx_runtime.jsx)(ActionButton, {
									label: "加载更早的认知",
									disabled: cognitionLoading,
									onClick: () => void loadMoreCognition()
								})
							}) : null
						] }) : null,
						profile.active_insights.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Layer, { label: "活跃洞察" }), profile.active_insights.map((insight) => (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.insightCard,
							"data-validated": insight.validated || void 0,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.insightHead,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.insightTitle,
										children: insight.hypothesis
									}), insight.validated ? (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.insightValidated,
										children: "✓ 已验证"
									}) : null]
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.insightConfidenceRow,
									children: [(0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.insightConfidenceBar,
										children: (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.insightConfidenceFill,
											style: { width: `${Math.round(insight.confidence * 100)}%` }
										})
									}), (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.insightConfidenceLabel,
										children: [Math.round(insight.confidence * 100), "%"]
									})]
								}),
								insight.evidence.length > 0 ? (0, react_jsx_runtime.jsx)("ul", {
									className: panel_module_css_default.insightEvidenceList,
									children: insight.evidence.map((line, i) => (0, react_jsx_runtime.jsx)("li", { children: line }, i))
								}) : null,
								(0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.insightNote,
									children: "请在「对话」的待聊确认里处理"
								})
							]
						}, insight.hypothesis))] }) : null,
						profile.recent_awareness.length > 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Layer, { label: "最近的觉察" }), (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.awarenessList,
							children: profile.recent_awareness.map((note) => (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.awarenessItem,
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.awarenessHeader,
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.awarenessItemDate,
											children: note.date !== "" ? note.date.slice(5, 10) : ""
										}), note.emotion_guess !== "" ? (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.awarenessEmotion,
											children: ["心情 · ", note.emotion_guess]
										}) : null]
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.awarenessObservation,
										children: note.observation
									}),
									note.trend !== "" ? (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.awarenessTrend,
										children: note.trend
									}) : null
								]
							}, `${note.date}:${note.observation}`))
						})] }) : null
					]
				})
			] });
		}
		//#endregion
		//#region lib/types/client/notifications.js
		/**
		* 消息 drawer — the same message system as the mobile web's messages overlay:
		* probe notifications (interest / avoidance / challenge) with the four-state
		* actions, spotlight surprise messages, and pending notification
		* recommendations. Badge = probe + spotlight + notification count.
		* @module @newsclaw/dsh-plugin
		*/
		/** Canonical probe action sets (same labels as the mobile web). */
		const INTEREST_ACTIONS = [
			{
				action: "confirm",
				label: "确认喜欢",
				primary: true
			},
			{
				action: "defer",
				label: "暂时搁置",
				primary: false
			},
			{
				action: "reject",
				label: "确认不喜欢",
				primary: false
			}
		];
		const AVOIDANCE_ACTIONS = [
			{
				action: "confirm",
				label: "确认避雷",
				primary: true
			},
			{
				action: "defer",
				label: "搁置避雷",
				primary: false
			},
			{
				action: "reject",
				label: "不是雷点",
				primary: false
			}
		];
		/** Dedupe helpers (same key scheme as probe-notification-helpers.js). */
		function probeKey(type, domain) {
			const normalized = domain.trim().toLowerCase();
			return normalized === "" ? "" : `${type.startsWith("avoidance.") ? "avoidance.probe" : "interest.probe"}:${normalized}`;
		}
		/** One probe message card with inline actions. */
		function ProbeMessage(props) {
			const { base, notice, onHandled, onError } = props;
			const [busy, setBusy] = (0, react.useState)("");
			const [requestIds] = (0, react.useState)(() => ({
				confirm: stableId(),
				reject: stableId(),
				defer: stableId(),
				chat: stableId()
			}));
			const isAvoidance = notice.type === "avoidance.probe";
			const tone = isAvoidance ? "avoidance" : notice.challenge ? "challenge" : "interest";
			const actions = isAvoidance ? AVOIDANCE_ACTIONS : INTEREST_ACTIONS;
			const prompt = isAvoidance ? "想少看这类，就确认这是雷点；如果猜错了，点不是。" : notice.challenge ? "这是挑战方向，会把口味往侧边推一点；想继续试探就点喜欢，不准就点不喜欢。" : "想继续探索这个方向，就点喜欢；不准就点不喜欢。";
			const answer = (0, react.useCallback)(async (action) => {
				setBusy(action);
				try {
					const request_id = requestIds[action] ?? stableId();
					if (isAvoidance) await respondAvoidanceProbe(base, {
						domain: notice.domain,
						response: action,
						request_id
					});
					else await respondInterestProbe(base, {
						domain: notice.domain,
						response: action,
						request_id
					});
					onHandled(notice.key);
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				isAvoidance,
				notice.domain,
				notice.key,
				onError,
				onHandled,
				requestIds
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.messageCard,
				"data-tone": tone,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.messageType,
						children: [(0, react_jsx_runtime.jsx)(SearchIcon, {}), isAvoidance ? "避雷确认" : notice.challenge ? "挑战探针" : "兴趣探测"]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messagePrompt,
						children: prompt
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageTitle,
						children: notice.domain
					}),
					notice.reason !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageBody,
						children: notice.reason
					}) : null,
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageActions,
						children: actions.map((entry) => (0, react_jsx_runtime.jsx)(ActionButton, {
							label: entry.label,
							primary: entry.primary,
							disabled: busy !== "",
							onClick: () => void answer(entry.action)
						}, entry.action))
					})
				]
			});
		}
		/** One spotlight message card. */
		function SpotlightMessage(props) {
			const { base, notice, onHandled, onError } = props;
			const [busy, setBusy] = (0, react.useState)("");
			const [requestIds] = (0, react.useState)(() => ({
				view: stableId(),
				like: stableId(),
				dislike: stableId(),
				ignore: stableId(),
				chat: stableId()
			}));
			const act = (0, react.useCallback)(async (response) => {
				setBusy(response);
				try {
					await respondToSpotlight(base, {
						article_id: notice.article_id,
						response,
						title: notice.title,
						request_id: requestIds[response] ?? stableId()
					});
					onHandled(notice.article_id);
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy("");
				}
			}, [
				base,
				notice.article_id,
				notice.title,
				onError,
				onHandled,
				requestIds
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.messageCard,
				"data-tone": "spotlight",
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageType,
						children: "✨ 惊喜推荐"
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageTitle,
						children: notice.title
					}),
					notice.reason !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageBody,
						children: notice.reason
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.messageActions,
						children: [
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "打开原文",
								primary: true,
								disabled: busy !== "" || notice.content_url === "",
								onClick: () => {
									act("view");
									openItem(base, {
										recommendation_id: void 0,
										content_id: notice.content_id !== "" ? notice.content_id : notice.article_id,
										article_id: notice.article_id,
										content_url: notice.content_url,
										media: notice.media,
										title: notice.title
									}, (error) => {
										onError("原文已打开，但阅读记录未确认保存：" + (error instanceof Error ? error.message : String(error)));
									});
								}
							}),
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "喜欢",
								disabled: busy !== "",
								onClick: () => void act("like")
							}),
							(0, react_jsx_runtime.jsx)(ActionButton, {
								label: "忽略",
								disabled: busy !== "",
								onClick: () => void act("ignore")
							})
						]
					})
				]
			});
		}
		/** One pending notification recommendation card. */
		function NotificationMessage(props) {
			const { base, notice, onHandled, onError } = props;
			const [busy, setBusy] = (0, react.useState)(false);
			const [requestId] = (0, react.useState)(stableId);
			const open = (0, react.useCallback)(() => {
				openItem(base, {
					content_id: notice.article_id,
					article_id: notice.article_id,
					content_url: notice.original_url,
					media: notice.media,
					title: notice.title
				}, (error) => {
					onError("原文已打开，但阅读记录未确认保存：" + (error instanceof Error ? error.message : String(error)));
				});
				setBusy(true);
				acknowledgeNotification(base, notice.article_id, requestId).then(() => {
					onHandled(notice.article_id);
				}).catch((error) => {
					onError("消息已打开，但确认状态保存失败：" + (error instanceof Error ? error.message : String(error)));
				}).finally(() => {
					setBusy(false);
				});
			}, [
				base,
				notice,
				onError,
				onHandled,
				requestId
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.messageCard,
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageType,
						children: "🔔 值得一看"
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageTitle,
						children: notice.title !== "" ? notice.title : notice.article_id
					}),
					notice.reason !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageBody,
						children: notice.reason
					}) : null,
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageActions,
						children: (0, react_jsx_runtime.jsx)(ActionButton, {
							primary: true,
							disabled: notice.original_url === "" || busy,
							label: busy ? "正在确认…" : "打开原文",
							onClick: open
						})
					})
				]
			});
		}
		/** One objective webpage/PDF change or delivery-failure notification. */
		function MonitorNotificationMessage(props) {
			const { base, notice, onHandled, onError } = props;
			const [busy, setBusy] = (0, react.useState)("");
			const [requestIds] = (0, react.useState)(() => ({
				read: stableId(),
				dismiss: stableId()
			}));
			const act = (0, react.useCallback)(async (action, open = false) => {
				const pendingWindow = open ? window.open("about:blank", "_blank") : null;
				if (pendingWindow !== null) pendingWindow.opener = null;
				setBusy(action);
				try {
					await actOnWebMonitorNotification(base, notice.delivery_id, action, requestIds[action]);
					onHandled(notice.delivery_id);
					if (open) {
						const monitorUrl = `${base}/web/#library/monitoring`;
						if (pendingWindow !== null) pendingWindow.location.replace(monitorUrl);
						else window.open(monitorUrl, "_blank", "noopener");
					}
				} catch (error) {
					if (pendingWindow !== null) pendingWindow.close();
					onError(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy("");
				}
			}, [
				base,
				notice.delivery_id,
				onError,
				onHandled,
				requestIds
			]);
			const typeLabel = notice.kind === "failure" ? "⚠️ 监控需要处理" : notice.kind === "recovered" ? "✓ 监控恢复正常" : "↗ 正文发生变化";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.messageCard,
				"data-tone": notice.kind === "failure" ? "avoidance" : "interest",
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageType,
						children: typeLabel
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageTitle,
						children: notice.title || notice.label || notice.display_url
					}),
					notice.body !== "" ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.messageBody,
						children: notice.body
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.messageActions,
						children: [(0, react_jsx_runtime.jsx)(ActionButton, {
							primary: true,
							disabled: busy !== "",
							label: busy === "read" ? "正在确认…" : "查看监控",
							onClick: () => void act("read", true)
						}), (0, react_jsx_runtime.jsx)(ActionButton, {
							disabled: busy !== "",
							label: "忽略",
							onClick: () => void act("dismiss")
						})]
					})
				]
			});
		}
		/** The messages drawer (bell overlay). */
		function MessagesDrawer(props) {
			const { base, probes, spotlights, notifications, monitorNotifications, onClose, onProbeHandled, onSpotlightHandled, onNotificationHandled, onMonitorNotificationHandled, onError } = props;
			const isEmpty = probes.length === 0 && spotlights.length === 0 && notifications.length === 0 && monitorNotifications.length === 0;
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.drawerOverlay,
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.drawerPanel,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.drawerHeader,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.drawerTitle,
								children: "消息"
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								onClick: onClose,
								title: "关闭",
								children: (0, react_jsx_runtime.jsx)(CloseIcon, { size: 13 })
							})]
						}),
						isEmpty ? (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.drawerEmpty,
							children: [
								(0, react_jsx_runtime.jsx)(MessageIcon, { size: 34 }),
								(0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.drawerEmptyTitle,
									children: "暂时没有新消息"
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.drawerEmptySubtitle,
									children: "兴趣探测和惊喜推荐会出现在这里"
								})
							]
						}) : null,
						notifications.map((notice) => (0, react_jsx_runtime.jsx)(NotificationMessage, {
							base,
							notice,
							onHandled: onNotificationHandled,
							onError
						}, `notif:${notice.article_id}`)),
						monitorNotifications.map((notice) => (0, react_jsx_runtime.jsx)(MonitorNotificationMessage, {
							base,
							notice,
							onHandled: onMonitorNotificationHandled,
							onError
						}, `monitor:${notice.delivery_id}`)),
						probes.map((notice) => (0, react_jsx_runtime.jsx)(ProbeMessage, {
							base,
							notice,
							onHandled: onProbeHandled,
							onError
						}, notice.key)),
						spotlights.map((notice) => (0, react_jsx_runtime.jsx)(SpotlightMessage, {
							base,
							notice,
							onHandled: onSpotlightHandled,
							onError
						}, `spotlight:${notice.article_id}`))
					]
				})
			});
		}
		/** Coerce one probe payload into a notice row. */
		function toProbeNotice(item, type) {
			return {
				key: probeKey(type, item.domain),
				type,
				domain: item.domain,
				reason: item.reason,
				challenge: (item.probe_mode ?? "") === "lateral" || (item.probe_mode ?? "") === "bridge" || (item.probe_mode ?? "") === "wildcard" || (item.challenge ?? "") === "true",
				confidence: item.confidence
			};
		}
		/** Build a spotlight notice from a spotlight payload. */
		function toSpotlightNotice(item) {
			return {
				article_id: item.article_id,
				title: item.title,
				reason: item.spotlight_reason,
				hook: item.spotlight_hook,
				media: item.media,
				content_url: item.content_url,
				content_id: item.content_id,
				score: item.spotlight_score
			};
		}
		/** Hydrate the drawer from every durable local message surface. */
		async function hydrateDrawer(base, handledProbes) {
			const results = await Promise.allSettled([
				fetchInterestProbes(base),
				fetchAvoidanceProbes(base),
				fetchSpotlightBatch(base),
				fetchPendingNotification(base),
				fetchWebMonitorNotifications(base)
			]);
			const interests = results[0].status === "fulfilled" ? results[0].value : [];
			const avoidances = results[1].status === "fulfilled" ? results[1].value : [];
			const spotlights = results[2].status === "fulfilled" ? results[2].value : [];
			const notification = results[3].status === "fulfilled" ? results[3].value : null;
			const monitorNotifications = results[4].status === "fulfilled" ? results[4].value.items : [];
			await Promise.allSettled(monitorNotifications.map((item) => actOnWebMonitorNotification(base, item.delivery_id, "delivered", `dsh:monitor:delivered:${item.delivery_id}`)));
			const failed = results.filter((result) => result.status === "rejected").length;
			const probeNotice = (p, type) => {
				const key = probeKey(type, p.domain);
				if (key === "" || handledProbes.has(key)) return null;
				if ((p.status ?? "active") !== "active" && (p.status ?? "active") !== "pending") return null;
				return toProbeNotice(p, type);
			};
			return {
				probes: [...interests.map((p) => probeNotice(p, "interest.probe")).filter((n) => n !== null), ...avoidances.map((p) => probeNotice(p, "avoidance.probe")).filter((n) => n !== null)],
				spotlights: spotlights.map(toSpotlightNotice),
				notifications: notification !== null ? [{
					article_id: notification.article_id,
					title: notification.title,
					reason: notification.reason,
					media: notification.media,
					original_url: notification.original_url
				}] : [],
				monitorNotifications,
				error: failed === 0 ? "" : failed === results.length ? "消息暂时读取失败，请确认新闻爪后端已启动。" : "部分消息来源读取失败，当前只展示已成功取得的消息。",
				loaded: {
					interests: results[0].status === "fulfilled",
					avoidances: results[1].status === "fulfilled",
					spotlights: results[2].status === "fulfilled",
					notification: results[3].status === "fulfilled",
					monitorNotifications: results[4].status === "fulfilled"
				}
			};
		}
		//#endregion
		//#region lib/types/client/settings.js
		/**
		* Truthful NewsClaw settings summary for the DSH side panel.
		*
		* DSH deliberately does not maintain a second editor for backend settings.
		* It reads the dedicated NewsClaw runtime/source contracts, shows the plugin
		* row connection, and sends full configuration work to the desktop Web UI.
		*/
		const TABS$1 = [
			{
				key: "status",
				label: "运行状态"
			},
			{
				key: "sources",
				label: "新闻来源"
			},
			{
				key: "connection",
				label: "插件连接"
			}
		];
		function Section({ title, children }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.settingsSection,
				children: [(0, react_jsx_runtime.jsx)("h3", { children: title }), children]
			});
		}
		function formatDate(value) {
			if (value === "") return "尚无记录";
			const parsed = new Date(value);
			return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
		}
		function formatDuration(seconds) {
			if (!Number.isFinite(seconds) || seconds <= 0) return "—";
			return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`;
		}
		function runtimeLabel(state) {
			const normalized = state.toLowerCase();
			if (normalized === "online" || normalized === "healthy" || normalized === "success") return "正常";
			if (normalized === "degraded" || normalized === "partial") return "降级";
			if (normalized === "offline" || normalized === "failed" || normalized === "error") return "异常";
			return state === "" ? "待确认" : state;
		}
		function statusTone(state) {
			const normalized = state.toLowerCase();
			if (normalized === "online" || normalized === "healthy" || normalized === "success") return "online";
			if (normalized === "degraded" || normalized === "partial") return "degraded";
			if (normalized === "offline" || normalized === "failed" || normalized === "error") return "offline";
			return "unknown";
		}
		function StatusPill({ state }) {
			return (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.settingsStatusPill,
				"data-state": statusTone(state),
				children: runtimeLabel(state)
			});
		}
		function Metric({ label, value, hint }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.settingsMetric,
				children: [
					(0, react_jsx_runtime.jsx)("span", { children: label }),
					(0, react_jsx_runtime.jsx)("strong", { children: value }),
					hint !== void 0 ? (0, react_jsx_runtime.jsx)("small", { children: hint }) : null
				]
			});
		}
		function SettingRow({ label, value }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.settingsValueRow,
				children: [(0, react_jsx_runtime.jsx)("span", { children: label }), (0, react_jsx_runtime.jsx)("strong", { children: value })]
			});
		}
		function FullSettingsCard({ base }) {
			const openDesktop = () => {
				window.open(`${base.replace(/\/+$/, "")}/web`, "_blank", "noopener");
			};
			return (0, react_jsx_runtime.jsxs)(Section, {
				title: "完整配置在电脑版",
				children: [(0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.settingsHint,
					children: "AI 实例与路由、DeepSeek 密钥、新闻源开关、自定义 RSS、刷新和重试参数，都由新闻爪电脑版统一管理。DSH 这里只展示后端确认已经生效的结果，不再保存一份“看起来能改、实际不生效”的配置。"
				}), (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.settingsActionRow,
					children: (0, react_jsx_runtime.jsx)(ActionButton, {
						label: "打开新闻爪电脑版",
						primary: true,
						onClick: openDesktop
					})
				})]
			});
		}
		function EffectiveSettingsView({ settings }) {
			if (settings === null) return (0, react_jsx_runtime.jsx)("p", {
				className: panel_module_css_default.settingsHint,
				children: "后端尚未返回生效配置。"
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.settingsValueList,
				children: [
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "候选池目标",
						value: `${settings.pool_target_count} 条`
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "调度检查",
						value: `${settings.refresh_poll_minutes} 分钟`
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "热门刷新",
						value: `${settings.hot_refresh_minutes} 分钟`
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "探索刷新",
						value: `${settings.exploration_refresh_minutes} 分钟`
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "反馈触发",
						value: `${settings.feedback_threshold} 次`
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "主动推送",
						value: settings.proactive_push ? "已开启" : "已关闭"
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "后台 AI",
						value: settings.background_llm ? "已开启" : "已关闭"
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "关闭浏览器后",
						value: settings.browser_close_behavior === "continue" ? "继续运行" : settings.browser_close_behavior || "—"
					}),
					(0, react_jsx_runtime.jsx)(SettingRow, {
						label: "失败重试",
						value: `${settings.retry_max_attempts} 次；${formatDuration(settings.retry_base_seconds)} → ${formatDuration(settings.retry_max_seconds)}`
					})
				]
			});
		}
		function StatusView({ runtime, settings }) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.settingsRuntimeHero,
					"data-state": runtime?.status ?? "offline",
					children: [(0, react_jsx_runtime.jsxs)("div", { children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.settingsEyebrow,
							children: "NEWSCLAW RUNTIME"
						}),
						(0, react_jsx_runtime.jsx)("strong", { children: runtime === null ? "正在确认后端状态" : runtime.status === "online" ? "新闻爪运行正常" : runtime.status === "degraded" ? "新闻爪正在降级运行" : "新闻爪当前离线" }),
						(0, react_jsx_runtime.jsx)("p", { children: runtime === null ? "正在读取 /api/news/runtime" : `最近刷新：${formatDate(runtime.last_refresh)}` })
					] }), (0, react_jsx_runtime.jsx)(StatusPill, { state: runtime?.status ?? "unknown" })]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.settingsMetricGrid,
					children: [
						(0, react_jsx_runtime.jsx)(Metric, {
							label: "最近入池",
							value: runtime?.last_article_count ?? "—",
							hint: "后端真实返回"
						}),
						(0, react_jsx_runtime.jsx)(Metric, {
							label: "调度通道",
							value: runtime?.last_schedule_lane === "exploration" ? "探索" : runtime?.last_schedule_lane === "hot" ? "热门" : "—"
						}),
						(0, react_jsx_runtime.jsx)(Metric, {
							label: "画像",
							value: runtime?.profile_ready === true ? "就绪" : "未就绪"
						}),
						(0, react_jsx_runtime.jsx)(Metric, {
							label: "刷新任务",
							value: runtime?.refresh_running === true || runtime?.bootstrap_running === true ? "进行中" : "空闲"
						})
					]
				}),
				(0, react_jsx_runtime.jsxs)(Section, {
					title: "当前已生效的刷新参数",
					children: [(0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.settingsHint,
						children: "以下数值来自后端的 effective_settings，不是 DSH 自己猜测的默认值。"
					}), (0, react_jsx_runtime.jsx)(EffectiveSettingsView, { settings })]
				})
			] });
		}
		function SourcesView({ snapshot }) {
			const sources = snapshot?.sources ?? [];
			const healthy = sources.filter((source) => statusTone(source.status) === "online").length;
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)(Section, {
				title: "来源概况",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.settingsMetricGrid,
					children: [(0, react_jsx_runtime.jsx)(Metric, {
						label: "已接入",
						value: sources.length
					}), (0, react_jsx_runtime.jsx)(Metric, {
						label: "当前正常",
						value: healthy
					})]
				}), (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.settingsHint,
					children: "来源状态直接读取 /api/news/sources。DSH 不修改来源开关、权重或单源频率；完整设置请到电脑版完成。"
				})]
			}), sources.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: "后端还没有返回新闻来源。"
			}) : (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.settingsSourceList,
				children: sources.map((source) => (0, react_jsx_runtime.jsx)(SourceCard, { source }, source.source_id))
			})] });
		}
		function SourceCard({ source }) {
			return (0, react_jsx_runtime.jsxs)("article", {
				className: panel_module_css_default.settingsSourceCard,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.settingsSourceHead,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: source.media || source.source_id }), (0, react_jsx_runtime.jsx)("span", { children: source.technical_provider || source.kind || "未标注技术提供方" })] }), source.enabled ? (0, react_jsx_runtime.jsx)(StatusPill, { state: source.status }) : (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.settingsStatusPill,
							"data-state": "unknown",
							children: "已停用"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.settingsSourceMeta,
						children: [
							(0, react_jsx_runtime.jsx)("span", { children: source.enabled ? "已启用" : "已停用" }),
							(0, react_jsx_runtime.jsx)("span", { children: source.custom ? "自定义 RSS" : source.kind === "rss" ? "官方 RSS/Atom" : source.kind === "tushare" ? "Tushare 接口" : source.kind || "新闻接口" }),
							(0, react_jsx_runtime.jsx)("span", { children: source.credential_configured ? "凭据/地址已配置" : "需要配置" })
						]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.settingsHint,
						children: ["最后成功：", formatDate(source.last_success_at)]
					}),
					source.error !== "" ? (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.settingsSourceError,
						children: ["当前错误：", source.error]
					}) : null
				]
			});
		}
		function ConnectionView({ base, timeoutMs, autostart, onAutostart }) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)(Section, {
					title: "插件自身连接",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.settingsConnectionValue,
							children: [(0, react_jsx_runtime.jsx)("span", { children: "API 地址" }), (0, react_jsx_runtime.jsx)("code", { children: base })]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.settingsConnectionValue,
							children: [(0, react_jsx_runtime.jsx)("span", { children: "Agent 工具单次总超时" }), (0, react_jsx_runtime.jsxs)("code", { children: [
								timeoutMs,
								" ms（",
								Math.round(timeoutMs / 1e3),
								" 秒）"
							] })]
						}),
						(0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.settingsHint,
							children: "这两个值来自 Harness 插件行的 apiUrl / timeoutMs。面板启动时会把同一个 apiUrl 镜像给全部界面请求，22 个 Agent Bridge 工具也使用该地址，避免两套连接漂移。"
						}),
						(0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.settingsHint,
							children: "修改它们需要编辑 DSH 插件配置并重新加载插件；这里保持只读，防止只改右侧栏却没有改 Agent 工具。"
						})
					]
				}),
				(0, react_jsx_runtime.jsxs)(Section, {
					title: "本机启动",
					children: [(0, react_jsx_runtime.jsxs)("label", {
						className: panel_module_css_default.settingsToggleRow,
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: autostart.enabled,
							disabled: !autostart.loaded || autostart.busy,
							onChange: (event) => onAutostart(event.target.checked)
						}), (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("strong", { children: "开机自动启动新闻爪" }), (0, react_jsx_runtime.jsx)("small", { children: !autostart.loaded ? "正在读取真实状态…" : autostart.busy ? "正在应用…" : autostart.enabled ? "当前已开启" : "当前已关闭" })] })]
					}), (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.settingsHint,
						children: "该开关直接调用新闻爪的本机自启动接口，是本页唯一会改动后端状态的项目。"
					})]
				}),
				(0, react_jsx_runtime.jsx)(Section, {
					title: "隐私与边界",
					children: (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.settingsHint,
						children: "页面不会读取或回显 DeepSeek、Tushare 等 Token。插件只连接本机新闻爪，不抓网页、不读取新闻网站 Cookie，也不连接券商或执行交易。"
					})
				})
			] });
		}
		function SettingsOverlay({ base, timeoutMs, onClose }) {
			const [tab, setTab] = (0, react.useState)("status");
			const [runtime, setRuntime] = (0, react.useState)(null);
			const [sources, setSources] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [notice, setNotice] = (0, react.useState)("");
			const [autostart, setAutostart] = (0, react.useState)({
				loaded: false,
				enabled: false,
				busy: false
			});
			const load = (0, react.useCallback)(async (signal) => {
				setLoading(true);
				setNotice("");
				const [runtimeResult, sourcesResult, autostartResult] = await Promise.allSettled([
					fetchNewsRuntime(base, signal),
					fetchNewsSources(base, signal),
					fetchAutostartStatus(base, signal)
				]);
				if (signal?.aborted === true) return;
				if (runtimeResult.status === "fulfilled") setRuntime(runtimeResult.value);
				if (sourcesResult.status === "fulfilled") setSources(sourcesResult.value);
				if (autostartResult.status === "fulfilled") setAutostart({
					loaded: true,
					enabled: autostartResult.value.enabled,
					busy: false
				});
				else setAutostart((value) => ({
					...value,
					loaded: false,
					busy: false
				}));
				const failed = [runtimeResult, sourcesResult].filter((result) => result.status === "rejected");
				if (failed.length > 0) setNotice(failed.length === 2 ? "新闻爪后端暂时不可达，请确认服务已经启动。" : "部分实时状态读取失败，当前展示的是已成功取得的数据。");
				else if (autostartResult.status === "rejected") setNotice("运行状态已读取，但开机自启动的真实状态暂时无法确认。");
				setLoading(false);
			}, [base]);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				load(controller.signal);
				return () => {
					controller.abort();
				};
			}, [load]);
			const toggleAutostart = (0, react.useCallback)(async (enabled) => {
				setAutostart((value) => ({
					...value,
					busy: true
				}));
				setNotice("");
				try {
					if (!await applyAutostart(base, enabled)) throw new Error("后端没有确认这次自启动修改");
					const verified = await fetchAutostartStatus(base);
					if (verified.enabled !== enabled) throw new Error("写入后的真实状态与目标不一致");
					setAutostart({
						loaded: true,
						enabled: verified.enabled,
						busy: false
					});
					setNotice(enabled ? "已开启开机自动启动（状态已复核）。" : "已关闭开机自动启动（状态已复核）。");
				} catch (error) {
					try {
						const verified = await fetchAutostartStatus(base);
						setAutostart({
							loaded: true,
							enabled: verified.enabled,
							busy: false
						});
					} catch {
						setAutostart((value) => ({
							...value,
							loaded: false,
							busy: false
						}));
					}
					setNotice("自启动设置失败：" + (error instanceof Error ? error.message : String(error)));
				}
			}, [base]);
			const effective = runtime?.effective_settings ?? sources?.settings ?? null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.settingsOverlay,
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.settingsPanel,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.settingsHeader,
							children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h2", { children: "新闻爪状态与配置" }), (0, react_jsx_runtime.jsx)("p", { children: "DSH 展示真实状态，完整设置由电脑版统一管理" })] }), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.settingsBack,
								title: "返回",
								onClick: onClose,
								children: "←"
							})]
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.settingsTabs,
							role: "tablist",
							children: TABS$1.map((row) => (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.settingsTab,
								"data-active": tab === row.key,
								onClick: () => setTab(row.key),
								children: row.label
							}, row.key))
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.settingsBody,
							children: [notice !== "" ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.settingsNotice,
								role: "status",
								children: notice
							}) : null, loading && runtime === null && sources === null ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.empty,
								children: "正在读取后端实际状态…"
							}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								tab === "status" ? (0, react_jsx_runtime.jsx)(StatusView, {
									runtime: runtime ?? sources?.runtime ?? null,
									settings: effective
								}) : null,
								tab === "sources" ? (0, react_jsx_runtime.jsx)(SourcesView, { snapshot: sources }) : null,
								tab === "connection" ? (0, react_jsx_runtime.jsx)(ConnectionView, {
									base,
									timeoutMs,
									autostart,
									onAutostart: (enabled) => {
										toggleAutostart(enabled);
									}
								}) : null,
								(0, react_jsx_runtime.jsx)(FullSettingsCard, { base }),
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.settingsRefreshBar,
									children: [(0, react_jsx_runtime.jsx)("span", { children: loading ? "正在刷新…" : "数据来自新闻爪专用接口" }), (0, react_jsx_runtime.jsx)(ActionButton, {
										label: "刷新实际状态",
										disabled: loading,
										onClick: () => {
											load();
										}
									})]
								})
							] })]
						})
					]
				})
			});
		}
		//#endregion
		//#region lib/types/client/NewsClawPanel.js
		/**
		* NewsClaw sidebar panel shell: brand header with the message bell
		* (badge + 消息 drawer), tab bar with SVG icons, and the active view. Live
		* runtime-stream events feed the probe/spotlight notifications and tab badges.
		* @module @newsclaw/dsh-plugin
		*/
		/** Canonical tab structure (same IA as the mobile web + extension popup). */
		const TABS = [
			{
				key: "recommend",
				label: "推荐",
				icon: SparkleIcon
			},
			{
				key: "library",
				label: "内容库",
				icon: LibraryIcon
			},
			{
				key: "profile",
				label: "画像",
				icon: ProfileIcon
			},
			{
				key: "chat",
				label: "对话",
				icon: ChatIcon
			}
		];
		/**
		* The panel column body: NewsClaw user-consumption panel.
		* @param props - injected actions (close + theme).
		*/
		function NewsClawPanel({ closePanel, isDark, onThemeChange, apiUrl, timeoutMs }) {
			const [dark, setDark] = (0, react.useState)(() => isDark());
			(0, react.useEffect)(() => onThemeChange(setDark), [onThemeChange]);
			const base = apiUrl;
			const [connection, setConnection] = (0, react.useState)("offline");
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("recommend");
			const [badges, setBadges] = (0, react.useState)({});
			const [drawerOpen, setDrawerOpen] = (0, react.useState)(false);
			const [probes, setProbes] = (0, react.useState)([]);
			const [spotlights, setSpotlights] = (0, react.useState)([]);
			const [notifications, setNotifications] = (0, react.useState)([]);
			const [monitorNotifications, setMonitorNotifications] = (0, react.useState)([]);
			const [drawerError, setDrawerError] = (0, react.useState)("");
			const handledProbes = (0, react.useRef)(/* @__PURE__ */ new Set());
			const handledMonitorNotifications = (0, react.useRef)(/* @__PURE__ */ new Set());
			const monitorNotificationGeneration = (0, react.useRef)(0);
			const commitMonitorNotifications = (0, react.useCallback)((items, generation) => {
				if (generation !== monitorNotificationGeneration.current) return;
				setMonitorNotifications(items.filter((item) => !handledMonitorNotifications.current.has(item.delivery_id)));
			}, []);
			const probeRef = (0, react.useRef)([]);
			probeRef.current = probes;
			const spotlightRef = (0, react.useRef)([]);
			spotlightRef.current = spotlights;
			const healthProbeRef = (0, react.useRef)(null);
			const failStreakRef = (0, react.useRef)(0);
			const probeNow = (0, react.useCallback)(() => {
				fetchHealthState(base).then((state) => {
					if (state !== "offline") {
						failStreakRef.current = 0;
						setConnection(state);
					} else {
						failStreakRef.current += 1;
						if (failStreakRef.current >= 2) setConnection("offline");
					}
				});
			}, [base]);
			healthProbeRef.current = probeNow;
			(0, react.useEffect)(() => {
				probeNow();
				const timer = window.setInterval(probeNow, 12e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [probeNow]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const generation = ++monitorNotificationGeneration.current;
				hydrateDrawer(base, handledProbes.current).then((result) => {
					if (cancelled) return;
					setProbes(result.probes);
					if (result.loaded.spotlights) setSpotlights(result.spotlights);
					if (result.loaded.notification) setNotifications(result.notifications);
					if (result.loaded.monitorNotifications) commitMonitorNotifications(result.monitorNotifications, generation);
					setDrawerError(result.error);
				}).catch((error) => {
					if (!cancelled) setDrawerError(error instanceof Error ? error.message : String(error));
				});
				return () => {
					cancelled = true;
					monitorNotificationGeneration.current += 1;
				};
			}, [base, commitMonitorNotifications]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const refresh = async () => {
					if (document.visibilityState === "hidden") return;
					const generation = ++monitorNotificationGeneration.current;
					try {
						const result = await fetchWebMonitorNotifications(base);
						if (cancelled) return;
						commitMonitorNotifications(result.items, generation);
						await Promise.allSettled(result.items.map((item) => actOnWebMonitorNotification(base, item.delivery_id, "delivered", `dsh:monitor:delivered:${item.delivery_id}`)));
					} catch {}
				};
				const onVisibility = () => {
					if (document.visibilityState === "visible") refresh();
				};
				const timer = window.setInterval(() => {
					refresh();
				}, 6e4);
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					cancelled = true;
					window.clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisibility);
				};
			}, [base, commitMonitorNotifications]);
			const [liveTick, setLiveTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const client = new LiveClient(base);
				const offEvent = client.onEvent((event) => {
					const payload = event.payload;
					if (event.type === "interest.probe" || event.type === "avoidance.probe") {
						const domain = typeof payload.domain === "string" ? payload.domain : "";
						const key = probeKey(event.type, domain);
						if (key === "" || handledProbes.current.has(key)) return;
						if (probeRef.current.some((probe) => probe.key === key)) return;
						const probeMode = typeof payload.probe_mode === "string" ? payload.probe_mode : "";
						const challenge = probeMode === "lateral" || probeMode === "bridge" || probeMode === "wildcard";
						const notice = {
							key,
							type: event.type === "avoidance.probe" ? "avoidance.probe" : "interest.probe",
							domain,
							reason: typeof payload.reason === "string" ? payload.reason : "",
							challenge,
							confidence: typeof payload.confidence === "number" ? payload.confidence : 0
						};
						probeRef.current = [...probeRef.current, notice];
						setProbes(probeRef.current);
						setBadges((prev) => ({
							...prev,
							profile: (prev.profile ?? 0) + 1
						}));
						setLiveTick((tick) => tick + 1);
					} else if (event.type === "spotlight.candidate") {
						const article_id = typeof payload.article_id === "string" ? payload.article_id : "";
						if (article_id === "") return;
						if (spotlightRef.current.some((item) => item.article_id === article_id)) return;
						const notice = {
							article_id,
							title: typeof payload.title === "string" ? payload.title : "",
							reason: typeof payload.spotlight_reason === "string" ? payload.spotlight_reason : "",
							hook: typeof payload.spotlight_hook === "string" ? payload.spotlight_hook : "",
							media: typeof payload.media === "string" ? payload.media : "未知媒体",
							content_url: typeof payload.original_url === "string" ? payload.original_url : typeof payload.content_url === "string" ? payload.content_url : "",
							content_id: typeof payload.content_id === "string" ? payload.content_id : article_id,
							score: typeof payload.spotlight_score === "number" ? payload.spotlight_score : 0
						};
						spotlightRef.current = [...spotlightRef.current, notice];
						setSpotlights(spotlightRef.current);
						setBadges((prev) => ({
							...prev,
							recommend: (prev.recommend ?? 0) + 1
						}));
						setLiveTick((tick) => tick + 1);
					} else if (event.type.startsWith("interest.") || event.type.startsWith("avoidance.")) {
						const domain = typeof payload.domain === "string" ? payload.domain : "";
						const key = probeKey(event.type, domain);
						if (key !== "") {
							handledProbes.current.add(key);
							setProbes((prev) => prev.filter((p) => p.key !== key));
						}
					} else if (event.type === "spotlight.liked" || event.type === "spotlight.disliked" || event.type === "spotlight.refreshed") {
						const article_id = typeof payload.article_id === "string" ? payload.article_id : "";
						if (article_id !== "") setSpotlights((prev) => prev.filter((d) => d.article_id !== article_id));
					}
				});
				const offStatus = client.onStatusChange(() => {
					healthProbeRef.current?.();
				});
				client.connect();
				return () => {
					offEvent();
					offStatus();
					client.dispose();
				};
			}, [base]);
			const selectTab = (0, react.useCallback)((key) => {
				setTab(key);
				setBadges((prev) => ({
					...prev,
					[key]: 0
				}));
				if (key === "recommend" || key === "profile") setLiveTick((tick) => tick + 1);
			}, []);
			const openDrawer = (0, react.useCallback)(() => {
				setDrawerOpen(true);
				setDrawerError("");
				const generation = ++monitorNotificationGeneration.current;
				hydrateDrawer(base, handledProbes.current).then((result) => {
					setProbes((prev) => mergeProbes(prev, result.probes));
					if (result.loaded.spotlights) setSpotlights(result.spotlights);
					if (result.loaded.notification) setNotifications(result.notifications);
					if (result.loaded.monitorNotifications) commitMonitorNotifications(result.monitorNotifications, generation);
					setDrawerError(result.error);
				}).catch((error) => {
					setDrawerError(error instanceof Error ? error.message : String(error));
				});
			}, [base, commitMonitorNotifications]);
			const onProbeHandled = (0, react.useCallback)((key) => {
				handledProbes.current.add(key);
				setProbes((prev) => prev.filter((p) => p.key !== key));
			}, []);
			const onSpotlightHandled = (0, react.useCallback)((article_id) => {
				setSpotlights((prev) => prev.filter((d) => d.article_id !== article_id));
			}, []);
			const onNotificationHandled = (0, react.useCallback)((article_id) => {
				setNotifications((prev) => prev.filter((n) => n.article_id !== article_id));
			}, []);
			const onMonitorNotificationHandled = (0, react.useCallback)((deliveryId) => {
				handledMonitorNotifications.current.add(deliveryId);
				monitorNotificationGeneration.current += 1;
				setMonitorNotifications((prev) => prev.filter((n) => n.delivery_id !== deliveryId));
			}, []);
			const messageCount = probes.length + spotlights.length + notifications.length + monitorNotifications.length;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				"data-dark": dark,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.header,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.brand,
								children: [(0, react_jsx_runtime.jsx)("img", {
									className: panel_module_css_default.brandMark,
									src: BRAND_ICON,
									alt: "",
									"aria-hidden": "true"
								}), (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.brandCopy,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.brandTitle,
										children: "NewsClaw"
									}), (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.status,
										title: connection === "online" ? "在线" : connection === "degraded" ? "降级运行" : "离线",
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.statusDot,
											"data-state": connection
										}), (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.statusText,
											children: connection === "online" ? "在线" : connection === "degraded" ? "降级" : "离线"
										})]
									})]
								})]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								title: "电脑版：在浏览器中打开 Web 版",
								onClick: () => {
									window.open(`${base}/web`, "_blank", "noopener");
								},
								children: (0, react_jsx_runtime.jsx)(MonitorIcon, { size: 15 })
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								title: "消息",
								onClick: openDrawer,
								children: [(0, react_jsx_runtime.jsx)(MessageIcon, { size: 15 }), messageCount > 0 ? (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.bellBadge,
									children: messageCount > 99 ? "99+" : messageCount
								}) : null]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								title: "设置",
								onClick: () => setSettingsOpen((open) => !open),
								children: (0, react_jsx_runtime.jsx)(GearIcon, { size: 14 })
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								title: "收起",
								onClick: closePanel,
								children: (0, react_jsx_runtime.jsx)(CollapseIcon, { size: 14 })
							})
						]
					}),
					settingsOpen ? (0, react_jsx_runtime.jsx)(SettingsOverlay, {
						base,
						timeoutMs,
						onClose: () => setSettingsOpen(false)
					}) : null,
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabBar,
						children: TABS.map((item) => {
							const badgeCount = badges[item.key];
							const Icon = item.icon;
							return (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.tab,
								"data-active": tab === item.key,
								onClick: () => selectTab(item.key),
								children: [(0, react_jsx_runtime.jsx)(Icon, { size: 15 }), (0, react_jsx_runtime.jsxs)("span", { children: [item.label, badgeCount !== void 0 && badgeCount > 0 ? (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: badgeCount
								}) : null] })]
							}, item.key);
						})
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.body,
						children: [
							tab === "recommend" ? (0, react_jsx_runtime.jsx)(RecommendView, {
								base,
								refreshKey: liveTick
							}, `recommend-${base}`) : null,
							tab === "library" ? (0, react_jsx_runtime.jsx)(LibraryView, { base }, `library-${base}`) : null,
							tab === "chat" ? (0, react_jsx_runtime.jsx)(ChatView, { base }, `chat-${base}`) : null,
							tab === "profile" ? (0, react_jsx_runtime.jsx)(ProfileView, { base }, `profile-${base}-${liveTick}`) : null
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.pinnedFooter,
						children: (0, react_jsx_runtime.jsx)(ActivityFooter, { base })
					}),
					drawerOpen ? (0, react_jsx_runtime.jsx)(MessagesDrawer, {
						base,
						probes,
						spotlights,
						notifications,
						monitorNotifications,
						onClose: () => setDrawerOpen(false),
						onProbeHandled,
						onSpotlightHandled,
						onNotificationHandled,
						onMonitorNotificationHandled,
						onError: setDrawerError
					}) : null,
					drawerError !== "" && drawerOpen ? (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						style: {
							position: "absolute",
							bottom: 8,
							left: 14,
							right: 14,
							zIndex: 11
						},
						children: drawerError
					}) : null
				]
			});
		}
		/** Merge persisted probes into live ones, deduped by key. */
		function mergeProbes(current, persisted) {
			const seen = /* @__PURE__ */ new Set();
			const merged = [];
			for (const p of [...persisted, ...current]) {
				if (seen.has(p.key)) continue;
				seen.add(p.key);
				merged.push(p);
			}
			return merged;
		}
		//#endregion
		//#region lib/types/client/mount.js
		/**
		* DOM mounting: one React root rendered into the panel column the layout
		* controller appends to the frame grid. The root waits for its column (the
		* shell mounts asynchronously), and any DOM failure degrades the panel, never
		* the GUI boot.
		* @module @newsclaw/dsh-plugin
		*/
		/** Wait for one selector (the column the controller appends after boot). */
		function waitForElement(selector, onFound) {
			let disposed = false;
			let observer;
			const tryFind = () => {
				if (disposed) return;
				const el = document.querySelector(selector);
				if (el !== null) {
					observer?.disconnect();
					onFound(el);
				}
			};
			observer = new MutationObserver(() => {
				tryFind();
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			tryFind();
			return () => {
				disposed = true;
				observer?.disconnect();
			};
		}
		/**
		* Mount the NewsClaw panel into the appended column.
		* @param controller - the layout controller (owns open/close).
		* @param theme - the shell theme face.
		* @returns a disposer unmounting the tree.
		*/
		function mountPanel(controller, theme, connection) {
			let root;
			const dispose = waitForElement(PANEL_COL_SELECTOR, (el) => {
				root = (0, react_dom_client.createRoot)(el);
				root.render((0, react_jsx_runtime.jsx)(NewsClawPanel, {
					closePanel: () => {
						controller.setOpen(false);
					},
					isDark: theme.isDark,
					onThemeChange: theme.onThemeChange,
					apiUrl: connection.apiUrl,
					timeoutMs: connection.timeoutMs
				}));
			});
			return () => {
				dispose();
				root?.unmount();
			};
		}
		//#endregion
		//#region lib/types/client/sidebarButton.js
		/**
		* The NewsClaw trigger button: the `sidebar.footer.action` occupant, a
		* foot action rendered beside Settings at the sidebar bottom. In the wide
		* sidebar it is a full-width row (brand mark + label); in the collapsed rail
		* it is the 36px icon control. Clicking toggles the panel column (which pushes
		* the center content instead of overlaying it).
		* @module @newsclaw/dsh-plugin
		*/
		/**
		* Render the sidebar trigger row.
		* @param props - `wide` (column display state) + `togglePanel` callback.
		* @returns the trigger button.
		*/
		function NewsClawSidebarButton({ wide, togglePanel }) {
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: panel_module_css_default.sidebarButton,
				"data-wide": wide || void 0,
				title: "NewsClaw",
				onClick: togglePanel,
				children: [(0, react_jsx_runtime.jsx)("img", {
					className: panel_module_css_default.sidebarButtonIcon,
					src: BRAND_ICON,
					alt: "",
					"aria-hidden": "true"
				}), wide ? (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.sidebarButtonLabel,
					children: "NewsClaw"
				}) : null]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the slot registry (trigger button) and the shell theme. */
		const inject = ["slots", "theme"];
		function resolveClientConfig(config) {
			return {
				apiUrl: normalizeApiUrl(config?.apiUrl),
				timeoutMs: normalizeTimeoutMs(config?.timeoutMs)
			};
		}
		/**
		* Client plugin body: mount the panel column into the frame grid (DOM-level,
		* pushing the center content) plus a left-sidebar toggle button.
		* @param ctx - client root context.
		*/
		function apply(ctx, config) {
			const connection = resolveClientConfig(config);
			writeApiBase(connection.apiUrl);
			const layout = new PanelLayoutController(createPanelLayoutStore());
			const theme = {
				isDark: () => ctx.theme.getTheme().active.colorScheme === "dark",
				onThemeChange: (listener) => ctx.on("theme/change", (snapshot) => {
					listener(snapshot.active.colorScheme === "dark");
				})
			};
			ctx.effect(() => {
				const disposers = [];
				try {
					layout.mount();
					disposers.push(mountPanel(layout, theme, connection));
				} catch (error) {
					console.error("[newsclaw] panel mount failed:", error);
					for (const dispose of [...disposers].reverse()) dispose();
					disposers.length = 0;
					layout.dispose();
				}
				return () => {
					for (const dispose of disposers) dispose();
					layout.dispose();
				};
			}, "newsclaw: panel wiring");
			ctx.effect(() => {
				try {
					return ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
						name: "sidebar.footer.action",
						id: "newsclaw",
						inject: () => ({ togglePanel: () => {
							layout.toggle();
						} })
					}, NewsClawSidebarButton));
				} catch (error) {
					console.error("[newsclaw] sidebar button registration failed; Harness remains usable:", error);
					return () => void 0;
				}
			}, "newsclaw: sidebar button");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.resolveClientConfig = resolveClientConfig;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map