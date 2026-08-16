/**
 * DOM layout controller for the NewsClaw panel column.
 *
 * The official DSH frame is a three-column grid (`sidebar | center | details`);
 * there is no root-scoped `aside` slot and `ctx.layout` has no aside verbs, so
 * the panel cannot claim a column through the slot system. This controller
 * extends the frame grid directly by appending one item in the first implicit
 * trailing column. Its definite width participates in grid sizing, so the
 * center `1fr` track shrinks without rewriting the shared
 * `grid-template-columns`. This matters when OpenBiliClaw or another panel is
 * also active: competing frame-style observers would otherwise feed each
 * other's appended tracks forever. A MutationObserver mirrors shell track
 * changes only onto this item's placement and never writes the observed style.
 *
 * Collapsing keeps the column mounted at width 0. Failure policy: DOM wiring
 * errors are logged, never thrown — a plugin apply throw fails the whole GUI.
 * @module @newsclaw/dsh-plugin
 */
import type { StateHandle } from './store.ts';
/** The column element marker (mount.tsx targets it). */
export declare const PANEL_COL_SELECTOR = "[data-newsclaw-panel-col]";
/** Parse an inline grid-template-columns string into its tracks (paren-safe). */
export declare function parseGridTracks(input: string): string[];
/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export declare function trackPx(track: string): number;
/** The layout controller: frame sync, implicit trailing column, toggle. */
export declare class PanelLayoutController {
    private readonly store;
    private frame;
    private column;
    private handle;
    private styleObserver;
    private sizeObserver;
    private waitObserver;
    private shellTracks;
    private frameWidth;
    private disposers;
    constructor(store: StateHandle<{
        open: boolean;
        width: number;
    }>);
    /** Start watching for the frame and attach once it appears. */
    mount(): void;
    /** Attach to the frame: column, observers, store subscription. */
    private attach;
    /** Size/place the implicit trailing column and toggle its visibility. */
    private applyGrid;
    /** Create the drag handle and wire its pointer drag. */
    private createHandle;
    /** Clamp the requested width so the chat area keeps at least MIN_CHAT_PX. */
    private clampWidth;
    /** Mirror explicit shell/foreign-panel tracks without writing frame style. */
    private syncGrid;
    /** Measure the frame width (used by the clamp). */
    private measure;
    /** Toggle the panel open/closed. */
    toggle(): void;
    /** Open or close the panel (persisted). */
    setOpen(open: boolean): void;
    /** Detach everything (plugin unload). */
    dispose(): void;
}
//# sourceMappingURL=layout.d.ts.map