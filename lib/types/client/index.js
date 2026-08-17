import { writeApiBase } from "./api.js";
import { normalizeApiUrl, normalizeTimeoutMs } from "../config.js";
import { createPanelLayoutStore } from "./store.js";
import { PanelLayoutController } from "./layout.js";
import { mountPanel } from "./mount.js";
import { NewsClawSidebarButton } from "./sidebarButton.js";
/** Required services: the slot registry (trigger button) and the shell theme. */
export const inject = ['slots', 'theme'];
export function resolveClientConfig(config) {
    return {
        apiUrl: normalizeApiUrl(config?.apiUrl),
        timeoutMs: normalizeTimeoutMs(config?.timeoutMs),
    };
}
/**
 * Client plugin body: mount the panel column into the frame grid (DOM-level,
 * pushing the center content) plus a left-sidebar toggle button.
 * @param ctx - client root context.
 */
export function apply(ctx, config) {
    const connection = resolveClientConfig(config);
    // Legacy child views can still fall back to readApiBase(); keep that value
    // in lockstep with the Harness row instead of maintaining a second setting.
    writeApiBase(connection.apiUrl);
    const store = createPanelLayoutStore();
    const layout = new PanelLayoutController(store);
    const theme = {
        isDark: () => ctx.theme.getTheme().active.colorScheme === 'dark',
        onThemeChange: (listener) => (ctx.on('theme/change', snapshot => { listener(snapshot.active.colorScheme === 'dark'); })),
    };
    // Wire the column + panel. DOM failures degrade the panel, never the GUI.
    ctx.effect(() => {
        const disposers = [];
        try {
            layout.mount();
            disposers.push(mountPanel(layout, theme, connection));
        }
        catch (error) {
            console.error('[newsclaw] panel mount failed:', error);
            for (const dispose of [...disposers].reverse())
                dispose();
            disposers.length = 0;
            layout.dispose();
        }
        return () => {
            for (const dispose of disposers)
                dispose();
            layout.dispose();
        };
    }, 'newsclaw: panel wiring');
    // Left-sidebar trigger (additive foot action beside Settings).
    ctx.effect(() => {
        try {
            return ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
                name: 'sidebar.footer.action',
                id: 'newsclaw',
                inject: () => ({ togglePanel: () => { layout.toggle(); } }),
            }, NewsClawSidebarButton));
        }
        catch (error) {
            console.error('[newsclaw] sidebar button registration failed; Harness remains usable:', error);
            return () => undefined;
        }
    }, 'newsclaw: sidebar button');
}
//# sourceMappingURL=index.js.map