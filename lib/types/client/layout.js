import { PANEL_DEFAULT_WIDTH_PX, PANEL_MAX_WIDTH_PX, PANEL_MIN_WIDTH_PX, MIN_CHAT_PX, persistPanelOpen, persistPanelWidth, } from "./store.js";
import { handlePointerDragStart } from "./drag.js";
/** The column element marker (mount.tsx targets it). */
export const PANEL_COL_SELECTOR = '[data-newsclaw-panel-col]';
/** Parse an inline grid-template-columns string into its tracks (paren-safe). */
export function parseGridTracks(input) {
    const tracks = [];
    let depth = 0;
    let current = '';
    for (const char of input) {
        if (char === '(')
            depth += 1;
        if (char === ')')
            depth = Math.max(0, depth - 1);
        if (char === ' ' && depth === 0) {
            if (current !== '') {
                tracks.push(current);
                current = '';
            }
            continue;
        }
        current += char;
    }
    if (current !== '')
        tracks.push(current);
    return tracks;
}
/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export function trackPx(track) {
    const match = /^(-?[\d.]+)px$/.exec(track.trim());
    return match === null ? 0 : Number(match[1]);
}
/** Locate the frame grid the panel column appends into. */
function findFrame() {
    return document.querySelector('[class*="sidebarCol"]')?.parentElement ?? null;
}
/** The layout controller: frame sync, implicit trailing column, toggle. */
export class PanelLayoutController {
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
            if (this.frame !== null)
                return;
            const frame = findFrame();
            if (frame === null)
                return;
            this.attach(frame);
        };
        this.waitObserver = new MutationObserver(() => { tryAttach(); });
        this.waitObserver.observe(document.body, { childList: true, subtree: true });
        tryAttach();
    }
    /** Attach to the frame: column, observers, store subscription. */
    attach(frame) {
        this.waitObserver?.disconnect();
        this.waitObserver = null;
        this.frame = frame;
        const column = document.createElement('div');
        column.dataset.newsclawPanelCol = '';
        column.style.minWidth = '0';
        column.style.overflow = 'hidden';
        column.style.display = 'flex';
        column.style.flexDirection = 'column';
        column.style.gridRow = '1';
        column.style.visibility = 'hidden';
        frame.appendChild(column);
        this.column = column;
        // The absolute drag handle (out of the grid flow), on the panel's left edge.
        const handle = this.createHandle();
        frame.appendChild(handle);
        this.handle = handle;
        // Mirror shell grid changes onto the implicit column placement. Crucially,
        // this observer never writes frame.style, so independent side panels cannot
        // enter a read/append/write feedback loop with one another.
        this.styleObserver = new MutationObserver(() => { this.syncGrid(); });
        this.styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] });
        // Measure the row width for the clamp, then re-apply on resize.
        this.sizeObserver = new ResizeObserver(() => {
            this.measure();
            this.applyGrid();
        });
        this.sizeObserver.observe(frame);
        // Store -> DOM.
        this.disposers.push(this.store.subscribe(() => { this.applyGrid(); }));
        // Initial sync: read the shell's inline grid (already applied).
        const initial = frame.style.gridTemplateColumns;
        if (initial !== '') {
            const tracks = parseGridTracks(initial);
            if (tracks.length >= 2)
                this.shellTracks = tracks;
        }
        this.measure();
        this.applyGrid();
    }
    /** Size/place the implicit trailing column and toggle its visibility. */
    applyGrid() {
        if (this.frame === null)
            return;
        if (this.shellTracks.length < 2)
            return;
        if (this.column === null)
            return;
        const state = this.store.getSnapshot();
        const width = state.open ? this.clampWidth(state.width) : 0;
        // Explicit tracks belong to the shell or other plugins. NewsClaw occupies
        // the first implicit column after them; its definite width participates in
        // grid sizing and pushes the fluid center without mutating the shared frame.
        this.column.style.gridColumnStart = String(this.shellTracks.length + 1);
        this.column.style.width = `${Math.round(width)}px`;
        this.column.style.visibility = width > 0 ? 'visible' : 'hidden';
        if (this.handle !== null) {
            const frameRect = this.frame.getBoundingClientRect();
            const columnRect = this.column.getBoundingClientRect();
            const left = Math.round(columnRect.left - frameRect.left);
            this.handle.style.left = `${left}px`;
            this.handle.style.display = width > 0 ? 'block' : 'none';
        }
    }
    /** Create the drag handle and wire its pointer drag. */
    createHandle() {
        const el = document.createElement('div');
        el.className = 'newsclaw-panel-handle';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.bottom = '0';
        el.style.zIndex = '30';
        el.style.width = '8px';
        el.style.marginLeft = '-4px';
        el.style.cursor = 'col-resize';
        el.style.display = 'none';
        el.addEventListener('pointerdown', (event) => {
            handlePointerDragStart(event, el, {
                reverse: true,
                getStartWidth: () => this.store.getSnapshot().width,
                compute: (start, delta) => this.clampWidth(start + delta),
                onFrame: (width) => {
                    this.store.update((prev) => (prev.width === width ? prev : { ...prev, width }));
                },
                onEnd: (width) => {
                    this.store.update((prev) => (prev.width === width ? prev : { ...prev, width }));
                    persistPanelWidth(width);
                    this.applyGrid();
                },
                onDragStateChange: (dragging) => {
                    if (this.frame !== null)
                        this.frame.style.transition = dragging ? 'none' : '';
                },
            });
        });
        // Double-click resets to the contract default width.
        el.addEventListener('dblclick', () => {
            this.store.update((prev) => (prev.width === PANEL_DEFAULT_WIDTH_PX ? prev : { ...prev, width: PANEL_DEFAULT_WIDTH_PX }));
            persistPanelWidth(PANEL_DEFAULT_WIDTH_PX);
            this.applyGrid();
        });
        return el;
    }
    /** Clamp the requested width so the chat area keeps at least MIN_CHAT_PX. */
    clampWidth(requested) {
        // Track 1 is the shell's fluid center. Reserve every fixed px track around
        // it, including columns owned by other independent panel plugins.
        const fixed = this.shellTracks.reduce((sum, track, index) => (index === 1 ? sum : sum + Math.max(0, trackPx(track))), 0);
        const available = Math.max(0, this.frameWidth - fixed);
        const maxByContainer = available - MIN_CHAT_PX;
        // Both contracts cannot fit below 680px of usable room. Collapse the
        // panel column until the window grows instead of stealing chat space.
        if (maxByContainer < PANEL_MIN_WIDTH_PX)
            return 0;
        return Math.min(PANEL_MAX_WIDTH_PX, maxByContainer, Math.max(PANEL_MIN_WIDTH_PX, requested));
    }
    /** Mirror explicit shell/foreign-panel tracks without writing frame style. */
    syncGrid() {
        if (this.frame === null)
            return;
        const inline = this.frame.style.gridTemplateColumns;
        if (inline === '')
            return;
        const tracks = parseGridTracks(inline);
        if (tracks.length >= 2) {
            this.shellTracks = tracks;
            this.applyGrid();
        }
    }
    /** Measure the frame width (used by the clamp). */
    measure() {
        if (this.frame === null)
            return;
        this.frameWidth = this.frame.getBoundingClientRect().width;
    }
    /** Toggle the panel open/closed. */
    toggle() {
        this.setOpen(!this.store.getSnapshot().open);
    }
    /** Open or close the panel (persisted). */
    setOpen(open) {
        this.store.update((prev) => (prev.open === open ? prev : { ...prev, open }));
        persistPanelOpen(open);
        this.applyGrid();
    }
    /** Detach everything (plugin unload). */
    dispose() {
        this.waitObserver?.disconnect();
        this.styleObserver?.disconnect();
        this.sizeObserver?.disconnect();
        for (const dispose of this.disposers)
            dispose();
        this.column?.remove();
        this.handle?.remove();
        this.frame = null;
        this.column = null;
        this.handle = null;
    }
}
//# sourceMappingURL=layout.js.map