/**
 * NewsClaw DeepSeek Harness plugin — browser half.
 *
 * The official DSH layout has no root-scoped `aside` slot and `ctx.layout` has
 * no aside verbs, so the panel cannot claim a column through the slot system.
 * Instead this plugin extends the frame grid directly: a
 * `PanelLayoutController` appends one item in the first implicit trailing
 * column and gives it the panel width, so opening the panel PUSHES the
 * center/conversation column instead of overlaying it. It deliberately never
 * rewrites the frame's shared `grid-template-columns`, allowing OpenBiliClaw
 * and other independent side panels to coexist without observer feedback.
 *
 * The only slot registration is the left-sidebar trigger button
 * (`sidebar.footer.action`), which toggles the column. The panel's business
 * face (close + theme) is passed by the DOM mount, not a slot inject.
 * @module @newsclaw/dsh-plugin
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-sidebar's SlotMap merge (`sidebar.footer.action`) and the
// theme plugin's Context merge (ctx.theme) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { createPanelLayoutStore } from './store.ts'
import { PanelLayoutController } from './layout.ts'
import { mountPanel, type PanelThemeFace } from './mount.tsx'
import { NewsClawSidebarButton } from './sidebarButton.tsx'

export type { NewsClawPanelProps, NewsClawInjected } from './NewsClawPanel.tsx'

/** Required services: the slot registry (trigger button) and the shell theme. */
export const inject = ['slots', 'theme']

/**
 * Client plugin body: mount the panel column into the frame grid (DOM-level,
 * pushing the center content) plus a left-sidebar toggle button.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const store = createPanelLayoutStore()
  const layout = new PanelLayoutController(store)
  const theme: PanelThemeFace = {
    isDark: () => ctx.theme.getTheme().active.colorScheme === 'dark',
    onThemeChange: (listener: (dark: boolean) => void) => (
      ctx.on('theme/change', snapshot => { listener(snapshot.active.colorScheme === 'dark') })
    ),
  }

  // Wire the column + panel. DOM failures degrade the panel, never the GUI.
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    try {
      layout.mount()
      disposers.push(mountPanel(layout, theme))
    } catch (error) {
      console.error('[newsclaw] panel mount failed:', error)
      for (const dispose of [...disposers].reverse()) dispose()
      disposers.length = 0
      layout.dispose()
    }
    return () => {
      for (const dispose of disposers) dispose()
      layout.dispose()
    }
  }, 'newsclaw: panel wiring')

  // Left-sidebar trigger (additive foot action beside Settings).
  ctx.effect(() => {
    try {
      return ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'newsclaw',
        inject: () => ({ togglePanel: () => { layout.toggle() } }),
      }, NewsClawSidebarButton))
    } catch (error) {
      console.error('[newsclaw] sidebar button registration failed; Harness remains usable:', error)
      return () => undefined
    }
  }, 'newsclaw: sidebar button')
}
