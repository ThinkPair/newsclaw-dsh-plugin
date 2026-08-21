/**
 * NewsClaw DeepSeek Harness plugin — browser half.
 *
 * The official DSH layout has no root-scoped `aside` slot and `ctx.layout` has
 * no aside verbs, so the panel cannot claim a column through the slot system.
 * Instead this plugin extends the frame grid directly: a
 * `PanelLayoutController` appends one item in the first implicit trailing
 * column and gives it the panel width, so opening the panel PUSHES the
 * center/conversation column instead of overlaying it. It deliberately never
 * rewrites the frame's shared `grid-template-columns`, allowing other
 * independent side panels to coexist without observer feedback.
 *
 * The only slot registration is the left-sidebar trigger button
 * (`sidebar.footer.action`), which toggles the column. The panel's business
 * face (close + theme) is passed by the DOM mount, not a slot inject.
 * @module @newsclaw/dsh-plugin
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { NewsClawPanelProps, NewsClawInjected } from './NewsClawPanel.tsx';
/** Required services: the slot registry (trigger button) and the shell theme. */
export declare const inject: string[];
/** Safe browser-side subset of the same Harness row config used by tools. */
export interface NewsClawClientConfig {
    apiUrl?: string;
    timeoutMs?: number;
}
/** Resolved connection shared by every panel surface. */
export interface NewsClawClientConnection {
    apiUrl: string;
    timeoutMs: number;
}
export declare function resolveClientConfig(config?: NewsClawClientConfig): NewsClawClientConnection;
/**
 * Client plugin body: mount the panel column into the frame grid (DOM-level,
 * pushing the center content) plus a left-sidebar toggle button.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext, config?: NewsClawClientConfig): void;
//# sourceMappingURL=index.d.ts.map