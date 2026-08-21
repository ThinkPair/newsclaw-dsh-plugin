/**
 * DOM layout controller for the NewsClaw panel column.
 *
 * The official DSH frame is a three-column grid (`sidebar | center | details`);
 * there is no root-scoped `aside` slot and `ctx.layout` has no aside verbs, so
 * the panel cannot claim a column through the slot system. This controller
 * extends the frame grid directly by appending one item in the first implicit
 * trailing column. Its definite width participates in grid sizing, so the
 * center `1fr` track shrinks without rewriting the shared
 * `grid-template-columns`. This matters when another independent panel is
 * also active: competing frame-style observers would otherwise feed each
 * other's appended tracks forever. A MutationObserver mirrors shell track
 * changes only onto this item's placement and never writes the observed style.
 *
 * Collapsing keeps the column mounted at width 0. Failure policy: DOM wiring
 * errors are logged, never thrown — a plugin apply throw fails the whole GUI.
 * @module @newsclaw/dsh-plugin
 */
import type { StateHandle } from './store.ts'
import {
  PANEL_DEFAULT_WIDTH_PX, PANEL_MAX_WIDTH_PX, PANEL_MIN_WIDTH_PX, MIN_CHAT_PX,
  persistPanelOpen, persistPanelWidth,
} from './store.ts'
import { handlePointerDragStart } from './drag.ts'

/** The column element marker (mount.tsx targets it). */
export const PANEL_COL_SELECTOR = '[data-newsclaw-panel-col]'

/** Parse an inline grid-template-columns string into its tracks (paren-safe). */
export function parseGridTracks(input: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ' ' && depth === 0) {
      if (current !== '') {
        tracks.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') tracks.push(current)
  return tracks
}

/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export function trackPx(track: string): number {
  const match = /^(-?[\d.]+)px$/.exec(track.trim())
  return match === null ? 0 : Number(match[1])
}

/** Locate the frame grid the panel column appends into. */
function findFrame(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[class*="sidebarCol"]')?.parentElement ?? null
}

/** The layout controller: frame sync, implicit trailing column, toggle. */
export class PanelLayoutController {
  private frame: HTMLElement | null = null
  private column: HTMLDivElement | null = null
  private handle: HTMLDivElement | null = null
  private styleObserver: MutationObserver | null = null
  private sizeObserver: ResizeObserver | null = null
  private waitObserver: MutationObserver | null = null
  private shellTracks: string[] = []
  private frameWidth = 0
  private disposers: Array<() => void> = []

  constructor(private readonly store: StateHandle<{ open: boolean; width: number }>) {}

  /** Start watching for the frame and attach once it appears. */
  mount(): void {
    const tryAttach = (): void => {
      if (this.frame !== null) return
      const frame = findFrame()
      if (frame === null) return
      this.attach(frame)
    }
    this.waitObserver = new MutationObserver(() => { tryAttach() })
    this.waitObserver.observe(document.body, { childList: true, subtree: true })
    tryAttach()
  }

  /** Attach to the frame: column, observers, store subscription. */
  private attach(frame: HTMLElement): void {
    this.waitObserver?.disconnect()
    this.waitObserver = null
    this.frame = frame

    const column = document.createElement('div')
    column.dataset.newsclawPanelCol = ''
    column.style.minWidth = '0'
    column.style.overflow = 'hidden'
    column.style.display = 'flex'
    column.style.flexDirection = 'column'
    column.style.gridRow = '1'
    column.style.visibility = 'hidden'
    frame.appendChild(column)
    this.column = column

    // The absolute drag handle (out of the grid flow), on the panel's left edge.
    const handle = this.createHandle()
    frame.appendChild(handle)
    this.handle = handle

    // Mirror shell grid changes onto the implicit column placement. Crucially,
    // this observer never writes frame.style, so independent side panels cannot
    // enter a read/append/write feedback loop with one another.
    this.styleObserver = new MutationObserver(() => { this.syncGrid() })
    this.styleObserver.observe(frame, { attributes: true, attributeFilter: ['style'] })

    // Measure the row width for the clamp, then re-apply on resize.
    this.sizeObserver = new ResizeObserver(() => {
      this.measure()
      this.applyGrid()
    })
    this.sizeObserver.observe(frame)

    // Store -> DOM.
    this.disposers.push(this.store.subscribe(() => { this.applyGrid() }))

    // Initial sync: read the shell's inline grid (already applied).
    const initial = frame.style.gridTemplateColumns
    if (initial !== '') {
      const tracks = parseGridTracks(initial)
      if (tracks.length >= 2) this.shellTracks = tracks
    }
    this.measure()
    this.applyGrid()
  }

  /** Size/place the implicit trailing column and toggle its visibility. */
  private applyGrid(): void {
    if (this.frame === null) return
    if (this.shellTracks.length < 2) return
    if (this.column === null) return
    const state = this.store.getSnapshot()
    const width = state.open ? this.clampWidth(state.width) : 0

    // Explicit tracks belong to the shell or other plugins. NewsClaw occupies
    // the first implicit column after them; its definite width participates in
    // grid sizing and pushes the fluid center without mutating the shared frame.
    this.column.style.gridColumnStart = String(this.shellTracks.length + 1)
    this.column.style.width = `${Math.round(width)}px`
    this.column.style.visibility = width > 0 ? 'visible' : 'hidden'
    if (this.handle !== null) {
      const frameRect = this.frame.getBoundingClientRect()
      const columnRect = this.column.getBoundingClientRect()
      const left = Math.round(columnRect.left - frameRect.left)
      this.handle.style.left = `${left}px`
      this.handle.style.display = width > 0 ? 'block' : 'none'
    }
  }

  /** Create the drag handle and wire its pointer drag. */
  private createHandle(): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'newsclaw-panel-handle'
    el.style.position = 'absolute'
    el.style.top = '0'
    el.style.bottom = '0'
    el.style.zIndex = '30'
    el.style.width = '8px'
    el.style.marginLeft = '-4px'
    el.style.cursor = 'col-resize'
    el.style.display = 'none'

    el.addEventListener('pointerdown', (event) => {
      handlePointerDragStart(event, el, {
        reverse: true,
        getStartWidth: () => this.store.getSnapshot().width,
        compute: (start, delta) => this.clampWidth(start + delta),
        onFrame: (width) => {
          this.store.update((prev) => (prev.width === width ? prev : { ...prev, width }))
        },
        onEnd: (width) => {
          this.store.update((prev) => (prev.width === width ? prev : { ...prev, width }))
          persistPanelWidth(width)
          this.applyGrid()
        },
        onDragStateChange: (dragging) => {
          if (this.frame !== null) this.frame.style.transition = dragging ? 'none' : ''
        },
      })
    })

    // Double-click resets to the contract default width.
    el.addEventListener('dblclick', () => {
      this.store.update((prev) => (prev.width === PANEL_DEFAULT_WIDTH_PX ? prev : { ...prev, width: PANEL_DEFAULT_WIDTH_PX }))
      persistPanelWidth(PANEL_DEFAULT_WIDTH_PX)
      this.applyGrid()
    })
    return el
  }

  /** Clamp the requested width so the chat area keeps at least MIN_CHAT_PX. */
  private clampWidth(requested: number): number {
    // Track 1 is the shell's fluid center. Reserve every fixed px track around
    // it, including columns owned by other independent panel plugins.
    const fixed = this.shellTracks.reduce((sum, track, index) => (
      index === 1 ? sum : sum + Math.max(0, trackPx(track))
    ), 0)
    const available = Math.max(0, this.frameWidth - fixed)
    const maxByContainer = available - MIN_CHAT_PX
    // Both contracts cannot fit below 680px of usable room. Collapse the
    // panel column until the window grows instead of stealing chat space.
    if (maxByContainer < PANEL_MIN_WIDTH_PX) return 0
    return Math.min(PANEL_MAX_WIDTH_PX, maxByContainer, Math.max(PANEL_MIN_WIDTH_PX, requested))
  }

  /** Mirror explicit shell/foreign-panel tracks without writing frame style. */
  private syncGrid(): void {
    if (this.frame === null) return
    const inline = this.frame.style.gridTemplateColumns
    if (inline === '') return
    const tracks = parseGridTracks(inline)
    if (tracks.length >= 2) {
      this.shellTracks = tracks
      this.applyGrid()
    }
  }

  /** Measure the frame width (used by the clamp). */
  private measure(): void {
    if (this.frame === null) return
    this.frameWidth = this.frame.getBoundingClientRect().width
  }

  /** Toggle the panel open/closed. */
  toggle(): void {
    this.setOpen(!this.store.getSnapshot().open)
  }

  /** Open or close the panel (persisted). */
  setOpen(open: boolean): void {
    this.store.update((prev) => (prev.open === open ? prev : { ...prev, open }))
    persistPanelOpen(open)
    this.applyGrid()
  }

  /** Detach everything (plugin unload). */
  dispose(): void {
    this.waitObserver?.disconnect()
    this.styleObserver?.disconnect()
    this.sizeObserver?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.column?.remove()
    this.handle?.remove()
    this.frame = null
    this.column = null
    this.handle = null
  }
}
