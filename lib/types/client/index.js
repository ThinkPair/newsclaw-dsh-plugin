import { createPanelLayoutStore } from "./store.js";
import { PanelLayoutController } from "./layout.js";
import { mountPanel } from "./mount.js";
import { NewsClawSidebarButton } from "./sidebarButton.js";
/** Required services: the slot registry (trigger button) and the shell theme. */
export const inject = ['slots', 'theme'];
/**
 * Client plugin body: mount the panel column into the frame grid (DOM-level,
 * pushing the center content) plus a left-sidebar toggle button.
 * @param ctx - client root context.
 */
export function apply(ctx) {
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
            disposers.push(mountPanel(layout, theme));
        }
        catch (error) {
            console.error('[newsclaw] panel mount failed:', error);
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