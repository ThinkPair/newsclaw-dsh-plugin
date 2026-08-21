import type { NewsClawClientConnection } from './index.ts';
import { type PanelLayoutController } from './layout.ts';
/** Theme face the panel follows (host light/dark scheme). */
export interface PanelThemeFace {
    isDark: () => boolean;
    onThemeChange: (listener: (dark: boolean) => void) => () => void;
}
/**
 * Mount the NewsClaw panel into the appended column.
 * @param controller - the layout controller (owns open/close).
 * @param theme - the shell theme face.
 * @returns a disposer unmounting the tree.
 */
export declare function mountPanel(controller: PanelLayoutController, theme: PanelThemeFace, connection: NewsClawClientConnection): () => void;
//# sourceMappingURL=mount.d.ts.map