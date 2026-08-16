window.__ModuleLoader__.load({
	id: "@newsclaw/dsh-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");
		let react = require("react");
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
		/** The layout controller: frame sync, column append, grid rewrite, toggle. */
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
				this.frame = frame;
				const column = document.createElement("div");
				column.dataset.newsclawPanelCol = "";
				column.style.minWidth = "0";
				column.style.overflow = "hidden";
				column.style.display = "flex";
				column.style.flexDirection = "column";
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
			/** Re-write the frame grid and toggle the column visibility. */
			applyGrid() {
				if (this.frame === null) return;
				if (this.shellTracks.length < 2) return;
				const state = this.store.getSnapshot();
				const width = state.open ? this.clampWidth(state.width) : 0;
				const shell = this.shellTracks;
				const grid = `${shell[0]} minmax(0px, 1fr) ${shell.slice(2).join(" ")} ${Math.round(width)}px`.trim();
				this.frame.style.gridTemplateColumns = grid;
				if (this.column !== null) this.column.style.visibility = width > 0 ? "visible" : "hidden";
				if (this.handle !== null) {
					const left = Math.round(this.frameWidth - width);
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
				const sidebar = this.shellTracks.length >= 1 ? trackPx(this.shellTracks[0] ?? "") : 0;
				const details = this.shellTracks.length >= 3 ? trackPx(this.shellTracks[2] ?? "") : 0;
				const maxByContainer = Math.max(0, this.frameWidth - sidebar - details) - 400;
				if (maxByContainer < 280) return 0;
				return Math.min(560, maxByContainer, Math.max(280, requested));
			}
			/**
			* Mirror shell grid writes. Our own write is the shell's track count plus
			* one (the panel column), so a write at that count is kept; any other write
			* is the shell's (or a foreign plugin's), so its tracks are remembered and
			* our column is re-appended. Track count — not string equality — detects the
			* two cases, because the browser re-serializes `minmax(0, 1fr)` as
			* `minmax(0px, 1fr)` and a string comparison would never match.
			*/
			syncGrid() {
				if (this.frame === null) return;
				const inline = this.frame.style.gridTemplateColumns;
				if (inline === "") return;
				const tracks = parseGridTracks(inline);
				if (tracks.length === this.shellTracks.length + 1) return;
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
		//#region lib/types/client/api.js
		/**
		* NewsClaw REST client for the browser half. Talks to the user's local
		* backend directly (CORS is permissive); the base URL is user-configurable
		* and persisted in localStorage. Only user-consumption endpoints are used —
		* nothing crawling/source-management related.
		* @module @newsclaw/dsh-plugin
		*/
		/** localStorage key for the API base URL. */
		const API_BASE_KEY = "newsclaw.apiBase";
		/** Default local backend address. */
		const DEFAULT_API_BASE = "http://127.0.0.1:8430";
		/** Read the persisted API base URL (falling back to the default). */
		function readApiBase() {
			try {
				const saved = localStorage.getItem(API_BASE_KEY);
				if (saved !== null && saved.trim() !== "") return saved.trim().replace(/\/+$/, "");
			} catch {}
			return DEFAULT_API_BASE;
		}
		/** Persist the API base URL. */
		function writeApiBase(base) {
			try {
				localStorage.setItem(API_BASE_KEY, base.trim().replace(/\/+$/, ""));
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
			if (ms <= 0) return { cleanup() {} };
			const controller = new AbortController();
			const onOuterAbort = () => controller.abort();
			if (outer !== void 0) {
				if (outer.aborted) controller.abort();
				else outer.addEventListener("abort", onOuterAbort, { once: true });
			}
			const timer = window.setTimeout(() => controller.abort(), ms);
			return {
				signal: controller.signal,
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
			try {
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
			} catch {
				return null;
			}
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
		async function startChatTurn(base, message, session = "dsh", replyToTurnId, signal) {
			const body = {
				session,
				scope: "chat",
				message
			};
			if (replyToTurnId !== void 0 && replyToTurnId !== "") body.reply_to_turn_id = replyToTurnId;
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
		/** GET /api/config — the full backend config (masked secrets). */
		async function fetchConfig(base, signal) {
			const data = await requestJson(base, "/api/config", {
				timeoutMs: 15e3,
				signal
			});
			return typeof data === "object" && data !== null ? data : {};
		}
		/** PUT /api/config — partial update; only provided fields are modified and
		*  the backend persists + hot-reloads. */
		async function updateConfig(base, partial, signal) {
			return requestJson(base, "/api/config", {
				method: "PUT",
				body: partial,
				timeoutMs: 3e4,
				signal
			});
		}
		/** GET /api/runtime-status — backend readiness and counts. */
		async function fetchRuntimeStatus(base, signal) {
			try {
				const data = await requestJson(base, "/api/runtime-status", {
					timeoutMs: 8e3,
					signal
				});
				if (typeof data !== "object" || data === null) return null;
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
			} catch {
				return null;
			}
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
		/** Read source health through the same versioned Agent Bridge as DSH tools. */
		async function fetchSourceAvailability(base, signal) {
			const reply = await requestJson(base, "/api/agent-bridge", {
				method: "POST",
				body: {
					command: "source-availability",
					argv: []
				},
				timeoutMs: 1e4,
				signal
			});
			const root = typeof reply === "object" && reply !== null ? reply : {};
			if (root.ok !== true) throw new Error(firstText(root.error, root.message, "新闻源状态读取失败"));
			const data = root.data;
			const dataRow = typeof data === "object" && data !== null ? data : {};
			return (Array.isArray(data) ? data : Array.isArray(dataRow.items) ? dataRow.items : Array.isArray(dataRow.sources) ? dataRow.sources : Object.entries(dataRow).map(([id, value]) => ({
				id,
				...typeof value === "object" && value !== null ? value : {}
			}))).map((value) => {
				const row = typeof value === "object" && value !== null ? value : {};
				const rawState = firstText(row.state, row.status, row.health).toLowerCase();
				const state = rawState === "online" || rawState === "degraded" || rawState === "offline" ? rawState : "unknown";
				return {
					id: firstText(row.id, row.source_id, row.media),
					media: firstText(row.media, row.name, row.id),
					technical_provider: firstText(row.technical_provider, row.provider),
					state,
					last_success_at: firstText(row.last_success_at, row.last_success),
					error: firstText(row.error, row.last_error)
				};
			}).filter((item) => item.id !== "" || item.media !== "");
		}
		/** GET /api/profile-summary — the AI profile summary (canonical surface shape). */
		async function fetchProfileSummary(base, opts = {}) {
			try {
				const params = new URLSearchParams();
				params.set("limit", String(opts.limit ?? 5));
				if (opts.cursor !== void 0 && opts.cursor !== "") params.set("cursor", opts.cursor);
				const data = await requestJson(base, `/api/profile-summary?${params.toString()}`, {
					timeoutMs: 1e4,
					signal: opts.signal
				});
				if (typeof data !== "object" || data === null) return null;
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
			} catch {
				return null;
			}
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
			return { enabled: (typeof data === "object" && data !== null ? data : {}).enabled === true };
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
		/** Read init status. */
		async function fetchInitStatus(base, signal) {
			const data = await requestJson(base, "/api/init-status", {
				timeoutMs: 45e3,
				signal
			});
			const row = typeof data === "object" && data !== null ? data : {};
			return {
				initialized: row.initialized === true,
				running: row.running === true
			};
		}
		/** Restart initialization (rebuild profile + discovery pool). */
		async function startInit(base, payload, signal) {
			await requestJson(base, "/api/init", {
				method: "POST",
				timeoutMs: 6e4,
				signal,
				body: payload
			});
		}
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
					if (Date.now() - openedAt >= 8e3) this.#reconnectDelay = RECONNECT_BASE_MS;
					this.#onStatus?.(true);
				};
				socket.onmessage = (msg) => {
					this.#handleMessage(msg.data);
				};
				socket.onclose = () => {
					if (this.#socket === socket) this.#socket = null;
					this.#onStatus?.(false);
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
		//#region \0newsclaw-css:C:\Users\62574\Desktop\DSH插件工坊\10_插件\新闻爪\源码\dsh-newsclaw\src\client\panel.module.css.mjs
		const css = "._7A2Xza_panel{--newsclaw-bg:#fffafc;--newsclaw-sky:#f2f8ff;--newsclaw-surface:#ffffffd6;--newsclaw-surface-strong:#fffffff7;--newsclaw-surface-soft:#ffffffb8;--newsclaw-line:#d9e3f2f2;--newsclaw-line-strong:#f7adca80;--newsclaw-text:#20304a;--newsclaw-text-secondary:#60708c;--newsclaw-text-muted:#8290a8;--newsclaw-brand:#fb7299;--newsclaw-brand-strong:#f65788;--newsclaw-brand-soft:#fb72991f;--newsclaw-sky-blue:#5aa9ff;--newsclaw-sky-soft:#5aa9ff24;--newsclaw-success:#30b980;--newsclaw-danger:#ef7a86;--newsclaw-shadow-lg:0 20px 40px #384c701f;--newsclaw-shadow-sm:0 10px 22px #495d8214;min-width:0;height:100%;color:var(--newsclaw-text);background:radial-gradient(circle at 15% 8%, #fb729929, transparent 30%), radial-gradient(circle at 88% 12%, #5aa9ff2e, transparent 26%), linear-gradient(180deg, var(--newsclaw-bg) 0%, var(--newsclaw-sky) 100%);background-attachment:fixed;flex-direction:column;font-family:Avenir Next,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif;display:flex;position:relative;overflow:hidden}._7A2Xza_panel button,._7A2Xza_panel input,._7A2Xza_panel textarea{font-family:inherit}._7A2Xza_header{flex:none;align-items:center;gap:6px;padding:14px 14px 10px;display:flex}._7A2Xza_brand{flex:1;align-items:center;gap:9px;min-width:0;display:flex}._7A2Xza_brandMark{object-fit:cover;background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);border-radius:10px;flex:none;width:30px;height:30px;display:block;box-shadow:0 8px 16px #fb729940}._7A2Xza_brandCopy{flex-direction:column;min-width:0;display:flex}._7A2Xza_brandTitle{color:var(--newsclaw-text);letter-spacing:-.02em;white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:800;overflow:hidden}._7A2Xza_status{align-items:center;gap:4px;display:flex}._7A2Xza_statusDot{background:var(--newsclaw-danger);border-radius:50%;width:6px;height:6px}._7A2Xza_statusDot[data-state=online]{background:var(--newsclaw-success)}._7A2Xza_statusDot[data-state=degraded]{background:#f59e0b}._7A2Xza_statusText{color:var(--newsclaw-text-muted);font-size:10px}._7A2Xza_iconButton{width:30px;height:30px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffc2;border:1px solid #e6edf8eb;border-radius:10px;flex:none;justify-content:center;align-items:center;transition:background .15s,transform .15s;display:flex;position:relative}._7A2Xza_iconButton:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);transform:translateY(-1px)}._7A2Xza_bellBadge{background:var(--newsclaw-brand);color:#fff;min-width:16px;height:16px;box-shadow:0 0 0 2px var(--newsclaw-bg);border-radius:8px;justify-content:center;align-items:center;padding:0 4px;font-size:9px;font-weight:700;display:flex;position:absolute;top:-5px;right:-5px}._7A2Xza_settings{border-bottom:1px solid var(--newsclaw-line);flex-direction:column;gap:6px;padding:0 14px 10px;display:flex}._7A2Xza_settingsRow{align-items:center;gap:6px;display:flex}._7A2Xza_settingsInput{min-width:0;color:var(--newsclaw-text);background:#ffffffd9;border:1px solid #e6edf8eb;border-radius:8px;flex:1;padding:6px 9px;font-size:11px}._7A2Xza_hint{color:var(--newsclaw-text-muted);font-size:10.5px;line-height:1.5}._7A2Xza_tabBar{flex:none;gap:6px;padding:0 14px 12px;display:flex}._7A2Xza_tab{min-width:0;min-height:48px;color:var(--newsclaw-text-secondary);cursor:pointer;background:0 0;border:0;border-radius:16px;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:3px;padding:7px 4px;font-size:10px;font-weight:700;line-height:1.3;transition:background .18s,color .18s,box-shadow .18s,transform .18s;display:flex}._7A2Xza_tab:hover{color:var(--newsclaw-text);background:#ffffff85}._7A2Xza_tab[data-active=true]{color:var(--newsclaw-brand-strong);background:linear-gradient(#fffffffa,#fff0f6fa);transform:translateY(-1px);box-shadow:0 10px 18px #fb729924}._7A2Xza_badge{background:var(--newsclaw-brand);color:#fff;text-align:center;vertical-align:1px;border-radius:8px;min-width:15px;height:15px;margin-left:3px;padding:0 4px;font-size:9px;font-weight:700;line-height:15px;display:inline-block}._7A2Xza_body{flex-direction:column;flex:1;gap:12px;min-height:0;padding:2px 14px 20px;display:flex;overflow-y:auto}._7A2Xza_body>*{flex-shrink:0}._7A2Xza_empty{color:var(--newsclaw-text-muted);text-align:center;padding:26px 10px;font-size:12px;line-height:1.7}._7A2Xza_error{color:var(--newsclaw-danger);white-space:pre-wrap;background:#ef7a861a;border:1px solid #ef7a8640;border-radius:10px;padding:8px 10px;font-size:11.5px;line-height:1.5}._7A2Xza_toolbar{flex:none;align-items:center;gap:6px;display:flex}._7A2Xza_spacer{flex:1}._7A2Xza_sectionTitle{color:var(--newsclaw-text);margin:4px 0 2px;font-size:12px;font-weight:800}._7A2Xza_recHeader{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffe6,#fafbffe6);border:1px solid #e6edf8eb;border-radius:18px;align-items:flex-start;gap:8px;padding:14px;display:flex}._7A2Xza_recHeaderCopy{flex:1;min-width:0}._7A2Xza_recHeaderActions{flex-direction:column;align-items:stretch;gap:6px;display:flex}._7A2Xza_initPrompt{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffe6,#fafbffe6);border:1px solid #e6edf8eb;border-radius:16px;align-items:center;gap:10px;padding:12px 14px;display:flex}._7A2Xza_initPromptCopy{min-width:0;color:var(--newsclaw-text-secondary);flex-direction:column;flex:1;gap:4px;font-size:11px;line-height:1.55;display:flex}._7A2Xza_initPromptCopy strong{color:var(--newsclaw-text);font-size:13px}._7A2Xza_initPromptStatus{color:var(--newsclaw-text-muted)}._7A2Xza_recKicker{letter-spacing:.08em;text-transform:uppercase;color:var(--newsclaw-brand);font-size:9px;font-weight:700}._7A2Xza_recHeaderTitle{color:var(--newsclaw-text);letter-spacing:-.02em;margin-top:2px;font-size:16px;font-weight:800;line-height:1.35}._7A2Xza_poolChips{flex-direction:column;gap:4px;margin-top:8px;display:flex}._7A2Xza_poolChip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:6px;justify-content:space-between;gap:8px;padding:3px 7px;font-size:10px;line-height:1.5;display:flex}._7A2Xza_poolChipLabel{color:var(--newsclaw-text-muted);flex:none;font-weight:600}._7A2Xza_poolChipValue{text-align:right;word-break:break-word}._7A2Xza_spotlightCard{background:linear-gradient(#fffcfefa,#fcf8fffa);border:1px solid #fb729947;border-radius:18px;flex-direction:column;gap:6px;padding:12px;display:flex;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}._7A2Xza_spotlightKickerLine{align-items:center;gap:6px;display:flex}._7A2Xza_spotlightKicker{color:var(--newsclaw-brand-strong);font-size:12px;font-weight:800}._7A2Xza_spotlightCounter{color:var(--newsclaw-text-muted);margin-left:auto;font-size:10px}._7A2Xza_spotlightTitle{color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:14px;font-weight:800;line-height:1.4;display:-webkit-box;overflow:hidden}._7A2Xza_card{box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(#ffffffeb,#fafbffeb);border:1px solid #e6edf8eb;border-radius:16px;align-items:flex-start;gap:10px;padding:10px;transition:border-color .18s,box-shadow .18s;display:flex}._7A2Xza_card:hover{border-color:var(--newsclaw-line-strong);box-shadow:0 14px 26px #fb72991a}._7A2Xza_thumb{object-fit:cover;background:linear-gradient(145deg,#fb72991f,#5aa9ff1a);border-radius:10px;flex:none;width:84px;height:58px;display:block}._7A2Xza_thumbFallback{width:84px;height:58px;color:var(--newsclaw-text-secondary);background:linear-gradient(145deg,#fb72991f,#5aa9ff1a);border-radius:10px;flex:none;justify-content:center;align-items:center;font-size:16px;font-weight:700;display:flex}._7A2Xza_coverWrap{flex:none;position:relative}._7A2Xza_coverCorner{color:#fff;background:#20304a9e;border-radius:4px;padding:0 4px;font-size:8px;font-weight:700;line-height:13px;position:absolute;top:4px;left:4px}._7A2Xza_cardBody{flex-direction:column;flex:1;align-self:center;gap:3px;min-width:0;display:flex}._7A2Xza_cardTitle{min-height:36px;color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:13px;font-weight:800;line-height:1.4;display:-webkit-box;overflow:hidden}._7A2Xza_cardMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;align-items:center;gap:6px;font-size:10px;display:flex}._7A2Xza_mediaTag{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:4px;padding:0 5px;font-size:9px;font-weight:600;line-height:15px}._7A2Xza_badgeRow{flex-wrap:wrap;align-items:center;gap:5px;display:flex}._7A2Xza_stateBadge{color:var(--newsclaw-text-muted);background:#f0f6ffe6;border-radius:5px;padding:0 5px;font-size:9px;line-height:15px}._7A2Xza_topicBadge{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);border-radius:5px;padding:0 5px;font-size:9px;font-weight:700;line-height:15px}._7A2Xza_contextBadge{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:4px;padding:0 5px;font-size:9px;font-weight:600;line-height:15px}._7A2Xza_contextBadge[data-kind=restored]{color:var(--newsclaw-success);background:#30b9801f}._7A2Xza_contextBadge[data-kind=removed]{color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_stats{color:var(--newsclaw-text-muted);flex-wrap:wrap;gap:8px;font-size:10px;display:flex}._7A2Xza_expression{color:var(--newsclaw-text-secondary);-webkit-line-clamp:3;-webkit-box-orient:vertical;font-size:11.5px;line-height:1.6;display:-webkit-box;overflow:hidden}._7A2Xza_feedbackStatus{color:var(--newsclaw-text-muted);min-height:13px;font-size:10.5px;line-height:1.4}._7A2Xza_cardActions{flex-wrap:wrap;gap:6px;margin-top:3px;display:flex}._7A2Xza_actionButton{cursor:pointer;min-height:26px;color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border:0;border-radius:11px;padding:4px 10px;font-size:11px;font-weight:600;line-height:1.2;transition:background .18s,color .18s,box-shadow .18s,transform .18s}._7A2Xza_actionButton:hover:not(:disabled){color:var(--newsclaw-text);transform:translateY(-1px)}._7A2Xza_actionButton:disabled{cursor:not-allowed;opacity:.6;transform:none}._7A2Xza_actionButton[data-primary=true]{background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);color:#fff;font-weight:800;box-shadow:0 8px 14px #fb729938}._7A2Xza_actionButton[data-primary=true]:hover:not(:disabled){background:linear-gradient(135deg, var(--newsclaw-brand-strong), #ff7ca7);color:#fff}._7A2Xza_actionButton[data-danger=true]:hover:not(:disabled){color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_commentRow{align-items:center;gap:6px;display:flex}._7A2Xza_commentInput{min-width:0;color:var(--newsclaw-text);background:#ffffffd9;border:1px solid #e6edf8eb;border-radius:8px;flex:1;padding:4px 8px;font-size:11px}._7A2Xza_commentInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}._7A2Xza_loadMore{color:var(--newsclaw-text-secondary);cursor:pointer;background:0 0;border:1px dashed #d9e3f2f2;border-radius:10px;padding:7px;font-size:11.5px}._7A2Xza_loadMore:hover:not(:disabled){color:var(--newsclaw-text);border-color:var(--newsclaw-sky-blue)}._7A2Xza_loadMore:disabled{opacity:.5}._7A2Xza_loadingRow{color:var(--newsclaw-text-muted);justify-content:center;align-items:center;gap:8px;padding:10px 0 4px;font-size:11px;font-weight:700;display:flex}._7A2Xza_spinner{border:2px solid #fb729938;border-top-color:var(--newsclaw-brand);border-radius:999px;width:14px;height:14px;animation:.8s linear infinite _7A2Xza_newsclawSpin}@keyframes _7A2Xza_newsclawSpin{to{transform:rotate(360deg)}}._7A2Xza_activityFooter{border-top:1px solid var(--newsclaw-line);padding-top:8px}._7A2Xza_activityRow{color:var(--newsclaw-text-secondary);gap:8px;padding:4px 0;font-size:11px;line-height:1.5;display:flex}._7A2Xza_activityTime{color:var(--newsclaw-text-muted);flex:none;padding-top:1px;font-size:10px}._7A2Xza_subTabs{border:1px solid var(--newsclaw-line);background:#ffffffa8;border-radius:12px;flex:none;gap:4px;padding:4px;display:flex}._7A2Xza_subTab{color:var(--newsclaw-text-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:9px;flex:1;padding:6px 4px;font-size:10.5px;font-weight:700;line-height:1.4}._7A2Xza_subTab:hover{color:var(--newsclaw-text)}._7A2Xza_subTab[data-active=true]{background:var(--newsclaw-surface-strong);color:var(--newsclaw-brand-strong);box-shadow:var(--newsclaw-shadow-sm)}._7A2Xza_syncToolbar{flex-direction:column;align-items:flex-start;gap:5px;margin-bottom:10px;display:flex}._7A2Xza_syncMessage{color:var(--newsclaw-text-muted);min-height:13px;font-size:10.5px;line-height:1.45}._7A2Xza_syncMessage[data-tone=error]{color:var(--newsclaw-danger)}._7A2Xza_syncResults{border:1px solid var(--newsclaw-line);background:#fff9;border-radius:12px;flex-direction:column;gap:5px;max-height:140px;margin-bottom:10px;padding:7px 8px;display:flex;overflow-y:auto}._7A2Xza_syncLine{min-width:0;color:var(--newsclaw-text-secondary);align-items:center;gap:6px;font-size:10.5px;line-height:1.45;display:flex}._7A2Xza_syncLineText{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text);flex:0 auto;font-weight:700;overflow:hidden}._7A2Xza_syncLineDetail{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text-muted);flex:1;overflow:hidden}._7A2Xza_syncBadgeRow{align-items:center;gap:6px;min-width:0;display:flex}._7A2Xza_syncInlineDetail{text-overflow:ellipsis;white-space:nowrap;color:var(--newsclaw-text-muted);font-size:10px;overflow:hidden}._7A2Xza_syncChip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:999px;flex:none;padding:2px 7px;font-size:9.5px;font-weight:700;line-height:15px}._7A2Xza_syncChip[data-tone=success]{color:var(--newsclaw-success);background:#30b9801f}._7A2Xza_syncChip[data-tone=warning]{color:#8a6520;background:#ffc10724}._7A2Xza_syncChip[data-tone=error]{color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_syncChip[data-tone=info]{color:var(--newsclaw-brand-strong);background:var(--newsclaw-brand-soft)}._7A2Xza_savedFeedbackRow{flex-wrap:wrap;gap:5px;margin-top:3px;display:flex}._7A2Xza_historyRestoreList{flex-direction:column;gap:5px;margin-top:3px;display:flex}._7A2Xza_historyRestoreRow{align-items:center;gap:6px;display:flex}._7A2Xza_historyRestoreLabel{color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}._7A2Xza_turn{flex-direction:column;gap:3px;display:flex}._7A2Xza_turnUser,._7A2Xza_turnSoul{white-space:pre-wrap;word-break:break-word;border-radius:14px;padding:8px 11px;font-size:12px;line-height:1.6}._7A2Xza_turnUser{background:var(--newsclaw-brand-soft);color:var(--newsclaw-text);align-self:flex-end;max-width:92%}._7A2Xza_turnSoul{border:1px solid var(--newsclaw-line);color:var(--newsclaw-text);background:#ffffffe6;align-self:flex-start;max-width:92%}._7A2Xza_turnStatus{color:var(--newsclaw-text-muted);align-self:flex-end;font-size:10px}._7A2Xza_chatInputRow{border-top:1px solid var(--newsclaw-line);flex:none;gap:6px;padding-top:8px;display:flex}._7A2Xza_chatInput{min-width:0;color:var(--newsclaw-text);resize:none;background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:12px;flex:1;padding:8px 10px;font-size:12px}._7A2Xza_chatInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}._7A2Xza_chatSend{background:linear-gradient(135deg, var(--newsclaw-brand), #ff8cb0);color:#fff;cursor:pointer;border:0;border-radius:12px;padding:0 14px;font-size:12px;font-weight:800;box-shadow:0 8px 14px #fb729938}._7A2Xza_chatSend:hover:not(:disabled){background:linear-gradient(135deg, var(--newsclaw-brand-strong), #ff7ca7)}._7A2Xza_chatSend:disabled{opacity:.6}._7A2Xza_confirmPanel{border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:14px;flex:none;overflow:hidden}._7A2Xza_confirmToggle{width:100%;color:var(--newsclaw-text);cursor:pointer;text-align:left;background:0 0;border:none;align-items:center;gap:6px;padding:9px 11px;font-size:12px;font-weight:800;display:flex}._7A2Xza_confirmToggle:hover{background:var(--newsclaw-brand-soft)}._7A2Xza_confirmCount{color:#fff;background:var(--newsclaw-brand);border-radius:8px;margin-left:auto;padding:1px 7px;font-size:10px;font-weight:700}._7A2Xza_confirmItem{border-top:1px solid var(--newsclaw-line);flex-direction:column;gap:4px;padding:10px 11px;display:flex}._7A2Xza_confirmTitle{color:var(--newsclaw-text);font-size:12px;font-weight:800;line-height:1.5}._7A2Xza_cardTurn{border:1px solid var(--newsclaw-line);background:#ffffffe6;border-radius:14px;flex-direction:column;gap:4px;padding:10px 11px;display:flex}._7A2Xza_insightEvidence{color:var(--newsclaw-text-secondary);white-space:pre-wrap;font-size:11px;line-height:1.55}._7A2Xza_insightNote{color:var(--newsclaw-text-muted);font-size:10.5px}._7A2Xza_probeConfidence{color:var(--newsclaw-text-muted);font-size:10px}._7A2Xza_portrait{color:var(--newsclaw-text);border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:14px;padding:11px 12px;font-size:12.5px;line-height:1.7}._7A2Xza_chipRow{flex-wrap:wrap;gap:5px;display:flex}._7A2Xza_chip{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:11px;padding:2px 8px;font-size:10.5px;font-weight:600;line-height:1.6}._7A2Xza_chip[data-kind=dislike]{color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_interestDomain{margin-bottom:6px}._7A2Xza_interestDomainHead{color:var(--newsclaw-text);align-items:center;gap:6px;font-size:12px;font-weight:800;display:flex}._7A2Xza_domainWeight{color:var(--newsclaw-text-muted);font-size:10px;font-weight:600}._7A2Xza_awarenessRow{color:var(--newsclaw-text-secondary);padding:4px 0;font-size:11px;line-height:1.55}._7A2Xza_awarenessDate{color:var(--newsclaw-text-muted);margin-right:6px}._7A2Xza_probe{border:1px solid var(--newsclaw-line);background:#ffffffd9;border-radius:12px;flex-direction:column;gap:4px;padding:10px 11px;display:flex}._7A2Xza_probeDomain{color:var(--newsclaw-text);font-size:12px;font-weight:800}._7A2Xza_probeReason{color:var(--newsclaw-text-secondary);font-size:11.5px;line-height:1.55}._7A2Xza_probeActions{flex-wrap:wrap;gap:6px;margin-top:2px;display:flex}._7A2Xza_drawerOverlay{z-index:10;backdrop-filter:blur(2px);background:#20304a47;flex-direction:column;justify-content:flex-start;display:flex;position:absolute;inset:0}._7A2Xza_drawerPanel{background:radial-gradient(circle at 15% 4%, #fb729924, transparent 30%), var(--newsclaw-bg);border-radius:18px 18px 0 0;flex-direction:column;flex:1;gap:10px;min-height:0;margin-top:8px;padding:14px 14px 24px;display:flex;overflow-y:auto}._7A2Xza_drawerHeader{border-bottom:1px solid var(--newsclaw-line);justify-content:space-between;align-items:center;padding-bottom:10px;display:flex}._7A2Xza_drawerTitle{color:var(--newsclaw-text);align-items:center;gap:6px;font-size:15px;font-weight:800;display:flex}._7A2Xza_messageCard{background:var(--newsclaw-surface-strong);border:1px solid var(--newsclaw-line);border-radius:14px;flex-direction:column;gap:5px;padding:11px 12px;display:flex}._7A2Xza_messageCard[data-tone=interest]{background:linear-gradient(135deg,#fff8e8,#fff0d5);border-color:#dd7f2d47}._7A2Xza_messageCard[data-tone=avoidance]{background:linear-gradient(135deg,#eef7ff,#e1effc);border-color:#3b82f647}._7A2Xza_messageCard[data-tone=challenge]{background:linear-gradient(135deg,#f7f2ff,#ede9fe);border-color:#7c3aed47}._7A2Xza_messageCard[data-tone=spotlight]{background:linear-gradient(135deg,#fff5f8,#ffe9f0);border-color:#fb729952}._7A2Xza_messageType{color:var(--newsclaw-text-secondary);align-items:center;gap:5px;font-size:10.5px;font-weight:800;display:flex}._7A2Xza_messageCard[data-tone=interest] ._7A2Xza_messageType{color:#c26a1d}._7A2Xza_messageCard[data-tone=avoidance] ._7A2Xza_messageType{color:#2b6cc4}._7A2Xza_messageCard[data-tone=challenge] ._7A2Xza_messageType{color:#7c3aed}._7A2Xza_messageCard[data-tone=spotlight] ._7A2Xza_messageType{color:var(--newsclaw-brand-strong)}._7A2Xza_messagePrompt{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.5}._7A2Xza_messageTitle{color:var(--newsclaw-text);font-size:13px;font-weight:800;line-height:1.45}._7A2Xza_messageBody{color:#55657f;-webkit-line-clamp:4;-webkit-box-orient:vertical;font-size:11px;line-height:1.55;display:-webkit-box;overflow:hidden}._7A2Xza_messageActions{flex-wrap:wrap;gap:6px;margin-top:2px;display:flex}._7A2Xza_drawerEmpty{color:var(--newsclaw-text-muted);flex-direction:column;align-items:center;gap:8px;padding:34px 20px;display:flex}._7A2Xza_drawerEmptyTitle{font-size:13px;font-weight:700}._7A2Xza_drawerEmptySubtitle{opacity:.75;font-size:11px}._7A2Xza_recCard{background:linear-gradient(#fffffffa,#fafbfffa);border:1px solid #ebf0f8fa;border-radius:18px;flex-direction:column;gap:9px;padding:10px;transition:border-color .18s,box-shadow .18s;display:flex;box-shadow:inset 0 1px #ffffffd1}._7A2Xza_recCard:hover{border-color:var(--newsclaw-line-strong);box-shadow:0 18px 32px #fb729924}._7A2Xza_recCover{aspect-ratio:16/9;cursor:pointer;width:100%;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb72991f,#5aa9ff1a),#f6f9fff0;border:0;border-radius:13px;justify-content:center;align-items:center;padding:0;font-size:12px;font-weight:700;line-height:1.5;display:flex;position:relative;overflow:hidden}._7A2Xza_recCover img{object-fit:cover;width:100%;height:100%;display:block}._7A2Xza_recCoverText{color:var(--newsclaw-text);-webkit-line-clamp:4;-webkit-box-orient:vertical;padding:12px;font-size:12px;line-height:1.6;display:-webkit-box;overflow:hidden}._7A2Xza_recCover ._7A2Xza_coverCorner{top:8px;left:8px}._7A2Xza_recBody{flex-direction:column;gap:4px;padding:0 2px;display:flex}._7A2Xza_recTitle{color:var(--newsclaw-text);letter-spacing:-.01em;-webkit-line-clamp:2;word-break:break-word;-webkit-box-orient:vertical;font-size:15px;font-weight:800;line-height:1.38;display:-webkit-box;overflow:hidden}._7A2Xza_spotlightRow{align-items:stretch;gap:10px;display:flex}._7A2Xza_spotlightThumb{object-fit:cover;border-radius:12px;flex:none;align-self:center;width:96px;height:96px;box-shadow:inset 0 1px #ffffffb8}._7A2Xza_spotlightThumbFallback{box-sizing:border-box;width:96px;height:96px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb729924,#5aa9ff1f);border-radius:12px;flex:none;justify-content:center;align-self:center;align-items:center;padding:8px;font-size:10.5px;font-weight:700;line-height:1.5;display:flex;overflow:hidden}._7A2Xza_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729947;border-radius:18px;flex-shrink:0;grid-template-columns:minmax(0,1fr) 40px;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:grid;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}._7A2Xza_spotlightRow{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;grid-area:1/1;align-items:center;gap:10px;padding:10px;display:flex}._7A2Xza_spotlightThumb{aspect-ratio:16/9;object-fit:cover;background:linear-gradient(#fffffffa,#fff8fcf0),linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:12px;flex:none;width:104px;height:auto;transition:transform .2s,box-shadow .2s;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}._7A2Xza_spotlightCard:hover ._7A2Xza_spotlightThumb{transform:scale(1.02);box-shadow:inset 0 1px #ffffffb8,0 6px 14px #fb729938}._7A2Xza_spotlightText{flex-direction:column;flex:1;gap:6px;min-width:0;display:flex}._7A2Xza_spotlightKickerLine{flex-wrap:wrap;align-items:center;gap:5px;min-width:0;display:flex}._7A2Xza_spotlightKicker{color:var(--newsclaw-brand-strong);letter-spacing:.02em;text-overflow:ellipsis;white-space:nowrap;background:#fb72991a;border-radius:999px;max-width:100%;padding:2px 7px;font-size:9.5px;font-weight:700;overflow:hidden}._7A2Xza_spotlightCounter{color:var(--newsclaw-text-muted);white-space:nowrap;background:#0000000a;border-radius:8px;flex:none;padding:1px 6px;font-size:10px;font-weight:600}._7A2Xza_spotlightNav:active:not(:disabled){transform:scale(.94)}._7A2Xza_spotlightDismiss{color:var(--newsclaw-text-muted);cursor:pointer;background:0 0;border:0;border-left:1px solid #eddbe999;grid-area:1/2;font-size:15px;line-height:1;transition:background .15s,color .15s}._7A2Xza_spotlightBody{border-top:1px solid #eddbe999;flex-direction:column;grid-area:2/1/auto/-1;gap:8px;padding:4px 12px 12px;display:flex}._7A2Xza_activityFooter{border:1px solid var(--newsclaw-line);backdrop-filter:blur(18px);box-shadow:var(--newsclaw-shadow-sm);background:#ffffffa8;border-radius:14px;flex-direction:column;gap:8px;padding:10px 12px;display:flex}._7A2Xza_activityLine{color:var(--newsclaw-text-secondary);font-size:11.5px;line-height:1.5}._7A2Xza_footerItem{background:#fffc;border:1px solid #dfe7f3f5;border-radius:12px;flex-direction:column;gap:3px;padding:8px 10px;display:flex}._7A2Xza_footerItemMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;align-items:center;gap:7px;font-size:9.5px;font-weight:700;line-height:1.4;display:flex}._7A2Xza_footerItemKind{min-height:18px;color:var(--newsclaw-text-secondary);background:#fffffff5;border:1px solid #dfe7f3f5;border-radius:999px;align-items:center;padding:2px 7px;display:inline-flex}._7A2Xza_footerItemSummary{color:var(--newsclaw-text-secondary);word-break:break-word;font-size:11px;line-height:1.55}._7A2Xza_pinnedFooter{border-top:1px solid var(--newsclaw-line);backdrop-filter:blur(18px);background:#ffffff80;flex:none;padding:9px 14px 12px}._7A2Xza_pinnedFooter ._7A2Xza_activityFooter{box-shadow:none;backdrop-filter:none;background:0 0;border:0;border-radius:0;gap:5px;margin:0;padding:6px 2px 2px}._7A2Xza_expression{-webkit-line-clamp:unset;display:block;overflow:visible}._7A2Xza_savedToggle{min-width:38px;min-height:26px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#f0f6ffe6;border:0;border-radius:11px;justify-content:center;align-items:center;transition:background .15s,color .15s,transform .15s;display:inline-flex}._7A2Xza_savedToggle:hover:not(:disabled){color:var(--newsclaw-text);transform:translateY(-1px)}._7A2Xza_savedToggle:disabled{opacity:.6;cursor:wait}._7A2Xza_savedToggle[data-pressed=true]._7A2Xza_watchToggle{color:var(--newsclaw-brand-strong);background:var(--newsclaw-brand-soft)}._7A2Xza_savedToggle[data-pressed=true]._7A2Xza_starToggle{color:#e8a33d;background:#e8a33d1f}._7A2Xza_savedToggle[data-pressed=true]._7A2Xza_starToggle svg{fill:currentColor}._7A2Xza_feedbackStatus{color:var(--newsclaw-brand-strong);min-height:15px;margin-top:2px;font-size:11px;line-height:1.5}._7A2Xza_feedbackStatus[data-tone=success]{color:var(--newsclaw-success)}._7A2Xza_feedbackStatus[data-tone=error]{color:var(--newsclaw-danger)}._7A2Xza_commentComposer{flex-direction:column;gap:6px;margin-top:2px;display:flex}._7A2Xza_commentComposer textarea{box-sizing:border-box;width:100%;color:var(--newsclaw-text);resize:vertical;background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:10px;padding:8px 9px;font-family:inherit;font-size:11.5px}._7A2Xza_commentComposer textarea:focus{border-color:var(--newsclaw-sky-blue);outline:none}._7A2Xza_commentComposer ._7A2Xza_actionButton{align-self:flex-end}._7A2Xza_activityFooter{background:linear-gradient(#fffffffa,#f2f6fdf5);border:1px solid #dfe7f3fa;border-radius:18px;flex-direction:column;gap:10px;margin:0;padding:12px 14px;display:flex;box-shadow:0 12px 24px #495d8214}._7A2Xza_footerHead{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}._7A2Xza_footerCopy{flex-direction:column;flex:auto;gap:6px;min-width:0;display:flex}._7A2Xza_footerHint{color:#41506b;min-height:18px;margin:0;padding-left:20px;font-size:12px;font-weight:700;line-height:1.6;position:relative}._7A2Xza_footerHint:before{content:\"\";background:var(--newsclaw-sky-blue);border-radius:999px;width:9px;height:9px;position:absolute;top:50%;left:0;transform:translateY(-50%);box-shadow:0 0 0 4px #5aa9ff1f}._7A2Xza_footerHeadline{min-height:16px;color:var(--newsclaw-text-muted);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:0;padding-left:20px;font-size:10.5px;font-weight:700;line-height:1.55;display:-webkit-box;position:relative;overflow:hidden}._7A2Xza_footerHeadline:before{content:\"\";background:#fb72994d;border-radius:999px;width:9px;height:9px;position:absolute;top:50%;left:0;transform:translateY(-50%);box-shadow:0 0 0 4px #fb729914}._7A2Xza_footerToggle{min-height:32px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffdb;border:0;border-radius:999px;flex-shrink:0;padding:7px 12px;font-size:11px;font-weight:800;line-height:1;box-shadow:0 8px 18px #495d8214}._7A2Xza_footerToggle:hover{color:var(--newsclaw-text)}._7A2Xza_footerHistory{flex-direction:column;gap:8px;max-height:190px;display:flex;overflow-y:auto}._7A2Xza_pendingItem{border-top:1px solid var(--newsclaw-line);grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px;display:grid}._7A2Xza_pendingCopy{gap:2px;min-width:0;display:grid}._7A2Xza_pendingCopy strong{overflow-wrap:anywhere;color:var(--newsclaw-text);font-size:12px;font-weight:800;line-height:1.45}._7A2Xza_pendingKind,._7A2Xza_pendingConfidence{color:var(--newsclaw-text-secondary);font-size:10.5px;font-weight:700}._7A2Xza_pendingOpen{cursor:pointer;border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-brand-soft);min-width:52px;min-height:34px;color:var(--newsclaw-brand-strong);border-radius:999px;padding:6px 12px;font-size:11px;font-weight:800}._7A2Xza_pendingOpen:hover:not(:disabled){background:#fb729933}._7A2Xza_pendingOpen:disabled{opacity:.6;cursor:wait}._7A2Xza_dialogueCard{box-sizing:border-box;overflow-wrap:anywhere;border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-surface-strong);width:100%;box-shadow:var(--newsclaw-shadow-sm);border-radius:14px;flex-direction:column;gap:5px;padding:12px;display:flex}._7A2Xza_dialogueCard[data-card-state=confirmed]{border-color:#30b9808c}._7A2Xza_dialogueCard[data-card-state=rejected]{border-color:#ef7a8694}._7A2Xza_dialogueCard[data-card-state=deferred]{border-color:#8f9bb09e}._7A2Xza_dialogueKicker{color:var(--newsclaw-brand-strong);letter-spacing:.06em;font-size:10.5px;font-weight:800}._7A2Xza_dialogueTitle{color:var(--newsclaw-text);font-size:13.5px;font-weight:700;line-height:1.55}._7A2Xza_dialogueState{color:var(--newsclaw-text-secondary);font-size:11.5px;font-weight:700}._7A2Xza_dialogueEvidence{color:var(--newsclaw-text-secondary);font-size:11.5px}._7A2Xza_dialogueEvidence summary{cursor:pointer;width:fit-content;color:var(--newsclaw-text-secondary);align-items:center;font-weight:700;display:flex}._7A2Xza_dialogueEvidence ul{gap:5px;margin:3px 0 0 16px;line-height:1.55;display:grid}._7A2Xza_dialogueActions{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:6px;display:grid}._7A2Xza_dialogueAction{cursor:pointer;border:1px solid var(--newsclaw-line);background:var(--newsclaw-surface);min-width:0;min-height:34px;color:var(--newsclaw-text);border-radius:999px;padding:7px;font-size:12px;font-weight:800;transition:background .15s,transform .15s}._7A2Xza_dialogueAction:hover:not(:disabled){transform:translateY(-1px)}._7A2Xza_dialogueAction:disabled{cursor:default;opacity:.5}._7A2Xza_dialogueAction._7A2Xza_action_confirm{color:var(--newsclaw-success)}._7A2Xza_dialogueAction._7A2Xza_action_reject{color:var(--newsclaw-danger)}._7A2Xza_dialogueAction._7A2Xza_action_discuss{color:var(--newsclaw-brand-strong)}._7A2Xza_contextBar{border:1px solid var(--newsclaw-line-strong);background:var(--newsclaw-surface-soft);border-radius:12px;flex-direction:column;flex:none;gap:4px;min-width:0;padding:9px 11px;display:flex}._7A2Xza_contextBarHead{justify-content:space-between;align-items:center;gap:8px;display:flex}._7A2Xza_contextLabel{letter-spacing:.04em;color:var(--newsclaw-brand-strong);font-size:10px;font-weight:800}._7A2Xza_contextTitle{color:var(--newsclaw-text);overflow-wrap:anywhere;font-size:12.5px;font-weight:800;line-height:1.45}._7A2Xza_contextObservation{color:var(--newsclaw-text-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:1.55;display:-webkit-box;overflow:hidden}._7A2Xza_contextInterpretation{color:#2b6cc4;font-size:10.5px;font-weight:600;line-height:1.5}._7A2Xza_contextClear{color:var(--newsclaw-text-secondary);cursor:pointer;background:#fffc;border:0;border-radius:999px;flex:none;padding:4px 10px;font-size:10.5px;font-weight:700}._7A2Xza_contextClear:hover{color:var(--newsclaw-text)}._7A2Xza_replyQuote{border-left:3px solid var(--newsclaw-brand);background:var(--newsclaw-brand-soft);border-radius:8px;flex-direction:column;gap:1px;min-width:0;padding:6px 9px;display:flex}._7A2Xza_replyQuote span{color:var(--newsclaw-brand-strong);letter-spacing:.04em;font-size:9.5px;font-weight:800}._7A2Xza_replyQuote strong{color:var(--newsclaw-text-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.4;overflow:hidden}._7A2Xza_viewIntro{padding:2px 4px 0}._7A2Xza_viewKicker{letter-spacing:.08em;text-transform:uppercase;color:var(--newsclaw-brand);font-size:9px;font-weight:700}._7A2Xza_viewIntro h2{color:var(--newsclaw-text);letter-spacing:-.02em;margin:2px 0 0;font-size:15px;font-weight:800;line-height:1.35}._7A2Xza_viewIntro p{color:var(--newsclaw-text-secondary);margin:3px 0 0;font-size:11px;line-height:1.6}._7A2Xza_profileCard{flex-direction:column;gap:10px;display:flex}._7A2Xza_profileSummary{background:#fcfafbf5;border:1px solid #e4dce8b3;border-radius:16px;padding:14px 16px}._7A2Xza_profilePortraitP{color:var(--newsclaw-text);text-indent:1.6em;margin:0;font-size:12.5px;line-height:1.85}._7A2Xza_profilePortraitP:first-child{text-indent:0}._7A2Xza_profileLayer{text-transform:uppercase;letter-spacing:.05em;color:var(--newsclaw-text-muted);border-bottom:1px solid #e7eef899;margin-top:10px;margin-bottom:2px;padding:5px 0;font-size:9.5px;font-weight:700}._7A2Xza_profileGroup{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:16px;flex-direction:column;gap:8px;padding:12px 14px;display:flex}._7A2Xza_profileGroup h3{color:var(--newsclaw-text);margin:0;font-size:12px;font-weight:800;line-height:1.4}._7A2Xza_cognitionCard{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:14px;padding:8px 10px}._7A2Xza_cognitionToggle{text-align:left;cursor:pointer;width:100%;color:var(--newsclaw-text);background:0 0;border:0;flex-direction:column;gap:3px;padding:0;display:flex}._7A2Xza_cognitionToggle:disabled{cursor:default}._7A2Xza_cognitionSummary{font-size:11.5px;font-weight:700;line-height:1.5}._7A2Xza_cognitionContext{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.45}._7A2Xza_cognitionMeta{color:var(--newsclaw-text-muted);flex-wrap:wrap;gap:6px;font-size:9.5px;display:flex}._7A2Xza_cognitionSource{color:var(--newsclaw-brand-strong)}._7A2Xza_cognitionDetails{border-top:1px dashed #d9e3f2f2;flex-direction:column;gap:5px;margin-top:7px;padding-top:7px;display:flex}._7A2Xza_cognitionDetail{color:var(--newsclaw-text-secondary);font-size:10.5px;line-height:1.55}._7A2Xza_cognitionDetailLabel{color:var(--newsclaw-text);margin-right:5px;font-weight:800}._7A2Xza_profilePhaseCopy{color:var(--newsclaw-text-secondary);margin:0;font-size:12px;line-height:1.7}._7A2Xza_chip[data-tone=brand]{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}._7A2Xza_chip[data-tone=success]{color:var(--newsclaw-success);background:#30b9801f}._7A2Xza_chip[data-tone=danger]{color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_chipWeight{opacity:.75;margin-left:3px;font-size:9px}._7A2Xza_mbtiContainer{flex-direction:column;gap:8px;display:flex}._7A2Xza_mbtiTypeRow{align-items:baseline;gap:8px;display:flex}._7A2Xza_mbtiTypeLabel{color:var(--newsclaw-brand-strong);letter-spacing:.02em;font-size:18px;font-weight:800}._7A2Xza_mbtiConfidence{color:var(--newsclaw-text-muted);background:#e7eef8f5;border-radius:999px;padding:2px 8px;font-size:9.5px;font-weight:600}._7A2Xza_mbtiDimensions{flex-direction:column;gap:6px;display:flex}._7A2Xza_mbtiDimRow{align-items:center;gap:8px;font-size:10.5px;display:flex}._7A2Xza_mbtiDimPole{text-align:center;width:20px;color:var(--newsclaw-brand-strong);font-weight:700}._7A2Xza_mbtiDimBar{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}._7A2Xza_mbtiDimBarFill{background:linear-gradient(90deg,#f7828e,#c7698f);border-radius:3px;height:100%}._7A2Xza_mbtiDimPct{text-align:right;width:32px;color:var(--newsclaw-text-muted);font-size:9.5px}._7A2Xza_interestTree{flex-direction:column;gap:8px;display:flex}._7A2Xza_interestTreeLabel{font-size:11.5px;font-weight:700}._7A2Xza_interestTreeLabel[data-tone=sky]{color:var(--newsclaw-sky-blue)}._7A2Xza_interestTreeLabel[data-tone=danger]{color:var(--newsclaw-danger)}._7A2Xza_interestDomain{flex-direction:column;gap:5px;display:flex}._7A2Xza_interestDomainHeader{align-items:center;gap:6px;display:flex}._7A2Xza_interestDomainName{color:var(--newsclaw-text);font-size:12px;font-weight:800}._7A2Xza_interestDomainWeight{color:var(--newsclaw-text-muted);background:#e7eef8f5;border-radius:999px;padding:1px 7px;font-size:9.5px;font-weight:600}._7A2Xza_barRow{align-items:center;gap:8px;font-size:11px;display:flex}._7A2Xza_barLabel{min-width:64px;color:var(--newsclaw-text-secondary)}._7A2Xza_barTrack{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}._7A2Xza_barFill{background:linear-gradient(90deg,#397fcb,#5e9fd9);border-radius:3px;height:100%}._7A2Xza_barPct{text-align:right;width:34px;color:var(--newsclaw-text-muted);font-size:9.5px}._7A2Xza_contextRow{gap:8px;font-size:11px;display:flex}._7A2Xza_contextLabel{color:var(--newsclaw-text-secondary);flex:none;min-width:44px}._7A2Xza_contextValue{color:var(--newsclaw-text)}._7A2Xza_probe[data-tone=interest]{background:linear-gradient(135deg,#fff8e8,#fff0d5);border-color:#dd7f2d47}._7A2Xza_probe[data-tone=avoidance]{background:linear-gradient(135deg,#eef7ff,#e1effc);border-color:#3b82f647}._7A2Xza_probeHead{justify-content:space-between;align-items:center;gap:8px;display:flex}._7A2Xza_insightCard{border:1px solid var(--newsclaw-line);background:#fffffff0;border-radius:14px;flex-direction:column;gap:7px;padding:12px 14px;display:flex}._7A2Xza_insightCard[data-validated]{border-color:#30b98080}._7A2Xza_insightHead{align-items:flex-start;gap:6px;display:flex}._7A2Xza_insightTitle{color:var(--newsclaw-text);flex:1;font-size:12px;font-weight:800;line-height:1.5}._7A2Xza_insightValidated{color:var(--newsclaw-success);background:#30b9801f;border-radius:999px;flex:none;padding:2px 7px;font-size:9.5px;font-weight:700}._7A2Xza_insightConfidenceRow{align-items:center;gap:8px;display:flex}._7A2Xza_insightConfidenceBar{background:#e7eef8f5;border-radius:3px;flex:1;height:6px;overflow:hidden}._7A2Xza_insightConfidenceFill{background:linear-gradient(90deg,#f7828e,#c7698f);border-radius:3px;height:100%}._7A2Xza_insightConfidenceLabel{color:var(--newsclaw-text-muted);text-align:right;width:32px;font-size:9.5px}._7A2Xza_insightEvidenceList{color:var(--newsclaw-text-secondary);gap:4px;margin:0;padding-left:16px;font-size:11px;line-height:1.55;display:grid}._7A2Xza_awarenessList{flex-direction:column;gap:8px;display:flex}._7A2Xza_awarenessItem{background:#fffcf7f7;border:1px solid #f0e6d7e6;border-radius:14px;flex-direction:column;gap:4px;padding:10px 13px;display:flex}._7A2Xza_awarenessHeader{align-items:center;gap:8px;display:flex}._7A2Xza_awarenessItemDate{color:var(--newsclaw-text-muted);white-space:nowrap;font-size:10px}._7A2Xza_awarenessEmotion{color:var(--newsclaw-brand);font-size:10px;font-weight:600}._7A2Xza_awarenessObservation{color:var(--newsclaw-text);font-size:11.5px;line-height:1.65}._7A2Xza_awarenessTrend{color:var(--newsclaw-text-secondary);border-left:2px solid #fb729940;padding-left:8px;font-size:11px;line-height:1.5}._7A2Xza_questionCard{box-sizing:border-box;width:100%;box-shadow:var(--newsclaw-shadow-sm);background:linear-gradient(135deg,#eef7ff,#e1effc);border:1px solid #3b82f647;border-radius:14px;flex-direction:column;gap:6px;padding:12px;display:flex}._7A2Xza_pendingObservation{color:var(--newsclaw-text-secondary);font-size:11px;line-height:1.55}._7A2Xza_pendingInterpretation{color:var(--newsclaw-sky-blue);font-size:10.5px;font-weight:600;line-height:1.5}._7A2Xza_questionObservation{color:var(--newsclaw-text);background:#ffffffb3;border-radius:8px;padding:6px 9px;font-size:11.5px;line-height:1.6}._7A2Xza_questionInterpretation{color:#2b6cc4;font-size:11px;font-weight:600;line-height:1.55}._7A2Xza_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729938;border-radius:16px;flex-direction:column;grid-template-columns:none;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}._7A2Xza_spotlightKicker{color:var(--newsclaw-brand-strong);letter-spacing:.02em;white-space:nowrap;background:#fb72991a;border-radius:999px;padding:2px 7px;font-size:9.5px;font-weight:700}._7A2Xza_spotlightMedia{color:var(--newsclaw-text-muted);white-space:nowrap;background:#0000000d;border-radius:999px;flex:none;padding:2px 6px;font-size:9.5px;font-weight:600}._7A2Xza_spotlightCounter{color:var(--newsclaw-text-muted);white-space:nowrap;flex:none;font-size:10px;font-weight:600}._7A2Xza_spotlightNav{width:26px;height:26px;color:var(--newsclaw-brand-strong);cursor:pointer;background:#fffc;border:1px solid #fb729938;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;font-size:14px;font-weight:700;line-height:1;transition:background .15s,border-color .15s;display:inline-flex}._7A2Xza_spotlightNav:hover:not(:disabled){background:#fb729924;border-color:#fb729973}._7A2Xza_spotlightNav:disabled{opacity:.32;cursor:default}._7A2Xza_spotlightDismiss{width:26px;height:26px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#0000000a;border:0;border-left-width:medium;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;font-size:15px;line-height:1;transition:background .15s,color .15s;display:inline-flex}._7A2Xza_spotlightRow{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;align-items:center;gap:10px;padding:8px 10px 10px;display:flex}._7A2Xza_spotlightThumb{aspect-ratio:auto;object-fit:cover;background:linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:10px;flex:none;width:104px;height:58px;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}._7A2Xza_spotlightThumbFallback{aspect-ratio:auto;box-sizing:border-box;width:104px;height:58px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:10px;flex:none;justify-content:center;align-items:center;padding:4px;font-size:9px;font-weight:700;line-height:1.4;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffb8}._7A2Xza_spotlightText{flex:1;align-items:center;min-width:0;display:flex}._7A2Xza_spotlightTitle{min-width:0;color:var(--newsclaw-text);-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;font-size:12.5px;font-weight:700;line-height:1.55;display:-webkit-box;overflow:hidden}._7A2Xza_spotlightChevron{width:24px;height:24px;color:var(--newsclaw-text-muted);cursor:pointer;background:#ffffffb3;border:0;border-radius:50%;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}._7A2Xza_spotlightCard{background:radial-gradient(circle at 100% 0,#fb729924,#0000 38%),linear-gradient(#fffcfefa,#f6fafffa);border:1px solid #fb729947;border-radius:18px;flex-direction:column;flex-shrink:0;gap:0;padding:0;transition:border-color .2s,box-shadow .2s;display:flex;overflow:hidden;box-shadow:inset 0 1px #ffffffd1,0 4px 14px #fb72991a}._7A2Xza_spotlightCard:hover{border-color:#fb729980;box-shadow:inset 0 1px #ffffffd1,0 12px 28px #fb72992e}._7A2Xza_spotlightHeader{align-items:center;gap:7px;min-width:0;padding:10px 12px 2px;display:flex}._7A2Xza_spotlightMain{cursor:pointer;text-align:left;min-width:0;color:inherit;background:0 0;border:0;flex-direction:column;gap:8px;padding:4px 10px 10px;display:flex}._7A2Xza_spotlightCover{aspect-ratio:16/9;background:linear-gradient(#fffffffa,#fff8fcf0),linear-gradient(145deg,#fb72992e,#a855f71f);border:1px solid #ffffffeb;border-radius:14px;width:100%;transition:box-shadow .2s;display:block;position:relative;overflow:hidden;box-shadow:inset 0 1px #ffffffb8,0 2px 8px #fb72991f}._7A2Xza_spotlightCard:hover ._7A2Xza_spotlightCover{box-shadow:inset 0 1px #ffffffb8,0 8px 18px #fb729938}._7A2Xza_spotlightHero{object-fit:cover;width:100%;height:100%;transition:transform .35s;display:block}._7A2Xza_spotlightCard:hover ._7A2Xza_spotlightHero{transform:scale(1.03)}._7A2Xza_spotlightCover:before{content:\"✨\";width:27px;height:27px;color:var(--newsclaw-brand-strong);text-align:center;pointer-events:none;z-index:2;background:#fffffff0;border-radius:999px;font-size:15px;line-height:27px;position:absolute;top:8px;left:8px;box-shadow:0 2px 8px #fb72994d}._7A2Xza_spotlightCoverScrim{pointer-events:none;z-index:1;background:linear-gradient(#0000,#141a2870);height:40%;position:absolute;inset:auto 0 0}._7A2Xza_spotlightScorePill{z-index:2;color:#fff;letter-spacing:.01em;background:linear-gradient(135deg,#fb7299f5,#e25885e6);border-radius:999px;padding:3px 10px;font-size:10.5px;font-weight:800;line-height:1.4;position:absolute;bottom:8px;left:8px;box-shadow:0 2px 8px #fb72995c}._7A2Xza_spotlightHeroFallback{box-sizing:border-box;width:100%;height:100%;min-height:96px;color:var(--newsclaw-text-secondary);text-align:center;background:linear-gradient(145deg,#fb729924,#5aa9ff1a);justify-content:center;align-items:center;padding:12px 14px;font-size:11px;font-weight:700;line-height:1.55;display:flex;overflow:hidden}._7A2Xza_spotlightCover:has(._7A2Xza_spotlightHeroFallback){aspect-ratio:auto}._7A2Xza_spotlightTitleWrap{align-items:center;gap:8px;min-width:0;padding:0 2px;display:flex}._7A2Xza_spotlightTitle{min-width:0;color:var(--newsclaw-text);-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;flex:1;font-size:13px;font-weight:800;line-height:1.5;display:-webkit-box;overflow:hidden}._7A2Xza_spotlightCard[data-expanded=true] ._7A2Xza_spotlightTitle{-webkit-line-clamp:unset;display:block}._7A2Xza_spotlightChevron{width:24px;height:24px;color:var(--newsclaw-text-muted);background:#ffffffb3;border:0;border-radius:8px;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}._7A2Xza_spotlightDismiss{color:var(--newsclaw-text-muted);cursor:pointer;background:0 0;border:0;border-left:1px solid #eddbe999;border-radius:0 8px 8px 0;padding:3px 7px;font-size:15px;line-height:1;transition:background .15s,color .15s}._7A2Xza_spotlightDismiss:hover:not(:disabled){color:var(--newsclaw-danger);background:#ef7a861f}._7A2Xza_spotlightDismiss:disabled{cursor:wait;opacity:.58}._7A2Xza_spotlightBody{border-top:1px solid #eddbe999;flex-direction:column;gap:8px;padding:2px 12px 12px;display:flex}._7A2Xza_spotlightBody ._7A2Xza_spotlightReason{margin-top:8px}._7A2Xza_spotlightReason{color:var(--newsclaw-text-secondary);background:#f0f6ffe6;border-radius:10px;padding:8px 10px;font-size:11.5px;line-height:1.6}._7A2Xza_spotlightScore{color:var(--newsclaw-brand-strong);font-weight:800}._7A2Xza_spotlightActions{flex-wrap:wrap;gap:6px;display:flex}._7A2Xza_spotlightActions ._7A2Xza_actionButton{flex:1;min-width:0;padding:6px 8px;font-size:11.5px}._7A2Xza_spotlightComposer{align-items:flex-end;gap:6px;display:flex}._7A2Xza_spotlightComposer ._7A2Xza_chatInput{flex:1}._7A2Xza_settingsOverlay{z-index:12;backdrop-filter:blur(2px);background:#20304a47;flex-direction:column;justify-content:flex-start;display:flex;position:absolute;inset:0}._7A2Xza_settingsPanel{background:radial-gradient(circle at 15% 4%, #fb72991f, transparent 30%), var(--newsclaw-bg);border-radius:18px 18px 0 0;flex-direction:column;flex:1;min-height:0;margin-top:8px;display:flex}._7A2Xza_settingsHeader{border-bottom:1px solid var(--newsclaw-line);flex:none;justify-content:space-between;align-items:center;padding:14px 14px 10px;display:flex}._7A2Xza_settingsHeader h2{color:var(--newsclaw-text);letter-spacing:-.02em;margin:0;font-size:15px;font-weight:800}._7A2Xza_settingsBack{width:30px;height:30px;color:var(--newsclaw-text-secondary);cursor:pointer;background:#ffffffc2;border:1px solid #e6edf8eb;border-radius:10px;font-size:14px}._7A2Xza_settingsBack:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}._7A2Xza_settingsTabs{border-bottom:1px solid var(--newsclaw-line);scrollbar-width:none;flex:none;gap:2px;padding:8px 10px 0;display:flex;overflow-x:auto}._7A2Xza_settingsTab{color:var(--newsclaw-text-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:0;border-radius:8px 8px 0 0;padding:6px 10px 8px;font-size:11.5px;font-weight:700}._7A2Xza_settingsTab:hover{color:var(--newsclaw-text);background:var(--newsclaw-interactive-bg-hover,#ffffff80)}._7A2Xza_settingsTab[data-active=true]{color:var(--newsclaw-brand-strong);box-shadow:inset 0 -2px 0 var(--newsclaw-brand);font-weight:800}._7A2Xza_settingsBody{flex-direction:column;flex:1;gap:10px;min-height:0;padding:12px 14px 24px;display:flex;overflow-y:auto}._7A2Xza_settingsToastBar{color:var(--newsclaw-success);background:#30b9801f;border:1px solid #30b9804d;border-radius:8px;flex:none;padding:7px 10px;font-size:11.5px}._7A2Xza_settingsSection{background:#fffffff0;border:1px solid #e7eef8f5;border-radius:16px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}._7A2Xza_settingsSection h3{color:var(--newsclaw-text);align-items:center;gap:6px;margin:0;font-size:13px;font-weight:800;display:flex}._7A2Xza_sectionIcon{font-size:14px}._7A2Xza_settingsField{flex-direction:column;gap:4px;display:flex}._7A2Xza_settingsField>label{color:var(--newsclaw-text-secondary);font-size:11px;font-weight:700}._7A2Xza_settingsFieldRow{color:var(--newsclaw-text);align-items:center;gap:8px;font-size:11.5px;display:flex}._7A2Xza_settingsFieldRow input[type=checkbox]{accent-color:var(--newsclaw-brand)}._7A2Xza_settingsInput{box-sizing:border-box;width:100%;color:var(--newsclaw-text);background:#ffffffe6;border:1px solid #e6edf8eb;border-radius:8px;padding:6px 9px;font-family:inherit;font-size:11.5px}._7A2Xza_settingsInput:focus{border-color:var(--newsclaw-sky-blue);outline:none}._7A2Xza_settingsHint{color:var(--newsclaw-text-muted);margin:0;font-size:10.5px;line-height:1.5}._7A2Xza_settingsActions{align-items:center;gap:8px;display:flex}._7A2Xza_settingsToast{color:var(--newsclaw-success);font-size:11px}._7A2Xza_settingsInstance{border:1px solid var(--newsclaw-line);background:#ffffffb3;border-radius:12px;flex-direction:column;gap:8px;padding:10px 11px;display:flex}._7A2Xza_settingsInstanceHead{color:var(--newsclaw-text);justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:800;display:flex}._7A2Xza_settingsSavebar{border:1px solid var(--newsclaw-line);backdrop-filter:blur(14px);box-shadow:var(--newsclaw-shadow-sm);background:#ffffffd1;border-radius:14px;justify-content:flex-end;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;display:flex;position:sticky;bottom:0}._7A2Xza_settingsSavebarMsg{color:var(--newsclaw-text-muted);flex:1;font-size:11px}._7A2Xza_probeStatus{color:var(--newsclaw-text-muted);word-break:break-word;font-size:11px;line-height:1.5}._7A2Xza_probeStatus[data-tone=success]{color:var(--newsclaw-success)}._7A2Xza_probeStatus[data-tone=error]{color:var(--newsclaw-danger)}._7A2Xza_llmInstanceList{flex-direction:column;gap:8px;display:flex}._7A2Xza_llmInstance{border:1px solid var(--newsclaw-line);background:#ffffffb3;border-radius:12px;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;display:flex}._7A2Xza_llmInstanceMain{flex-direction:column;gap:3px;min-width:0;display:flex}._7A2Xza_llmInstanceHead{flex-wrap:wrap;align-items:center;gap:6px;display:flex}._7A2Xza_llmInstanceName{color:var(--newsclaw-text);font-size:12px;font-weight:800}._7A2Xza_llmBadge{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong);border-radius:999px;padding:3px 7px;font-size:9px;font-weight:800;line-height:1}._7A2Xza_llmBadge[data-tone=off]{color:var(--newsclaw-text-muted);background:#8290a829}._7A2Xza_llmInstanceDetail{color:var(--newsclaw-text-muted);text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;overflow:hidden}._7A2Xza_llmInstanceActions{flex:none;gap:6px;display:flex}._7A2Xza_chainSection{border-top:1px dashed var(--newsclaw-line);flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;display:flex}._7A2Xza_chainHead{justify-content:space-between;align-items:center;gap:8px;display:flex}._7A2Xza_chainHead h4{color:var(--newsclaw-text);margin:0;font-size:11.5px;font-weight:800}._7A2Xza_chainEditor{flex-direction:column;gap:6px;display:flex}._7A2Xza_chainList{flex-direction:column;gap:4px;display:flex}._7A2Xza_chainRow{border:1px solid var(--newsclaw-line);background:#ffffff9e;border-radius:10px;align-items:center;gap:4px;padding:5px 8px;display:flex}._7A2Xza_chainName{min-width:0;color:var(--newsclaw-text);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;font-weight:700;overflow:hidden}._7A2Xza_chainBtn{border:1px solid var(--newsclaw-line);width:22px;height:22px;color:var(--newsclaw-text-muted);cursor:pointer;background:#ffffffb3;border-radius:7px;flex:none;justify-content:center;align-items:center;font-size:10px;line-height:1;display:inline-flex}._7A2Xza_chainBtn:hover:not(:disabled){color:var(--newsclaw-brand-strong);border-color:var(--newsclaw-brand)}._7A2Xza_chainBtn:disabled{opacity:.35;cursor:default}._7A2Xza_chainPicker{align-items:center;gap:6px;display:flex}._7A2Xza_chainPicker ._7A2Xza_settingsInput{flex:1;min-width:0}._7A2Xza_moduleRoute{border:1px solid var(--newsclaw-line);background:#ffffff9e;border-radius:12px;margin-bottom:8px;padding:8px 10px}._7A2Xza_dialogOverlay{backdrop-filter:blur(3px);z-index:60;background:#141a286b;justify-content:center;align-items:flex-start;padding:6vh 14px;display:flex;position:fixed;inset:0}._7A2Xza_dialogCard{border:1px solid var(--newsclaw-line);background:var(--newsclaw-bg);width:min(460px,100%);max-height:86vh;box-shadow:var(--newsclaw-shadow-lg);border-radius:16px;flex-direction:column;gap:10px;padding:14px;display:flex;overflow-y:auto}._7A2Xza_dialogHead{justify-content:space-between;align-items:center;gap:8px;display:flex}._7A2Xza_dialogHead h3{color:var(--newsclaw-text);margin:0;font-size:13px;font-weight:800}._7A2Xza_dialogFields{flex-direction:column;gap:8px;display:flex}._7A2Xza_dialogActionRow{align-items:center;gap:6px;display:flex}._7A2Xza_dialogActionRow ._7A2Xza_settingsInput{flex:1;min-width:0}._7A2Xza_dialogActions{border-top:1px solid var(--newsclaw-line);flex-wrap:wrap;align-items:center;gap:8px;padding-top:10px;display:flex}._7A2Xza_dialogActions ._7A2Xza_probeStatus{flex:100%;order:-1}._7A2Xza_updateRow{color:var(--newsclaw-text-secondary);justify-content:space-between;align-items:baseline;gap:10px;padding:4px 0;font-size:11.5px;display:flex}._7A2Xza_updateRow strong{color:var(--newsclaw-text);word-break:break-word;text-align:right;font-weight:800}._7A2Xza_panel[data-dark=true]{--newsclaw-bg:#15161a;--newsclaw-sky:#0f1115;--newsclaw-surface:#24262ce0;--newsclaw-surface-strong:#282a31f7;--newsclaw-surface-soft:#212329d1;--newsclaw-line:#ffffff14;--newsclaw-line-strong:#fb729959;--newsclaw-text:#e9ebf1;--newsclaw-text-secondary:#b0b9ca;--newsclaw-text-muted:#8c97ad;--newsclaw-brand-soft:#fb729929;--newsclaw-sky-soft:#5aa9ff29;--newsclaw-shadow-lg:0 20px 40px #00000073;--newsclaw-shadow-sm:0 10px 22px #00000059;background:radial-gradient(circle at 15% 8%,#fb72991a,#0000 30%),radial-gradient(circle at 88% 12%,#5aa9ff1a,#0000 26%),linear-gradient(#17181d 0%,#101216 100%)}._7A2Xza_panel[data-dark=true] ._7A2Xza_iconButton,._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsBack{color:var(--newsclaw-text-secondary);background:#ffffff0f;border-color:#ffffff1a}._7A2Xza_panel[data-dark=true] ._7A2Xza_iconButton:hover,._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsBack:hover{background:var(--newsclaw-brand-soft);color:var(--newsclaw-brand-strong)}._7A2Xza_panel[data-dark=true] ._7A2Xza_tab:hover{background:#ffffff0f}._7A2Xza_panel[data-dark=true] ._7A2Xza_tab[data-active=true]{background:linear-gradient(#ffffff1a,#fb729924);box-shadow:0 10px 18px #0000004d}._7A2Xza_panel[data-dark=true] ._7A2Xza_recHeader,._7A2Xza_panel[data-dark=true] ._7A2Xza_card,._7A2Xza_panel[data-dark=true] ._7A2Xza_recCard,._7A2Xza_panel[data-dark=true] ._7A2Xza_profileGroup,._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsSection,._7A2Xza_panel[data-dark=true] ._7A2Xza_dialogueCard,._7A2Xza_panel[data-dark=true] ._7A2Xza_insightCard,._7A2Xza_panel[data-dark=true] ._7A2Xza_probe,._7A2Xza_panel[data-dark=true] ._7A2Xza_footerItem{box-shadow:none;background:linear-gradient(#26282feb,#21232aeb);border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_card:hover,._7A2Xza_panel[data-dark=true] ._7A2Xza_recCard:hover{border-color:#fb729973;box-shadow:0 14px 26px #0006}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightCard{background:radial-gradient(circle at 100% 0,#fb72991f,#0000 38%),linear-gradient(#2c242cf7,#1e222cf7);border-color:#fb72994d;box-shadow:inset 0 1px #ffffff0d,0 4px 14px #0000004d}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightCard:hover{border-color:#fb72998c;box-shadow:inset 0 1px #ffffff0d,0 12px 28px #0006}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightKicker,._7A2Xza_panel[data-dark=true] ._7A2Xza_topicBadge,._7A2Xza_panel[data-dark=true] ._7A2Xza_chip[data-tone=brand]{background:#fb729929}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightMedia,._7A2Xza_panel[data-dark=true] ._7A2Xza_stateBadge,._7A2Xza_panel[data-dark=true] ._7A2Xza_mediaTag,._7A2Xza_panel[data-dark=true] ._7A2Xza_poolChip,._7A2Xza_panel[data-dark=true] ._7A2Xza_chip,._7A2Xza_panel[data-dark=true] ._7A2Xza_contextBadge{color:var(--newsclaw-text-secondary);background:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightNav,._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightChevron,._7A2Xza_panel[data-dark=true] ._7A2Xza_footerToggle,._7A2Xza_panel[data-dark=true] ._7A2Xza_pendingOpen,._7A2Xza_panel[data-dark=true] ._7A2Xza_contextClear{background:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_actionButton{color:var(--newsclaw-text-secondary);background:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_actionButton:hover:not(:disabled){color:var(--newsclaw-text);background:#ffffff1f}._7A2Xza_panel[data-dark=true] ._7A2Xza_savedToggle{color:var(--newsclaw-text-secondary);background:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsInput,._7A2Xza_panel[data-dark=true] ._7A2Xza_commentInput,._7A2Xza_panel[data-dark=true] ._7A2Xza_chatInput,._7A2Xza_panel[data-dark=true] ._7A2Xza_commentComposer textarea{color:var(--newsclaw-text);background:#181a1fe6;border-color:#ffffff1a}._7A2Xza_panel[data-dark=true] ._7A2Xza_turnSoul,._7A2Xza_panel[data-dark=true] ._7A2Xza_questionObservation{background:#ffffff0f;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_turnUser{background:#fb729933}._7A2Xza_panel[data-dark=true] ._7A2Xza_profileSummary{background:#242028f0;border-color:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_awarenessItem{background:#28241ef0;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_questionCard{background:linear-gradient(135deg,#1a2433,#141d2c);border-color:#3b82f659}._7A2Xza_panel[data-dark=true] ._7A2Xza_messageCard[data-tone=interest]{background:linear-gradient(135deg,#2b2418,#241d12);border-color:#dd7f2d66}._7A2Xza_panel[data-dark=true] ._7A2Xza_messageCard[data-tone=avoidance]{background:linear-gradient(135deg,#141f2e,#101a26);border-color:#3b82f666}._7A2Xza_panel[data-dark=true] ._7A2Xza_messageCard[data-tone=challenge]{background:linear-gradient(135deg,#221d33,#1b1728);border-color:#7c3aed66}._7A2Xza_panel[data-dark=true] ._7A2Xza_messageCard[data-tone=spotlight]{background:linear-gradient(135deg,#2e1f26,#261a20);border-color:#fb729966}._7A2Xza_panel[data-dark=true] ._7A2Xza_probe[data-tone=interest]{background:linear-gradient(135deg,#2b2418,#241d12);border-color:#dd7f2d66}._7A2Xza_panel[data-dark=true] ._7A2Xza_probe[data-tone=avoidance]{background:linear-gradient(135deg,#141f2e,#101a26);border-color:#3b82f666}._7A2Xza_panel[data-dark=true] ._7A2Xza_messageBody{color:#b4bece}._7A2Xza_panel[data-dark=true] ._7A2Xza_mbtiDimBar,._7A2Xza_panel[data-dark=true] ._7A2Xza_barTrack,._7A2Xza_panel[data-dark=true] ._7A2Xza_insightConfidenceBar,._7A2Xza_panel[data-dark=true] ._7A2Xza_mbtiConfidence{background:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_drawerPanel,._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsPanel{background:radial-gradient(circle at 15% 4%,#fb729914,#0000 30%),#15161a}._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsInstance{background:#ffffff0a;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_pendingItem{border-top-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_contextBar,._7A2Xza_panel[data-dark=true] ._7A2Xza_activityFooter{background:#212329d9;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_subTabs{background:#ffffff0a;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_subTab[data-active=true]{background:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightReason{color:var(--newsclaw-text-secondary);background:#ffffff0f}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightBody{border-top-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightChevron{color:var(--newsclaw-text-secondary);background:#ffffff12}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightDismiss{border-left-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_footerHint{color:#c3cddd}._7A2Xza_panel[data-dark=true] ._7A2Xza_settingsSavebar,._7A2Xza_panel[data-dark=true] ._7A2Xza_llmInstance,._7A2Xza_panel[data-dark=true] ._7A2Xza_chainRow,._7A2Xza_panel[data-dark=true] ._7A2Xza_moduleRoute{background:#24262ce0;border-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_chainBtn{background:#ffffff0f;border-color:#ffffff1a}._7A2Xza_panel[data-dark=true] ._7A2Xza_dialogCard{background:radial-gradient(circle at 15% 4%,#fb729914,#0000 30%),#15161a;border-color:#ffffff1a}._7A2Xza_panel[data-dark=true] ._7A2Xza_llmBadge{background:#fb729933}._7A2Xza_panel[data-dark=true] ._7A2Xza_actionButton:disabled{opacity:.66;color:#9aa4b8}._7A2Xza_panel[data-dark=true] ._7A2Xza_recCover{background:linear-gradient(145deg,#fb729924,#5aa9ff1f),#1e2028f5}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightCover{background:linear-gradient(#282a31f5,#212329f5),linear-gradient(145deg,#fb729929,#5aa9ff1a);border-color:#ffffff24;box-shadow:inset 0 1px #ffffff0f,0 2px 8px #0000004d}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightCard:hover ._7A2Xza_spotlightCover{box-shadow:inset 0 1px #ffffff0f,0 8px 18px #0000006b}._7A2Xza_panel[data-dark=true] ._7A2Xza_spotlightHeroFallback{color:var(--newsclaw-text);background:linear-gradient(145deg,#fb729929,#5aa9ff1f)}._7A2Xza_panel[data-dark=true] ._7A2Xza_pinnedFooter{background:#15161ab3;border-top-color:#ffffff14}._7A2Xza_panel[data-dark=true] ._7A2Xza_pinnedFooter ._7A2Xza_activityFooter{box-shadow:none;background:0 0;border:0}._7A2Xza_panel[data-dark=true] ._7A2Xza_starButton{background:linear-gradient(#2c242cf7,#fb72991f);border-color:#fb729952}._7A2Xza_sidebarButton{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary,#20304a);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:13px;font-weight:600;line-height:22px;display:flex;overflow:hidden}._7A2Xza_sidebarButton:hover{background:var(--dsw-alias-interactive-bg-hover,#0000000d)}._7A2Xza_sidebarButton[data-active=true]{color:#f65788;background:#fb72991f}._7A2Xza_sidebarButton[data-wide=false]{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}._7A2Xza_sidebarButtonIcon{object-fit:cover;background:linear-gradient(135deg,#fb7299,#ff8cb0);border-radius:6px;flex:none;width:18px;height:18px;display:block;box-shadow:0 4px 8px #fb729940}._7A2Xza_sidebarButtonLabel{white-space:nowrap;overflow:hidden}.newsclaw-panel-handle:after{content:\"\";background:#20304a2e;border-radius:2px;width:2px;height:32px;transition:background .15s;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}.newsclaw-panel-handle:hover:after{background:#fb72998c}";
		const tagId = "@newsclaw/dsh-plugin/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@newsclaw/dsh-plugin";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"viewKicker": "_7A2Xza_viewKicker",
			"awarenessTrend": "_7A2Xza_awarenessTrend",
			"starButton": "_7A2Xza_starButton",
			"chip": "_7A2Xza_chip",
			"llmInstanceMain": "_7A2Xza_llmInstanceMain",
			"profileGroup": "_7A2Xza_profileGroup",
			"footerHint": "_7A2Xza_footerHint",
			"initPrompt": "_7A2Xza_initPrompt",
			"pendingOpen": "_7A2Xza_pendingOpen",
			"drawerEmpty": "_7A2Xza_drawerEmpty",
			"activityLine": "_7A2Xza_activityLine",
			"messageType": "_7A2Xza_messageType",
			"llmInstanceDetail": "_7A2Xza_llmInstanceDetail",
			"action_discuss": "_7A2Xza_action_discuss",
			"chainList": "_7A2Xza_chainList",
			"dialogFields": "_7A2Xza_dialogFields",
			"poolChips": "_7A2Xza_poolChips",
			"loadingRow": "_7A2Xza_loadingRow",
			"contextInterpretation": "_7A2Xza_contextInterpretation",
			"barPct": "_7A2Xza_barPct",
			"insightConfidenceFill": "_7A2Xza_insightConfidenceFill",
			"spotlightScorePill": "_7A2Xza_spotlightScorePill",
			"contextObservation": "_7A2Xza_contextObservation",
			"syncLine": "_7A2Xza_syncLine",
			"activityTime": "_7A2Xza_activityTime",
			"footerHistory": "_7A2Xza_footerHistory",
			"interestDomainWeight": "_7A2Xza_interestDomainWeight",
			"tabBar": "_7A2Xza_tabBar",
			"confirmTitle": "_7A2Xza_confirmTitle",
			"probeStatus": "_7A2Xza_probeStatus",
			"footerItem": "_7A2Xza_footerItem",
			"chainPicker": "_7A2Xza_chainPicker",
			"contextBadge": "_7A2Xza_contextBadge",
			"recHeader": "_7A2Xza_recHeader",
			"cognitionDetailLabel": "_7A2Xza_cognitionDetailLabel",
			"chainName": "_7A2Xza_chainName",
			"llmBadge": "_7A2Xza_llmBadge",
			"stateBadge": "_7A2Xza_stateBadge",
			"awarenessRow": "_7A2Xza_awarenessRow",
			"savedToggle": "_7A2Xza_savedToggle",
			"mediaTag": "_7A2Xza_mediaTag",
			"footerItemMeta": "_7A2Xza_footerItemMeta",
			"profileSummary": "_7A2Xza_profileSummary",
			"spotlightMain": "_7A2Xza_spotlightMain",
			"settingsInstanceHead": "_7A2Xza_settingsInstanceHead",
			"spotlightCard": "_7A2Xza_spotlightCard",
			"header": "_7A2Xza_header",
			"subTabs": "_7A2Xza_subTabs",
			"awarenessHeader": "_7A2Xza_awarenessHeader",
			"interestTree": "_7A2Xza_interestTree",
			"insightHead": "_7A2Xza_insightHead",
			"awarenessDate": "_7A2Xza_awarenessDate",
			"probeHead": "_7A2Xza_probeHead",
			"historyRestoreList": "_7A2Xza_historyRestoreList",
			"confirmCount": "_7A2Xza_confirmCount",
			"recBody": "_7A2Xza_recBody",
			"cardTitle": "_7A2Xza_cardTitle",
			"syncBadgeRow": "_7A2Xza_syncBadgeRow",
			"mbtiDimPole": "_7A2Xza_mbtiDimPole",
			"spotlightCoverScrim": "_7A2Xza_spotlightCoverScrim",
			"commentInput": "_7A2Xza_commentInput",
			"chatInputRow": "_7A2Xza_chatInputRow",
			"pendingObservation": "_7A2Xza_pendingObservation",
			"barRow": "_7A2Xza_barRow",
			"drawerOverlay": "_7A2Xza_drawerOverlay",
			"settingsFieldRow": "_7A2Xza_settingsFieldRow",
			"settingsToast": "_7A2Xza_settingsToast",
			"spotlightCover": "_7A2Xza_spotlightCover",
			"chainEditor": "_7A2Xza_chainEditor",
			"chainRow": "_7A2Xza_chainRow",
			"initPromptStatus": "_7A2Xza_initPromptStatus",
			"chatSend": "_7A2Xza_chatSend",
			"cognitionSource": "_7A2Xza_cognitionSource",
			"cognitionMeta": "_7A2Xza_cognitionMeta",
			"settingsField": "_7A2Xza_settingsField",
			"footerToggle": "_7A2Xza_footerToggle",
			"footerItemKind": "_7A2Xza_footerItemKind",
			"barLabel": "_7A2Xza_barLabel",
			"feedbackStatus": "_7A2Xza_feedbackStatus",
			"spotlightHeader": "_7A2Xza_spotlightHeader",
			"insightNote": "_7A2Xza_insightNote",
			"dialogueTitle": "_7A2Xza_dialogueTitle",
			"actionButton": "_7A2Xza_actionButton",
			"spotlightText": "_7A2Xza_spotlightText",
			"brandMark": "_7A2Xza_brandMark",
			"spotlightActions": "_7A2Xza_spotlightActions",
			"contextRow": "_7A2Xza_contextRow",
			"spotlightTitleWrap": "_7A2Xza_spotlightTitleWrap",
			"spotlightNav": "_7A2Xza_spotlightNav",
			"settingsBack": "_7A2Xza_settingsBack",
			"contextTitle": "_7A2Xza_contextTitle",
			"body": "_7A2Xza_body",
			"poolChip": "_7A2Xza_poolChip",
			"probeReason": "_7A2Xza_probeReason",
			"tab": "_7A2Xza_tab",
			"loadMore": "_7A2Xza_loadMore",
			"starToggle": "_7A2Xza_starToggle",
			"settings": "_7A2Xza_settings",
			"toolbar": "_7A2Xza_toolbar",
			"probeActions": "_7A2Xza_probeActions",
			"card": "_7A2Xza_card",
			"status": "_7A2Xza_status",
			"pendingConfidence": "_7A2Xza_pendingConfidence",
			"dialogueCard": "_7A2Xza_dialogueCard",
			"spotlightCounter": "_7A2Xza_spotlightCounter",
			"spotlightKicker": "_7A2Xza_spotlightKicker",
			"settingsToastBar": "_7A2Xza_settingsToastBar",
			"historyRestoreLabel": "_7A2Xza_historyRestoreLabel",
			"commentRow": "_7A2Xza_commentRow",
			"contextLabel": "_7A2Xza_contextLabel",
			"interestDomainHeader": "_7A2Xza_interestDomainHeader",
			"spotlightBody": "_7A2Xza_spotlightBody",
			"awarenessEmotion": "_7A2Xza_awarenessEmotion",
			"spotlightHeroFallback": "_7A2Xza_spotlightHeroFallback",
			"settingsSavebar": "_7A2Xza_settingsSavebar",
			"settingsSavebarMsg": "_7A2Xza_settingsSavebarMsg",
			"llmInstanceName": "_7A2Xza_llmInstanceName",
			"spacer": "_7A2Xza_spacer",
			"dialogueActions": "_7A2Xza_dialogueActions",
			"dialogOverlay": "_7A2Xza_dialogOverlay",
			"thumbFallback": "_7A2Xza_thumbFallback",
			"updateRow": "_7A2Xza_updateRow",
			"messageTitle": "_7A2Xza_messageTitle",
			"thumb": "_7A2Xza_thumb",
			"savedFeedbackRow": "_7A2Xza_savedFeedbackRow",
			"profilePortraitP": "_7A2Xza_profilePortraitP",
			"barTrack": "_7A2Xza_barTrack",
			"brandTitle": "_7A2Xza_brandTitle",
			"coverWrap": "_7A2Xza_coverWrap",
			"settingsTabs": "_7A2Xza_settingsTabs",
			"messageCard": "_7A2Xza_messageCard",
			"stats": "_7A2Xza_stats",
			"statusText": "_7A2Xza_statusText",
			"settingsOverlay": "_7A2Xza_settingsOverlay",
			"settingsTab": "_7A2Xza_settingsTab",
			"syncLineDetail": "_7A2Xza_syncLineDetail",
			"chipWeight": "_7A2Xza_chipWeight",
			"pinnedFooter": "_7A2Xza_pinnedFooter",
			"spotlightRow": "_7A2Xza_spotlightRow",
			"turnSoul": "_7A2Xza_turnSoul",
			"profileCard": "_7A2Xza_profileCard",
			"cognitionCard": "_7A2Xza_cognitionCard",
			"llmInstanceList": "_7A2Xza_llmInstanceList",
			"statusDot": "_7A2Xza_statusDot",
			"awarenessList": "_7A2Xza_awarenessList",
			"recKicker": "_7A2Xza_recKicker",
			"llmInstance": "_7A2Xza_llmInstance",
			"spotlightHero": "_7A2Xza_spotlightHero",
			"settingsRow": "_7A2Xza_settingsRow",
			"dialogActionRow": "_7A2Xza_dialogActionRow",
			"historyRestoreRow": "_7A2Xza_historyRestoreRow",
			"action_confirm": "_7A2Xza_action_confirm",
			"interestDomain": "_7A2Xza_interestDomain",
			"panel": "_7A2Xza_panel",
			"messagePrompt": "_7A2Xza_messagePrompt",
			"dialogueEvidence": "_7A2Xza_dialogueEvidence",
			"dialogueState": "_7A2Xza_dialogueState",
			"interestTreeLabel": "_7A2Xza_interestTreeLabel",
			"sectionIcon": "_7A2Xza_sectionIcon",
			"contextBar": "_7A2Xza_contextBar",
			"badgeRow": "_7A2Xza_badgeRow",
			"spotlightMedia": "_7A2Xza_spotlightMedia",
			"initPromptCopy": "_7A2Xza_initPromptCopy",
			"recHeaderCopy": "_7A2Xza_recHeaderCopy",
			"sidebarButtonLabel": "_7A2Xza_sidebarButtonLabel",
			"drawerPanel": "_7A2Xza_drawerPanel",
			"profilePhaseCopy": "_7A2Xza_profilePhaseCopy",
			"insightConfidenceLabel": "_7A2Xza_insightConfidenceLabel",
			"interestDomainHead": "_7A2Xza_interestDomainHead",
			"syncResults": "_7A2Xza_syncResults",
			"dialogHead": "_7A2Xza_dialogHead",
			"sidebarButton": "_7A2Xza_sidebarButton",
			"probe": "_7A2Xza_probe",
			"footerCopy": "_7A2Xza_footerCopy",
			"domainWeight": "_7A2Xza_domainWeight",
			"cognitionDetails": "_7A2Xza_cognitionDetails",
			"turnStatus": "_7A2Xza_turnStatus",
			"settingsSection": "_7A2Xza_settingsSection",
			"pendingItem": "_7A2Xza_pendingItem",
			"drawerEmptyTitle": "_7A2Xza_drawerEmptyTitle",
			"badge": "_7A2Xza_badge",
			"settingsHint": "_7A2Xza_settingsHint",
			"spinner": "_7A2Xza_spinner",
			"spotlightDismiss": "_7A2Xza_spotlightDismiss",
			"messageBody": "_7A2Xza_messageBody",
			"dialogueKicker": "_7A2Xza_dialogueKicker",
			"syncToolbar": "_7A2Xza_syncToolbar",
			"spotlightChevron": "_7A2Xza_spotlightChevron",
			"probeDomain": "_7A2Xza_probeDomain",
			"mbtiDimRow": "_7A2Xza_mbtiDimRow",
			"spotlightComposer": "_7A2Xza_spotlightComposer",
			"llmInstanceHead": "_7A2Xza_llmInstanceHead",
			"hint": "_7A2Xza_hint",
			"empty": "_7A2Xza_empty",
			"watchToggle": "_7A2Xza_watchToggle",
			"questionInterpretation": "_7A2Xza_questionInterpretation",
			"mbtiDimBar": "_7A2Xza_mbtiDimBar",
			"dialogActions": "_7A2Xza_dialogActions",
			"commentComposer": "_7A2Xza_commentComposer",
			"contextValue": "_7A2Xza_contextValue",
			"awarenessObservation": "_7A2Xza_awarenessObservation",
			"dialogCard": "_7A2Xza_dialogCard",
			"sectionTitle": "_7A2Xza_sectionTitle",
			"spotlightThumb": "_7A2Xza_spotlightThumb",
			"contextBarHead": "_7A2Xza_contextBarHead",
			"topicBadge": "_7A2Xza_topicBadge",
			"syncMessage": "_7A2Xza_syncMessage",
			"settingsHeader": "_7A2Xza_settingsHeader",
			"drawerTitle": "_7A2Xza_drawerTitle",
			"cognitionDetail": "_7A2Xza_cognitionDetail",
			"poolChipValue": "_7A2Xza_poolChipValue",
			"llmInstanceActions": "_7A2Xza_llmInstanceActions",
			"interestDomainName": "_7A2Xza_interestDomainName",
			"probeConfidence": "_7A2Xza_probeConfidence",
			"profileLayer": "_7A2Xza_profileLayer",
			"mbtiTypeLabel": "_7A2Xza_mbtiTypeLabel",
			"confirmToggle": "_7A2Xza_confirmToggle",
			"cardActions": "_7A2Xza_cardActions",
			"questionCard": "_7A2Xza_questionCard",
			"recCoverText": "_7A2Xza_recCoverText",
			"settingsInput": "_7A2Xza_settingsInput",
			"confirmItem": "_7A2Xza_confirmItem",
			"insightCard": "_7A2Xza_insightCard",
			"mbtiContainer": "_7A2Xza_mbtiContainer",
			"newsclawSpin": "_7A2Xza_newsclawSpin",
			"confirmPanel": "_7A2Xza_confirmPanel",
			"mbtiTypeRow": "_7A2Xza_mbtiTypeRow",
			"subTab": "_7A2Xza_subTab",
			"spotlightKickerLine": "_7A2Xza_spotlightKickerLine",
			"chipRow": "_7A2Xza_chipRow",
			"replyQuote": "_7A2Xza_replyQuote",
			"mbtiDimensions": "_7A2Xza_mbtiDimensions",
			"insightValidated": "_7A2Xza_insightValidated",
			"spotlightTitle": "_7A2Xza_spotlightTitle",
			"insightTitle": "_7A2Xza_insightTitle",
			"recHeaderTitle": "_7A2Xza_recHeaderTitle",
			"messageActions": "_7A2Xza_messageActions",
			"insightEvidenceList": "_7A2Xza_insightEvidenceList",
			"sidebarButtonIcon": "_7A2Xza_sidebarButtonIcon",
			"error": "_7A2Xza_error",
			"footerItemSummary": "_7A2Xza_footerItemSummary",
			"footerHeadline": "_7A2Xza_footerHeadline",
			"mbtiConfidence": "_7A2Xza_mbtiConfidence",
			"recTitle": "_7A2Xza_recTitle",
			"pendingCopy": "_7A2Xza_pendingCopy",
			"cardBody": "_7A2Xza_cardBody",
			"activityFooter": "_7A2Xza_activityFooter",
			"chainBtn": "_7A2Xza_chainBtn",
			"expression": "_7A2Xza_expression",
			"recCover": "_7A2Xza_recCover",
			"mbtiDimPct": "_7A2Xza_mbtiDimPct",
			"moduleRoute": "_7A2Xza_moduleRoute",
			"cardTurn": "_7A2Xza_cardTurn",
			"insightEvidence": "_7A2Xza_insightEvidence",
			"chatInput": "_7A2Xza_chatInput",
			"viewIntro": "_7A2Xza_viewIntro",
			"cognitionSummary": "_7A2Xza_cognitionSummary",
			"syncInlineDetail": "_7A2Xza_syncInlineDetail",
			"awarenessItemDate": "_7A2Xza_awarenessItemDate",
			"turnUser": "_7A2Xza_turnUser",
			"portrait": "_7A2Xza_portrait",
			"cardMeta": "_7A2Xza_cardMeta",
			"barFill": "_7A2Xza_barFill",
			"cognitionContext": "_7A2Xza_cognitionContext",
			"bellBadge": "_7A2Xza_bellBadge",
			"drawerHeader": "_7A2Xza_drawerHeader",
			"spotlightThumbFallback": "_7A2Xza_spotlightThumbFallback",
			"settingsActions": "_7A2Xza_settingsActions",
			"recHeaderActions": "_7A2Xza_recHeaderActions",
			"coverCorner": "_7A2Xza_coverCorner",
			"chainHead": "_7A2Xza_chainHead",
			"mbtiDimBarFill": "_7A2Xza_mbtiDimBarFill",
			"insightConfidenceBar": "_7A2Xza_insightConfidenceBar",
			"spotlightReason": "_7A2Xza_spotlightReason",
			"brand": "_7A2Xza_brand",
			"turn": "_7A2Xza_turn",
			"action_reject": "_7A2Xza_action_reject",
			"syncChip": "_7A2Xza_syncChip",
			"pendingInterpretation": "_7A2Xza_pendingInterpretation",
			"spotlightScore": "_7A2Xza_spotlightScore",
			"settingsInstance": "_7A2Xza_settingsInstance",
			"iconButton": "_7A2Xza_iconButton",
			"poolChipLabel": "_7A2Xza_poolChipLabel",
			"insightConfidenceRow": "_7A2Xza_insightConfidenceRow",
			"settingsPanel": "_7A2Xza_settingsPanel",
			"footerHead": "_7A2Xza_footerHead",
			"settingsBody": "_7A2Xza_settingsBody",
			"chainSection": "_7A2Xza_chainSection",
			"cognitionToggle": "_7A2Xza_cognitionToggle",
			"pendingKind": "_7A2Xza_pendingKind",
			"recCard": "_7A2Xza_recCard",
			"dialogueAction": "_7A2Xza_dialogueAction",
			"questionObservation": "_7A2Xza_questionObservation",
			"activityRow": "_7A2Xza_activityRow",
			"awarenessItem": "_7A2Xza_awarenessItem",
			"contextClear": "_7A2Xza_contextClear",
			"syncLineText": "_7A2Xza_syncLineText",
			"brandCopy": "_7A2Xza_brandCopy",
			"drawerEmptySubtitle": "_7A2Xza_drawerEmptySubtitle"
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
		/** Open a content URL (recording the click first, never blocking the open). */
		function openItem(base, item) {
			const url = item.content_url;
			if (url === "") return;
			reportClick(base, {
				recommendation_id: item.recommendation_id,
				article_id: item.article_id !== "" ? item.article_id : item.content_id,
				content_url: item.content_url,
				media: item.media,
				title: item.title,
				request_id: stableId()
			}).catch(() => {});
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
			(0, react.useEffect)(() => {
				let cancelled = false;
				const key = item.item_key !== "" ? item.item_key : item.article_id;
				if (key === "") return;
				Promise.all([fetchSavedStatus(base, "favorite", key).catch(() => false), fetchSavedStatus(base, "watch_later", key).catch(() => false)]).then(([favorite, watch_later]) => {
					if (!cancelled) setSaved({
						favorite,
						watch_later
					});
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
				const commentId = stableId();
				setComment("");
				act("comment", () => submitFeedback(base, {
					recommendation_id: item.id,
					feedback_type: "comment",
					note,
					request_id: commentId
				}).then(() => {
					setStatus("评论已记下。");
				}), "评论已记下。", "success");
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
				Promise.all([fetchSavedStatus(base, "favorite", key).catch(() => false), fetchSavedStatus(base, "watch_later", key).catch(() => false)]).then(([favorite, watch_later]) => {
					if (!cancelled) setSaved({
						favorite,
						watch_later
					});
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
				setChatDraft("");
				setBusy("chat");
				try {
					await respondToSpotlight(base, {
						article_id: item.article_id,
						response: "chat",
						title: item.title,
						message,
						request_id: stableId()
					});
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
				respond(item, "open");
				openItem(base, {
					recommendation_id: void 0,
					content_id: item.content_id !== "" ? item.content_id : item.article_id,
					article_id: item.article_id,
					content_url: item.content_url,
					media: item.media,
					title: item.title
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
			const reload = (0, react.useCallback)(async () => {
				try {
					setFeed(await fetchActivityFeed(base, { limit: 5 }));
				} catch {
					setFeed(null);
				}
			}, [base]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const loadMore = (0, react.useCallback)(async () => {
				if (feed === null || !feed.hasMore || loadingMore) return;
				setLoadingMore(true);
				try {
					const next = await fetchActivityFeed(base, {
						limit: 5,
						before: feed.nextCursor
					});
					setFeed((prev) => prev === null ? next : {
						...next,
						items: [...prev.items, ...next.items]
					});
				} finally {
					setLoadingMore(false);
				}
			}, [
				base,
				feed,
				loadingMore
			]);
			if (feed === null || feed.items.length === 0 && feed.liveSummary === "" && feed.headline === "") return null;
			const summaryOf = (item) => {
				if (typeof item.summary === "string" && item.summary !== "") return item.summary;
				const kind = typeof item.kind === "string" ? item.kind : "";
				return kind !== "" ? kind.replace(/[._]/g, " ") : JSON.stringify(item).slice(0, 120);
			};
			const kindOf = (item) => typeof item.kind === "string" && item.kind !== "" ? item.kind : "动态";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.activityFooter,
				children: [(0, react_jsx_runtime.jsxs)("div", {
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
				}), expanded && feed.items.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
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
				}) : null]
			});
		}
		/** First-run init prompt (popup's empty-state init card, simplified). */
		function InitPrompt(props) {
			const { base, onDone, onError } = props;
			const [busy, setBusy] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)("");
			const run = (0, react.useCallback)(async () => {
				setBusy(true);
				setStatus("正在提交初始化任务…");
				try {
					await startInit(base, {});
					for (let attempt = 0; attempt < 60; attempt += 1) {
						await new Promise((resolve) => window.setTimeout(resolve, 3e3));
						const init = await fetchInitStatus(base);
						if (init.initialized) {
							setStatus("初始化完成，画像已生成。");
							onDone();
							return;
						}
						if (!init.running) {
							setStatus("初始化尚未完成；可稍后刷新，或到 设置-通用 重新初始化。");
							return;
						}
						setStatus("初始化进行中，正在拉取数据并生成画像…");
					}
					setStatus("初始化仍在后台进行，请稍后刷新查看。");
				} catch (err) {
					onError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}, [
				base,
				onDone,
				onError
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.initPrompt,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.initPromptCopy,
					children: [
						(0, react_jsx_runtime.jsx)("strong", { children: "从零建立你的新闻画像" }),
						(0, react_jsx_runtime.jsx)("span", { children: "只从你的选择、对话和后续反馈开始，不导入旧工具历史或旧画像。" }),
						status !== "" ? (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.initPromptStatus,
							role: "status",
							children: status
						}) : null
					]
				}), (0, react_jsx_runtime.jsx)(ActionButton, {
					label: busy ? "初始化中…" : "开始初始化",
					primary: true,
					disabled: busy,
					onClick: () => void run()
				})]
			});
		}
		/** 推荐 tab: header + pool status + spotlight + recommendation cards + activity. */
		function RecommendView(props) {
			const { base, refreshKey } = props;
			const [items, setItems] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)("");
			const [excluded, setExcluded] = (0, react.useState)([]);
			const reload = (0, react.useCallback)(async () => {
				try {
					const [recs, runtime] = await Promise.all([fetchRecommendations(base), fetchRuntimeStatus(base)]);
					setItems(recs);
					setStatus(runtime);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
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
					await fetchRuntimeStatus(base).then(setStatus).catch(() => void 0);
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
				try {
					const next = await appendRecommendations(base, { excludedArticleIds: [...excluded, ...items.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean)] });
					if (next.length === 0) setExhausted(true);
					else {
						setItems((prev) => [...prev ?? [], ...next]);
						setExcluded((prev) => [...prev, ...items.map((item) => item.item_key !== "" ? item.item_key : item.article_id).filter(Boolean)]);
					}
					await fetchRuntimeStatus(base).then(setStatus).catch(() => void 0);
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
				status?.initialized === false ? (0, react_jsx_runtime.jsx)(InitPrompt, {
					base,
					onDone: () => void reload(),
					onError: setError
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
							run("append", () => appendRecommendations(base, { excludedArticleIds: excludeAll }).then((next) => {
								if (next.length === 0) setExhausted(true);
								return next;
							}));
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
		async function postSavedFeedback(base, item, feedbackType, note = "") {
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
				event_id: stableId()
			}]);
			if (result.accepted < 1) throw new Error(result.rejected[0]?.reason || "反馈没有保存，请稍后重试。");
		}
		function SavedCard(props) {
			const { base, listKind, item, removing, onRemove } = props;
			const otherKind = listKind === "favorite" ? "watch_later" : "favorite";
			const [otherSaved, setOtherSaved] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)("");
			const [status, setStatus] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let cancelled = false;
				fetchSavedStatus(base, otherKind, item.item_key).then((saved) => {
					if (!cancelled) setOtherSaved(saved);
				}).catch(() => {
					if (!cancelled) setOtherSaved(false);
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
					setOtherSaved((value) => !value);
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
					await postSavedFeedback(base, item, kind, note);
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
									window.open(item.content_url, "_blank", "noopener");
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
									disabled: anyBusy,
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
										window.open(item.content_url, "_blank", "noopener");
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
				tab === "history" ? (0, react_jsx_runtime.jsx)(HistoryList, { base }, `history-${base}`) : null
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
			const reload = (0, react.useCallback)(async () => {
				try {
					const [history, pending] = await Promise.all([fetchChatTurns(base, CHAT_SESSION), fetchPendingConfirmations(base)]);
					setTurns(history);
					setConfirmations(pending);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
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
				const optimistic = {
					turn_id: `pending-${Date.now()}`,
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
					const started = await startChatTurn(base, message, CHAT_SESSION, context?.turnId);
					setTurns((prev) => [...(prev ?? []).filter((t) => t.turn_id !== optimistic.turn_id), started]);
					const settled = await waitForTurn(base, started.turn_id);
					setTurns((prev) => (prev ?? []).map((t) => t.turn_id === started.turn_id ? settled : t));
					await reload();
				} catch (err) {
					setTurns((prev) => (prev ?? []).filter((t) => t.turn_id !== optimistic.turn_id));
					const friendly = err instanceof ApiError && err.status === 409 ? "这条上下文已经失效（卡片可能已结算，或另开了一条讨论）。点「清除」后重发，或回到卡片重新点「聊聊」。" : err instanceof Error ? err.message : String(err);
					setError(friendly);
					await reload().catch(() => void 0);
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
			if (profile === null) return (0, react_jsx_runtime.jsx)(EmptyState, { text: "画像尚未生成（需要先完成初始化）。" });
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
								title: "常看的 UP 主",
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
									children: ["喜欢时长：", profile.style.preferred_duration]
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
			return normalized === "" ? "" : `${type === "avoidance.probe" ? "avoidance.probe" : "interest.probe"}:${normalized}`;
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
				open: stableId(),
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
									act("open");
									openItem(base, {
										recommendation_id: void 0,
										content_id: notice.content_id !== "" ? notice.content_id : notice.article_id,
										article_id: notice.article_id,
										content_url: notice.content_url,
										media: notice.media,
										title: notice.title
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
			const { base, notice, onHandled } = props;
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
							label: "打开原文",
							primary: true,
							disabled: notice.original_url === "",
							onClick: () => {
								openItem(base, {
									content_id: notice.article_id,
									article_id: notice.article_id,
									content_url: notice.original_url,
									media: notice.media,
									title: notice.title
								});
								onHandled(notice.article_id);
							}
						})
					})
				]
			});
		}
		/** The messages drawer (bell overlay). */
		function MessagesDrawer(props) {
			const { base, probes, spotlights, notifications, onClose, onProbeHandled, onSpotlightHandled, onNotificationHandled, onError } = props;
			const isEmpty = probes.length === 0 && spotlights.length === 0 && notifications.length === 0;
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
							onHandled: onNotificationHandled
						}, `notif:${notice.article_id}`)),
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
		/** Hydrate the drawer from the REST surfaces (probes + spotlights + notification). */
		async function hydrateDrawer(base, handledProbes) {
			const [interests, avoidances, spotlights, notification] = await Promise.all([
				fetchInterestProbes(base).catch(() => []),
				fetchAvoidanceProbes(base).catch(() => []),
				fetchSpotlightBatch(base).catch(() => []),
				fetchPendingNotification(base).catch(() => null)
			]);
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
				}] : []
			};
		}
		//#endregion
		//#region lib/types/client/settings.js
		/** NewsClaw settings surface: AI, sources, refresh, recommendation, profile, general and logs. */
		const TABS$1 = [
			{
				key: "ai",
				label: "AI 模型"
			},
			{
				key: "sources",
				label: "新闻源"
			},
			{
				key: "refresh",
				label: "刷新"
			},
			{
				key: "recommendation",
				label: "推荐"
			},
			{
				key: "profile",
				label: "画像"
			},
			{
				key: "general",
				label: "通用"
			},
			{
				key: "logs",
				label: "日志"
			}
		];
		function dict(value) {
			return typeof value === "object" && value !== null ? value : {};
		}
		function text(value, fallback = "") {
			return typeof value === "string" ? value : fallback;
		}
		function number(value, fallback) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : fallback;
		}
		function boolean(value, fallback = false) {
			return typeof value === "boolean" ? value : fallback;
		}
		function firstInstance(llm) {
			const instances = dict(llm.instances);
			return dict(Object.values(instances).find((value) => typeof value === "object" && value !== null));
		}
		function parseSources(raw, availability) {
			const value = raw.news_sources ?? raw.sources;
			const rows = Array.isArray(value) ? value.map((row, index) => [text(dict(row).id, `source-${index + 1}`), dict(row)]) : Object.entries(dict(value)).map(([id, row]) => [id, dict(row)]);
			const ids = new Set(rows.map(([id]) => id));
			for (const source of availability) if (!ids.has(source.id)) rows.push([source.id || source.media, { media: source.media }]);
			return rows.map(([id, row]) => {
				const runtime = availability.find((source) => source.id === id || source.media === text(row.name ?? row.media, id));
				const healthValue = text(runtime?.state ?? row.health ?? row.state ?? row.status, "unknown").toLowerCase();
				const health = healthValue === "online" || healthValue === "degraded" || healthValue === "offline" ? healthValue : "unknown";
				return {
					id,
					name: text(row.name ?? row.media, runtime?.media || id),
					provider: runtime?.technical_provider || text(row.technical_provider ?? row.provider),
					enabled: boolean(row.enabled, true),
					weight: number(row.weight, 1),
					refreshMinutes: number(row.refresh_minutes ?? row.refresh_interval_minutes, 5),
					health,
					lastSuccess: runtime?.last_success_at || text(row.last_success_at ?? row.last_success),
					error: runtime?.error || text(row.error ?? row.last_error)
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
					provider: text(instance.provider_type ?? llm.provider, "deepseek"),
					model: text(instance.model ?? llm.model, "deepseek-chat"),
					baseUrl: text(instance.base_url ?? llm.base_url),
					apiKey: "",
					apiKeyConfigured: text(instance.api_key ?? llm.api_key) !== "" || boolean(instance.api_key_configured ?? llm.api_key_configured),
					concurrency: number(llm.concurrency, 4),
					timeout: number(llm.timeout, 120)
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
					sourceShareLimit: number(scheduler.source_share_limit, .4)
				},
				recommendation: {
					explorationRatio: number(recommendation.exploration_ratio, .15),
					candidateTtlHours: number(recommendation.candidate_ttl_hours, 48),
					dedupeThreshold: number(recommendation.semantic_dedupe_threshold, .88),
					sourceDiversity: boolean(recommendation.source_diversity_enabled, true),
					hardNegativeFilter: boolean(recommendation.hard_negative_filter_enabled, true)
				},
				profile: {
					probeThreshold: number(profile.probe_confirmation_threshold, 3),
					maxActiveProbes: number(profile.max_active_probes, 5),
					manualOverrideWins: true
				},
				general: {
					language: text(raw.language, "zh"),
					dataDir: text(raw.data_dir, "data"),
					dbPath: text(storage.db_path, "data/newsclaw.db")
				},
				logs: {
					level: text(logging.level, "INFO"),
					fileLevel: text(logging.file_level, "DEBUG"),
					path: `${text(logging.directory, "logs")}/${text(logging.filename, "newsclaw.log")}`
				}
			};
		}
		function buildPayload(draft) {
			const slash = Math.max(draft.logs.path.lastIndexOf("/"), draft.logs.path.lastIndexOf("\\"));
			const directory = slash >= 0 ? draft.logs.path.slice(0, slash) : "logs";
			const filename = slash >= 0 ? draft.logs.path.slice(slash + 1) : draft.logs.path;
			const llm = {
				provider: draft.ai.provider,
				model: draft.ai.model,
				base_url: draft.ai.baseUrl,
				concurrency: draft.ai.concurrency,
				timeout: draft.ai.timeout
			};
			if (draft.ai.apiKey.trim() !== "" && !draft.ai.apiKey.includes("*")) llm.api_key = draft.ai.apiKey.trim();
			return {
				llm,
				news_sources: Object.fromEntries(draft.sources.map((source) => [source.id, {
					enabled: source.enabled,
					weight: source.weight,
					refresh_minutes: source.refreshMinutes
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
					source_share_limit: draft.refresh.sourceShareLimit
				},
				recommendation: {
					exploration_ratio: draft.recommendation.explorationRatio,
					candidate_ttl_hours: draft.recommendation.candidateTtlHours,
					semantic_dedupe_threshold: draft.recommendation.dedupeThreshold,
					source_diversity_enabled: draft.recommendation.sourceDiversity,
					hard_negative_filter_enabled: draft.recommendation.hardNegativeFilter
				},
				profile: {
					probe_confirmation_threshold: draft.profile.probeThreshold,
					max_active_probes: draft.profile.maxActiveProbes,
					manual_override_wins: true
				},
				language: draft.general.language,
				data_dir: draft.general.dataDir,
				storage: { db_path: draft.general.dbPath },
				logging: {
					level: draft.logs.level,
					file_level: draft.logs.fileLevel,
					directory,
					filename: filename || "newsclaw.log"
				}
			};
		}
		function Field({ label, hint, children }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.settingsField,
				children: [
					(0, react_jsx_runtime.jsx)("label", { children: label }),
					children,
					hint !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.settingsHint,
						children: hint
					}) : null
				]
			});
		}
		function Section({ title, children }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.settingsSection,
				children: [(0, react_jsx_runtime.jsx)("h3", { children: title }), children]
			});
		}
		function TextInput({ value, onChange, type = "text", placeholder }) {
			return (0, react_jsx_runtime.jsx)("input", {
				className: panel_module_css_default.settingsInput,
				type,
				value,
				placeholder,
				onChange: (event) => onChange(event.target.value)
			});
		}
		function NumberInput({ value, onChange, min, max, step = 1 }) {
			return (0, react_jsx_runtime.jsx)("input", {
				className: panel_module_css_default.settingsInput,
				type: "number",
				value,
				min,
				max,
				step,
				onChange: (event) => onChange(number(event.target.value, value))
			});
		}
		function Toggle({ label, checked, onChange, hint }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.settingsField,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.settingsFieldRow,
					children: [(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked,
						onChange: (event) => onChange(event.target.checked)
					}), (0, react_jsx_runtime.jsx)("label", { children: label })]
				}), hint !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.settingsHint,
					children: hint
				}) : null]
			});
		}
		function AiTab({ draft, patch }) {
			const set = (key, value) => patch({
				...draft,
				ai: {
					...draft.ai,
					[key]: value
				}
			});
			return (0, react_jsx_runtime.jsxs)(Section, {
				title: "默认 AI 模型",
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: "提供方",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.ai.provider,
							onChange: (value) => set("provider", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "模型",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.ai.model,
							onChange: (value) => set("model", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "Base URL",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.ai.baseUrl,
							onChange: (value) => set("baseUrl", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "API Key",
						hint: draft.ai.apiKeyConfigured ? "已配置（值已隐藏）；留空会保留后端现有密钥。" : "尚未配置；页面不会读取或回显真实密钥。",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							type: "password",
							value: draft.ai.apiKey,
							placeholder: draft.ai.apiKeyConfigured ? "已配置，值已隐藏" : "输入新密钥",
							onChange: (value) => set("apiKey", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "并发",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: draft.ai.concurrency,
							min: 1,
							max: 16,
							onChange: (value) => set("concurrency", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "超时（秒）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: draft.ai.timeout,
							min: 10,
							max: 1800,
							onChange: (value) => set("timeout", value)
						})
					})
				]
			});
		}
		function SourcesTab({ draft, patch }) {
			const update = (index, partial) => patch({
				...draft,
				sources: draft.sources.map((source, i) => i === index ? {
					...source,
					...partial
				} : source)
			});
			if (draft.sources.length === 0) return (0, react_jsx_runtime.jsx)(Section, {
				title: "新闻来源",
				children: (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.settingsHint,
					children: "后端还没有返回新闻源配置。首次启动会验证 Tushare 与 RSS 契约。"
				})
			});
			return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: draft.sources.map((source, index) => (0, react_jsx_runtime.jsxs)(Section, {
				title: source.name,
				children: [
					(0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.settingsHint,
						children: [
							"技术提供方：",
							source.provider || "未标注",
							" · 状态：",
							source.health === "online" ? "在线" : source.health === "degraded" ? "降级" : source.health === "offline" ? "离线" : "待验证"
						]
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "启用",
						checked: source.enabled,
						onChange: (enabled) => update(index, { enabled })
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "权重",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: source.weight,
							min: 0,
							max: 10,
							step: .1,
							onChange: (weight) => update(index, { weight })
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "刷新频率（分钟）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: source.refreshMinutes,
							min: 1,
							max: 1440,
							onChange: (refreshMinutes) => update(index, { refreshMinutes })
						})
					}),
					source.lastSuccess !== "" ? (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.settingsHint,
						children: ["最后成功：", source.lastSuccess]
					}) : null,
					source.error !== "" ? (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.settingsHint,
						children: ["当前错误：", source.error]
					}) : null
				]
			}, source.id)) });
		}
		function RefreshTab({ draft, patch }) {
			const set = (key, value) => patch({
				...draft,
				refresh: {
					...draft.refresh,
					[key]: value
				}
			});
			const r = draft.refresh;
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)(Section, {
				title: "候选池与刷新",
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: "候选池目标数",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.poolTarget,
							min: 20,
							max: 2e3,
							onChange: (value) => set("poolTarget", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "刷新轮询（秒）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.pollSeconds,
							min: 15,
							max: 3600,
							onChange: (value) => set("pollSeconds", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "热门刷新（分钟）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.hotMinutes,
							min: 1,
							max: 1440,
							onChange: (value) => set("hotMinutes", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "探索刷新（分钟）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.exploreMinutes,
							min: 1,
							max: 1440,
							onChange: (value) => set("exploreMinutes", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "反馈触发阈值",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.feedbackThreshold,
							min: 1,
							max: 100,
							onChange: (value) => set("feedbackThreshold", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "单一来源最高占比",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.sourceShareLimit,
							min: .1,
							max: 1,
							step: .05,
							onChange: (value) => set("sourceShareLimit", value)
						})
					})
				]
			}), (0, react_jsx_runtime.jsxs)(Section, {
				title: "后台与重试",
				children: [
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "主动推送",
						checked: r.proactivePush,
						onChange: (value) => set("proactivePush", value)
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "推送轮询（秒）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.pushSeconds,
							min: 30,
							max: 86400,
							onChange: (value) => set("pushSeconds", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "后台运行 AI",
						checked: r.backgroundLlm,
						onChange: (value) => set("backgroundLlm", value)
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "关闭浏览器后继续刷新",
						checked: r.continueAfterClose,
						onChange: (value) => set("continueAfterClose", value)
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "重试起始（秒）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.retryBaseSeconds,
							min: 1,
							max: 300,
							onChange: (value) => set("retryBaseSeconds", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "重试上限（秒）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.retryMaxSeconds,
							min: 10,
							max: 3600,
							onChange: (value) => set("retryMaxSeconds", value)
						})
					})
				]
			})] });
		}
		function RecommendationTab({ draft, patch }) {
			const set = (key, value) => patch({
				...draft,
				recommendation: {
					...draft.recommendation,
					[key]: value
				}
			});
			const r = draft.recommendation;
			return (0, react_jsx_runtime.jsxs)(Section, {
				title: "推荐池规则",
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: "探索比例",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.explorationRatio,
							min: 0,
							max: 1,
							step: .05,
							onChange: (value) => set("explorationRatio", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "候选时效（小时）",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.candidateTtlHours,
							min: 1,
							max: 720,
							onChange: (value) => set("candidateTtlHours", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "语义去重阈值",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: r.dedupeThreshold,
							min: .5,
							max: 1,
							step: .01,
							onChange: (value) => set("dedupeThreshold", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "来源多样性",
						checked: r.sourceDiversity,
						onChange: (value) => set("sourceDiversity", value)
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "负反馈立即出池",
						checked: r.hardNegativeFilter,
						onChange: (value) => set("hardNegativeFilter", value)
					})
				]
			});
		}
		function ProfileTab({ draft, patch }) {
			const set = (key, value) => patch({
				...draft,
				profile: {
					...draft.profile,
					[key]: value
				}
			});
			return (0, react_jsx_runtime.jsxs)(Section, {
				title: "五层画像",
				children: [
					(0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.settingsHint,
						children: "事件 → 偏好 → 觉察 → 洞察 → 灵魂。手工修改永远覆盖 AI 推断。"
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "探测确认阈值",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: draft.profile.probeThreshold,
							min: 1,
							max: 20,
							onChange: (value) => set("probeThreshold", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "同时活跃探测数",
						children: (0, react_jsx_runtime.jsx)(NumberInput, {
							value: draft.profile.maxActiveProbes,
							min: 1,
							max: 50,
							onChange: (value) => set("maxActiveProbes", value)
						})
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "手工修改优先",
						checked: true,
						onChange: () => void 0,
						hint: "固定开启，不能被 AI 覆盖。"
					})
				]
			});
		}
		function GeneralTab({ draft, patch, base, onBaseChange, toast }) {
			const [apiBase, setApiBase] = (0, react.useState)(() => readApiBase());
			const [autostart, setAutostart] = (0, react.useState)({
				loaded: false,
				enabled: false,
				busy: false
			});
			(0, react.useEffect)(() => {
				let cancelled = false;
				fetchAutostartStatus(base).then((value) => {
					if (!cancelled) setAutostart({
						loaded: true,
						enabled: value.enabled,
						busy: false
					});
				}).catch(() => {
					if (!cancelled) setAutostart({
						loaded: true,
						enabled: false,
						busy: false
					});
				});
				return () => {
					cancelled = true;
				};
			}, [base]);
			const saveBase = () => {
				const next = (apiBase.trim() || "http://127.0.0.1:8430").replace(/\/+$/, "");
				writeApiBase(next);
				onBaseChange(next);
				toast("后端地址已保存。");
			};
			const toggleAutostart = async (enabled) => {
				setAutostart((value) => ({
					...value,
					busy: true
				}));
				try {
					await applyAutostart(base, enabled);
					setAutostart({
						loaded: true,
						enabled,
						busy: false
					});
				} catch (error) {
					toast(error instanceof Error ? error.message : String(error));
					setAutostart((value) => ({
						...value,
						busy: false
					}));
				}
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)(Section, {
				title: "连接",
				children: [(0, react_jsx_runtime.jsx)(Field, {
					label: "后端地址",
					children: (0, react_jsx_runtime.jsx)(TextInput, {
						value: apiBase,
						placeholder: DEFAULT_API_BASE,
						onChange: setApiBase
					})
				}), (0, react_jsx_runtime.jsx)(ActionButton, {
					label: "保存地址",
					primary: true,
					onClick: saveBase
				})]
			}), (0, react_jsx_runtime.jsxs)(Section, {
				title: "本地数据",
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: "语言",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.general.language,
							onChange: (value) => patch({
								...draft,
								general: {
									...draft.general,
									language: value
								}
							})
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "数据目录",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.general.dataDir,
							onChange: (value) => patch({
								...draft,
								general: {
									...draft.general,
									dataDir: value
								}
							})
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "数据库",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.general.dbPath,
							onChange: (value) => patch({
								...draft,
								general: {
									...draft.general,
									dbPath: value
								}
							})
						})
					}),
					(0, react_jsx_runtime.jsx)(Toggle, {
						label: "开机自动启动新闻爪",
						checked: autostart.enabled,
						onChange: (value) => void toggleAutostart(value),
						hint: !autostart.loaded ? "正在读取状态…" : autostart.busy ? "正在应用…" : void 0
					})
				]
			})] });
		}
		function LogsTab({ draft, patch }) {
			return (0, react_jsx_runtime.jsxs)(Section, {
				title: "日志",
				children: [
					(0, react_jsx_runtime.jsx)(Field, {
						label: "控制台级别",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.logs.level,
							onChange: (value) => patch({
								...draft,
								logs: {
									...draft.logs,
									level: value
								}
							})
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "文件级别",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.logs.fileLevel,
							onChange: (value) => patch({
								...draft,
								logs: {
									...draft.logs,
									fileLevel: value
								}
							})
						})
					}),
					(0, react_jsx_runtime.jsx)(Field, {
						label: "日志路径",
						hint: "日志不得包含 Token、API Key 或未脱敏配置。",
						children: (0, react_jsx_runtime.jsx)(TextInput, {
							value: draft.logs.path,
							onChange: (value) => patch({
								...draft,
								logs: {
									...draft.logs,
									path: value
								}
							})
						})
					})
				]
			});
		}
		function SettingsOverlay({ base, onBaseChange, onClose }) {
			const [tab, setTab] = (0, react.useState)("ai");
			const [draft, setDraft] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)("");
			const [toast, setToast] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async () => {
				try {
					const [config, availability] = await Promise.all([fetchConfig(base), fetchSourceAvailability(base).catch(() => [])]);
					const next = buildDraft(config, availability);
					setDraft(next);
					setSaved(JSON.stringify(next));
				} catch (error) {
					setToast("配置读取失败：" + (error instanceof Error ? error.message : String(error)));
					const next = buildDraft({});
					setDraft(next);
					setSaved(JSON.stringify(next));
				}
			}, [base]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const dirty = (0, react.useMemo)(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved]);
			const save = (0, react.useCallback)(async () => {
				if (draft === null) return;
				setSaving(true);
				try {
					await updateConfig(base, buildPayload(draft));
					setToast("配置已保存并热更新。");
					await load();
				} catch (error) {
					setToast("保存失败，后端应继续使用最后一份可用配置：" + (error instanceof Error ? error.message : String(error)));
				} finally {
					setSaving(false);
				}
			}, [
				base,
				draft,
				load
			]);
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
							children: [(0, react_jsx_runtime.jsx)("h2", { children: "新闻爪设置" }), (0, react_jsx_runtime.jsx)("button", {
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
							children: [toast !== "" ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.settingsToastBar,
								role: "status",
								children: toast
							}) : null, draft === null ? (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.empty,
								children: "配置加载中…"
							}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								tab === "ai" ? (0, react_jsx_runtime.jsx)(AiTab, {
									draft,
									patch: setDraft
								}) : null,
								tab === "sources" ? (0, react_jsx_runtime.jsx)(SourcesTab, {
									draft,
									patch: setDraft
								}) : null,
								tab === "refresh" ? (0, react_jsx_runtime.jsx)(RefreshTab, {
									draft,
									patch: setDraft
								}) : null,
								tab === "recommendation" ? (0, react_jsx_runtime.jsx)(RecommendationTab, {
									draft,
									patch: setDraft
								}) : null,
								tab === "profile" ? (0, react_jsx_runtime.jsx)(ProfileTab, {
									draft,
									patch: setDraft
								}) : null,
								tab === "general" ? (0, react_jsx_runtime.jsx)(GeneralTab, {
									draft,
									patch: setDraft,
									base,
									onBaseChange,
									toast: setToast
								}) : null,
								tab === "logs" ? (0, react_jsx_runtime.jsx)(LogsTab, {
									draft,
									patch: setDraft
								}) : null,
								(0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.settingsSavebar,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.settingsSavebarMsg,
										children: dirty ? "有未保存的修改" : "已保存"
									}), (0, react_jsx_runtime.jsx)(ActionButton, {
										label: "保存配置",
										primary: true,
										disabled: !dirty || saving,
										onClick: () => void save()
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
		function NewsClawPanel({ closePanel, isDark, onThemeChange }) {
			const [dark, setDark] = (0, react.useState)(() => isDark());
			(0, react.useEffect)(() => onThemeChange(setDark), [onThemeChange]);
			const [base, setBase] = (0, react.useState)(() => readApiBase());
			const [connection, setConnection] = (0, react.useState)("offline");
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("recommend");
			const [badges, setBadges] = (0, react.useState)({});
			const [drawerOpen, setDrawerOpen] = (0, react.useState)(false);
			const [probes, setProbes] = (0, react.useState)([]);
			const [spotlights, setSpotlights] = (0, react.useState)([]);
			const [notifications, setNotifications] = (0, react.useState)([]);
			const [drawerError, setDrawerError] = (0, react.useState)("");
			const handledProbes = (0, react.useRef)(/* @__PURE__ */ new Set());
			const probeRef = (0, react.useRef)([]);
			probeRef.current = probes;
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
				hydrateDrawer(base, handledProbes.current).then((result) => {
					if (cancelled) return;
					setProbes(result.probes);
					setSpotlights(result.spotlights);
					setNotifications(result.notifications);
				});
				return () => {
					cancelled = true;
				};
			}, [base]);
			const [liveTick, setLiveTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const client = new LiveClient(base);
				const offEvent = client.onEvent((event) => {
					const payload = event.payload;
					if (event.type === "interest.probe" || event.type === "avoidance.probe") {
						const domain = typeof payload.domain === "string" ? payload.domain : "";
						const key = probeKey(event.type, domain);
						if (key === "" || handledProbes.current.has(key)) return;
						const probeMode = typeof payload.probe_mode === "string" ? payload.probe_mode : "";
						const challenge = probeMode === "lateral" || probeMode === "bridge" || probeMode === "wildcard";
						setProbes((prev) => {
							if (prev.some((p) => p.key === key)) return prev;
							return [...prev, {
								key,
								type: event.type === "avoidance.probe" ? "avoidance.probe" : "interest.probe",
								domain,
								reason: typeof payload.reason === "string" ? payload.reason : "",
								challenge,
								confidence: typeof payload.confidence === "number" ? payload.confidence : 0
							}];
						});
						setBadges((prev) => ({
							...prev,
							profile: (prev.profile ?? 0) + 1
						}));
						setLiveTick((tick) => tick + 1);
					} else if (event.type === "spotlight.candidate") {
						const article_id = typeof payload.article_id === "string" ? payload.article_id : "";
						if (article_id === "") return;
						setSpotlights((prev) => prev.some((d) => d.article_id === article_id) ? prev : [...prev, {
							article_id,
							title: typeof payload.title === "string" ? payload.title : "",
							reason: typeof payload.spotlight_reason === "string" ? payload.spotlight_reason : "",
							hook: typeof payload.spotlight_hook === "string" ? payload.spotlight_hook : "",
							media: typeof payload.media === "string" ? payload.media : "未知媒体",
							content_url: typeof payload.original_url === "string" ? payload.original_url : typeof payload.content_url === "string" ? payload.content_url : "",
							content_id: typeof payload.content_id === "string" ? payload.content_id : article_id,
							score: typeof payload.spotlight_score === "number" ? payload.spotlight_score : 0
						}]);
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
				hydrateDrawer(base, handledProbes.current).then((result) => {
					setProbes((prev) => mergeProbes(prev, result.probes));
					setSpotlights(result.spotlights);
					setNotifications(result.notifications);
				}).catch(() => void 0);
			}, [base]);
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
			const messageCount = probes.length + spotlights.length + notifications.length;
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
						onBaseChange: (next) => setBase(next),
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
						onClose: () => setDrawerOpen(false),
						onProbeHandled,
						onSpotlightHandled,
						onNotificationHandled,
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
		function mountPanel(controller, theme) {
			let root;
			const dispose = waitForElement(PANEL_COL_SELECTOR, (el) => {
				root = (0, react_dom_client.createRoot)(el);
				root.render((0, react_jsx_runtime.jsx)(NewsClawPanel, {
					closePanel: () => {
						controller.setOpen(false);
					},
					isDark: theme.isDark,
					onThemeChange: theme.onThemeChange
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
		/**
		* Client plugin body: mount the panel column into the frame grid (DOM-level,
		* pushing the center content) plus a left-sidebar toggle button.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
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
					disposers.push(mountPanel(layout, theme));
				} catch (error) {
					console.error("[newsclaw] panel mount failed:", error);
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
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map