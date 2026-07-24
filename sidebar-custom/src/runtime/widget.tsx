/** @jsx jsx */
import {
    React,
    type AllWidgetProps,
    jsx,
    type IMState,
    getAppStore,
    appActions,
    MessageManager,
    StringSelectionChangeMessage
} from 'jimu-core'
import { SidebarLayout } from '../layout/runtime/layout'
import type { IMSidebarConfig } from '../config'
import { versionManager } from '../version-manager'
import { getSharedState } from '../shared-state'

interface ExtraProps {
    sidebarVisible: boolean
    controllerOpenState: string
    tableActiveTabId: string
}

type RuntimeProps = AllWidgetProps<IMSidebarConfig> & ExtraProps & {
    id: string
    layouts: any
    theme: any
    builderSupportModules?: any
}

type Rect = { top: number; left: number; width: number; height: number }

// ---- Hardening: all Experience Builder DOM coupling lives here ----
// Every selector and class name this widget depends on from EB's internal markup
// is centralized below. If an EB release renames any of these and the auto-expand
// stops working, updating these strings is the one-line first thing to try,
// instead of hunting through the file.
const SEL = {
    controllerPanel: '.controller-panel',
    panelContainer: '.panel-container',
    collapsable: '.side-collapsable',
    widgetId: '[data-widgetid]'
}
const CLS = {
    hidden: 'd-none',
    controllerPanel: 'controller-panel'
}
// Self-protection thresholds. If the controller DOM machinery throws this many
// times in a row, it shuts itself down cleanly and the widget falls back to a
// plain sidebar rather than spinning or surfacing errors.
const MAX_CONSECUTIVE_POLL_ERRORS = 5
const POLL_FAST_MS = 250
const POLL_IDLE_MS = 1000
const IDLE_POLLS_BEFORE_BACKOFF = 20

export default class Widget extends React.PureComponent<RuntimeProps> {
    declare readonly props: RuntimeProps
    declare forceUpdate: (callback?: () => void) => void
    private lastActiveTabId: string = ''
    private initialized: boolean = false
    private pollTimer: number | null = null
    private rafId: number | null = null

    // ---- Smooth animation safety ----
    private lastRect: Rect | null = null
    private lastSyncTs: number = 0
    private resizeDebounceTimer: number | null = null
    private transitionsEnabled: boolean = true

    // ---- "warmup snap" on expand to avoid top bump ----
    private justExpandedAt: number = 0

    // ---- Toggle-collapse tracking ----
    private manuallyCollapsed: boolean = false
    private panelIndexAtCollapse: number = -1

    // Track if we've ever successfully shown a panel (first open works)
    private hasEverSynced: boolean = false

    // MutationObserver to catch new panel containers instantly (prevent flash)
    private panelObserver: MutationObserver | null = null

    // Cached layout ID prefixes for our controller (e.g. ["layout_41_", "layout_44_"])
    private _ourLayoutPrefixes: string[] | null = null

    // ---- Custom (City of Grand Junction) enhancement state ----
    private collapsedByResponsive: boolean = false

    // ---- Hardening state ----
    private pollDelay: number = POLL_FAST_MS
    private idlePolls: number = 0
    private pollErrorCount: number = 0
    private machineryDisabled: boolean = false

    // ---- Phase 3 feature state (all gated behind config flags, default off) ----
    private peekActive: boolean = false
    private peekTimer: number | null = null
    private peekRootEl: HTMLElement | null = null
    private pinned: boolean = false
    private badgePending: boolean = false
    private lastPublishedToggle: string = ''

    static mapExtraStateProps = (state: IMState, props: RuntimeProps): ExtraProps => {
        const defaultCollapse = props.config.defaultState !== 0

        let tableActiveTabId = ''
        let controllerOpenState = ''
        const widgetsState = state?.widgetsState
        if (widgetsState) {
            for (const widgetId of Object.keys(widgetsState)) {
                const activeTabId = widgetsState[widgetId]?.dataActionActiveObj?.activeTabId
                if (activeTabId) {
                    tableActiveTabId = activeTabId
                    break
                }
            }
            const cfg = props.config
            const controllerId = cfg?.controllerWidgetId || (cfg as any)?.get?.('controllerWidgetId')
            if (controllerId && controllerId !== '__pending__' && widgetsState[controllerId]) {
                controllerOpenState = JSON.stringify(widgetsState[controllerId])
            }
        }

        return {
            sidebarVisible: state?.widgetsState?.[props.id]?.collapse ?? defaultCollapse,
            controllerOpenState,
            tableActiveTabId
        }
    }

    static versionManager = versionManager

    private getControllerId(): string | undefined {
        const cfg = this.props.config
        const id = cfg?.controllerWidgetId || (cfg as any)?.get?.('controllerWidgetId')
        if (id === '__pending__') return undefined
        return id
    }

    // ---- Custom enhancement helpers ----
    // All read defensively so saved apps without these fields keep working.

    private autoExpandOnTable (): boolean {
        const cfg = this.props.config as any
        return (cfg?.autoExpand?.onTable ?? cfg?.get?.('autoExpand')?.onTable) ?? true
    }

    private autoExpandOnController (): boolean {
        const cfg = this.props.config as any
        return (cfg?.autoExpand?.onController ?? cfg?.get?.('autoExpand')?.onController) ?? true
    }

    private autoResizeEnabled (): boolean {
        const cfg = this.props.config as any
        return (cfg?.autoResize?.enabled ?? cfg?.get?.('autoResize')?.enabled) ?? false
    }

    private peekConfig (): { enabled: boolean, delay: number } | undefined {
        const cfg = this.props.config as any
        return cfg?.peek ?? cfg?.get?.('peek')
    }

    private badgeEnabled (): boolean {
        const cfg = this.props.config as any
        return (cfg?.badge?.enabled ?? cfg?.get?.('badge')?.enabled) ?? false
    }

    private panelHeaderEnabled (): boolean {
        const cfg = this.props.config as any
        return (cfg?.panelHeader?.enabled ?? cfg?.get?.('panelHeader')?.enabled) ?? false
    }

    private publishToggleEnabled (): boolean {
        const cfg = this.props.config as any
        return (cfg?.publishToggle?.enabled ?? cfg?.get?.('publishToggle')?.enabled) ?? false
    }

    private deepLinkEnabled (): boolean {
        const cfg = this.props.config as any
        return (cfg?.deepLink?.enabled ?? cfg?.get?.('deepLink')?.enabled) ?? false
    }

    private deepLinkKey (): string { return `sb_${this.props.id}` }

    private prefersReducedMotion (): boolean {
        const cfg = this.props.config as any
        const respect = (cfg?.respectReducedMotion ?? cfg?.get?.('respectReducedMotion')) ?? true
        if (!respect) return false
        try {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        } catch {
            return false
        }
    }

    private getKeyboardConfig (): { enabled: boolean, key: string, ctrl?: boolean, alt?: boolean, shift?: boolean } | undefined {
        const cfg = this.props.config as any
        return cfg?.keyboard ?? cfg?.get?.('keyboard')
    }

    private getResponsiveConfig (): { enabled: boolean, breakpoint: number } | undefined {
        const cfg = this.props.config as any
        return cfg?.responsive ?? cfg?.get?.('responsive')
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        const kb = this.getKeyboardConfig()
        if (!kb?.enabled || !kb.key) return
        if (window.jimuConfig?.isInBuilder) return
        if (e.key.toLowerCase() !== kb.key.toLowerCase()) return
        if (!!kb.ctrl !== (e.ctrlKey || e.metaKey)) return
        if (!!kb.alt !== e.altKey) return
        if (!!kb.shift !== e.shiftKey) return
        // Don't hijack the key while the user is typing in a field.
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        getAppStore().dispatch(
            appActions.widgetStatePropChange(this.props.id, 'collapse', !this.props.sidebarVisible)
        )
    }

    private checkResponsive (): void {
        const r = this.getResponsiveConfig()
        if (!r?.enabled || window.jimuConfig?.isInBuilder) return
        const below = window.innerWidth < (r.breakpoint || 768)
        if (below) {
            // Entering a small screen: collapse if we are open. Remember that we
            // were the one who collapsed it so we can restore later.
            if (this.props.sidebarVisible && !this.collapsedByResponsive && !this.pinned) {
                this.collapsedByResponsive = true
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', false))
            }
        } else if (this.collapsedByResponsive) {
            // Back to a large screen: only restore if WE collapsed it, so we
            // never override a collapse the user chose themselves.
            this.collapsedByResponsive = false
            if (!this.props.sidebarVisible) {
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
            }
        }
    }

    private getCollapseSide(): HTMLElement | null {
        const widgetEl = document.querySelector(`[data-widgetid="${this.props.id}"]`)
        if (!widgetEl) return null
        const allCollapsible = widgetEl.querySelectorAll(SEL.collapsable)
        if (allCollapsible.length === 0) return null
        if (allCollapsible.length === 1) return allCollapsible[0] as HTMLElement
        let shallowest: HTMLElement | null = null
        let minDepth = Infinity
        allCollapsible.forEach((el) => {
            let depth = 0
            let parent = el.parentElement
            while (parent && parent !== widgetEl) { depth++; parent = parent.parentElement }
            if (depth < minDepth) { minDepth = depth; shallowest = el as HTMLElement }
        })
        return shallowest
    }

    componentDidMount(): void {
        this.lastActiveTabId = this.props.tableActiveTabId
        this.cleanupStaleElements()

        if (this.getControllerId()) {
            const ss = getSharedState(this.props.id)
            if (this.isPanelOpen()) ss.controllerPanelOpen = true
            this.startPanelObserver()
        }

        setTimeout(() => {
            if (this.getControllerId() && this.props.sidebarVisible && !this.isPanelOpen()) {
                this.showPlaceholder()
            }
        }, 500)

        setTimeout(() => {
            this.initialized = true
            // Only run the controller DOM machinery when a controller is linked.
            // With no controller (or the link cleared in settings) no poll runs at
            // all, and the widget behaves as a plain sidebar. Clearing the linked
            // controller is the clean off switch for everything in this engine.
            if (this.getControllerId()) {
                this.scheduleNextPoll()
            }
        }, 2000)

        window.addEventListener('resize', this.handleWindowResize)
        window.addEventListener('keydown', this.handleKeyDown)

        // Apply responsive collapse to the initial viewport size.
        setTimeout(() => { this.checkResponsive() }, 2100)

        // Phase 3: peek hover listeners, and restore any URL deep-link state.
        setTimeout(() => { this.setupPeek() }, 300)
        setTimeout(() => { this.applyDeepLinkFromUrl() }, 1500)
    }

    componentWillUnmount(): void {
        window.removeEventListener('resize', this.handleWindowResize)
        window.removeEventListener('keydown', this.handleKeyDown)
        if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null }
        if (this.rafId !== null) cancelAnimationFrame(this.rafId)
        if (this.resizeDebounceTimer !== null) clearTimeout(this.resizeDebounceTimer)
        if (this.panelObserver) { this.panelObserver.disconnect(); this.panelObserver = null }
        this.cleanupPanelStyles()
        this.removePlaceholder()
        this.teardownPeek()
        this.removeBadge()
        this.removePanelHeader()
    }

    componentDidUpdate(prevProps: RuntimeProps): void {
        if (
            this.initialized && !this.getControllerId() && this.autoExpandOnTable() &&
            this.props.tableActiveTabId && this.props.tableActiveTabId !== this.lastActiveTabId
        ) {
            this.lastActiveTabId = this.props.tableActiveTabId
            getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
        }

        // --- Sidebar just EXPANDED ---
        if (!prevProps.sidebarVisible && this.props.sidebarVisible) {
            this.justExpandedAt = Date.now()
            this.manuallyCollapsed = false

            // Phase 3: content is now visible, so clear the update badge; announce
            // the change to subscribers and reflect it in the URL.
            this.badgePending = false
            this.removeBadge()
            this.publishToggleMessage(true)
            this.writeDeepLinkToUrl(true)

            // Restore any panel containers hidden by the toggle button collapse.
            // When the sidebar was collapsed via the toggle button,
            // handleToggleSidebar set visibility:hidden / opacity:0 /
            // pointer-events:none on the panel container.  If the sidebar is now
            // being expanded programmatically (e.g. the user clicked a new tool
            // while collapsed) that restore path in handleToggleSidebar never
            // runs, so we must clean up here.
            this.restoreToggleHiddenPanels()


            setTimeout(() => {
                if (this.isPanelOpen() && this.props.sidebarVisible) {
                    const pc = this.findPanelContainer()
                    
                    // Before syncing, clear any ExB inline styles that conflict
                    // with our CSS. ExB may have set width/height/left to bad
                    // values while our !important CSS was overriding them.
                    if (pc) {
                        const inlineWidth = pc.style.width
                        const inlineLeft = pc.style.left
                        // Remove ExB's inline positioning — our style element handles it
                        pc.style.removeProperty('width')
                        pc.style.removeProperty('height')
                        pc.style.removeProperty('left')
                        pc.style.removeProperty('right')
                        pc.style.removeProperty('top')
                        pc.style.removeProperty('bottom')
                        pc.style.removeProperty('max-width')
                        pc.style.removeProperty('max-height')
                        pc.style.removeProperty('position')
                    }
                    
                    this.syncPanelToSidebar(true)
                    this.startSyncLoop()
                    this.removePlaceholder()
                    window.dispatchEvent(new Event('resize'))
                } else if (!this.isPanelOpen()) {
                    this.showPlaceholder()
                }
            }, 100)

            // Retry
            setTimeout(() => {
                if (this.isPanelOpen() && this.props.sidebarVisible) {
                    this.syncPanelToSidebar(true)
                    window.dispatchEvent(new Event('resize'))
                }
            }, 500)
        }

        // --- Sidebar just COLLAPSED ---
        if (prevProps.sidebarVisible && !this.props.sidebarVisible) {
            this.removePlaceholder()
            this.removePanelHeader()
            this.publishToggleMessage(false)
            this.writeDeepLinkToUrl(false)

            if (this.getControllerId()) {
                const hadActivePanel = this.lastRect !== null ||
                    !!document.getElementById(`sidebar-panel-style-${this.props.id}`)

                if (hadActivePanel) {
                    this.manuallyCollapsed = true
                    this.panelIndexAtCollapse = this.getVisiblePanelIndex()

                    // Freeze panel offscreen at full size. Keep our CSS so ExB's
                    // inline styles (which may go to width:0) stay overridden.
                    this.stopSyncLoop()
                    const styleId = `sidebar-panel-style-${this.props.id}`
                    const styleEl = document.getElementById(styleId) as HTMLStyleElement
                    if (styleEl && this.lastRect) {
                        const sel = `.panel-container[data-sidebar-panel="${this.props.id}"]`
                        styleEl.textContent = `
                          ${sel} {
                            position: fixed !important;
                            top: ${this.lastRect.top}px !important;
                            left: -9999px !important;
                            width: ${this.lastRect.width}px !important;
                            height: ${this.lastRect.height}px !important;
                            max-height: ${this.lastRect.height}px !important;
                            opacity: 1 !important;
                            pointer-events: none !important;
                            transition: none !important;
                            overflow: hidden !important;
                            z-index: -1 !important;
                          }
                          ${sel} .controller-panel:not(.d-none) {
                            width: 100% !important;
                            height: 100% !important;
                            max-width: 100% !important;
                            max-height: 100% !important;
                            overflow: auto !important;
                          }
                        `
                    }
                } else {
                    this.cleanupPanelStyles()
                }
            } else {
                this.cleanupPanelStyles()
            }
        }

        // --- Controller Redux state changed (primary open/close signal) ---
        // The controller's widgetState changing is the authoritative, framework
        // level signal that a tool opened or closed. We act on it immediately and
        // wake the poll back to fast cadence; the DOM poll is the fallback that
        // handles positioning, not the primary detector.
        if (this.getControllerId() && prevProps.controllerOpenState !== this.props.controllerOpenState) {
            if (this.manuallyCollapsed) {
                this.manuallyCollapsed = false
                const ss = getSharedState(this.props.id)
                ss.controllerPanelOpen = false
            }
            this.wakePoll()
            setTimeout(() => { try { this.pollControllerPanel() } catch { /* fail quiet */ } }, 100)
        }

        // Phase 3: raise the update badge when the collapsed content changes while
        // the sidebar is collapsed (a tool/table opened or switched out of view).
        if (
            this.badgeEnabled() && !this.props.sidebarVisible &&
            (prevProps.controllerOpenState !== this.props.controllerOpenState ||
             prevProps.tableActiveTabId !== this.props.tableActiveTabId)
        ) {
            this.badgePending = true
            this.updateBadge()
        }
    }

    private handleWindowResize = (): void => {
        this.checkResponsive()
        this.noteLiveResize()
        if (this.isPanelOpen() && this.props.sidebarVisible) this.syncPanelToSidebar()
    }

    private cleanupStaleElements(): void {
        const ids = [`sidebar-placeholder-${this.props.id}`, `sidebar-panel-style-${this.props.id}`]
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.remove() })
        document.querySelectorAll(`[data-sidebar-panel="${this.props.id}"]`).forEach(
            el => el.removeAttribute('data-sidebar-panel')
        )
    }

    /**
     * MutationObserver that watches for new `.controller-panel` elements
     * appearing in the DOM.  When ExB opens a tool it creates the panel at
     * its default position (e.g. floating top-right) before our poll/sync
     * can reposition it.  This observer fires *synchronously* on the DOM
     * mutation — before the browser paints — so we can hide the panel
     * container with opacity:0 immediately.  Our syncPanelToSidebar later
     * sets opacity:1 at the correct position.
     */
    private startPanelObserver(): void {
        if (this.panelObserver) return

        this.panelObserver = new MutationObserver((mutations) => {
          try {
            for (const mutation of mutations) {
                // Check added nodes for new panel containers / controller-panels
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i]
                    if (!(node instanceof HTMLElement)) continue

                    const panels = node.classList?.contains(CLS.controllerPanel)
                        ? [node]
                        : Array.from(node.querySelectorAll(SEL.controllerPanel))

                    for (const panel of panels) {
                        if (panel.classList.contains(CLS.hidden)) continue
                        const pc = panel.closest(SEL.panelContainer) as HTMLElement
                        if (!pc || pc.hasAttribute('data-sidebar-panel')) continue
                        // Only hide if it looks like it belongs to our controller
                        if (this.isPanelOurs(pc)) {
                            pc.style.opacity = '0'
                            pc.style.pointerEvents = 'none'
                        }
                    }
                }

                // Also check attribute/class changes that make a panel visible
                if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
                    const el = mutation.target
                    if (el.classList?.contains(CLS.controllerPanel) && !el.classList.contains(CLS.hidden)) {
                        const pc = el.closest(SEL.panelContainer) as HTMLElement
                        if (pc && !pc.hasAttribute('data-sidebar-panel') && this.isPanelOurs(pc)) {
                            pc.style.opacity = '0'
                            pc.style.pointerEvents = 'none'
                        }
                    }
                }
            }
          } catch { /* fail quiet: a DOM hiccup must never break the observer */ }
        })

        this.panelObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        })
    }

    /**
     * When the sidebar was collapsed via the toggle button, handleToggleSidebar
     * sets inline visibility:hidden / opacity:0 / pointer-events:none on the
     * panel container and marks it with data-sidebar-hidden-by-toggle.
     *
     * If the sidebar later re-expands *programmatically* (e.g. the user selects
     * a new tool while collapsed), handleToggleSidebar's "expanding" branch
     * never runs, leaving those styles in place.  This helper cleans them up.
     */
    private restoreToggleHiddenPanels(): void {
        const ss = getSharedState(this.props.id)
        const containers = document.querySelectorAll(SEL.panelContainer) as NodeListOf<HTMLElement>
        for (let i = 0; i < containers.length; i++) {
            const pc = containers[i]
            if (
                pc.getAttribute('data-sidebar-hidden-by-toggle') === this.props.id ||
                (ss.panelHiddenByToggle && pc.style.visibility === 'hidden')
            ) {
                pc.style.removeProperty('visibility')
                pc.style.removeProperty('opacity')
                pc.style.removeProperty('pointer-events')
                pc.removeAttribute('data-sidebar-hidden-by-toggle')
            }
        }
        ss.panelHiddenByToggle = false
    }

    /**
     * Get layout ID prefixes for our controller's layouts.
     * Controller-panel elements have IDs like "layout_41_11" where "layout_41"
     * is the layout ID from appConfig.  We cache ["layout_41_", "layout_44_", ...]
     * so we can instantly identify which panel-container belongs to our controller.
     */
    private getOurLayoutPrefixes(): string[] {
        if (this._ourLayoutPrefixes !== null) return this._ourLayoutPrefixes

        const controllerId = this.getControllerId()
        if (!controllerId) { this._ourLayoutPrefixes = []; return [] }

        try {
            const state = getAppStore().getState()
            const appConfig = state?.appConfig
            const rawGet = (obj: any, key: string): any => obj?.[key] ?? obj?.get?.(key) ?? null

            const controllerWidget = rawGet(rawGet(appConfig, 'widgets'), controllerId)
            if (!controllerWidget) return []

            const controllerLayouts = rawGet(rawGet(controllerWidget, 'layouts'), 'controller')
            if (!controllerLayouts) return []

            const prefixes: string[] = []
            for (const mode of ['LARGE', 'MEDIUM', 'SMALL']) {
                const layoutId = rawGet(controllerLayouts, mode)
                if (layoutId) prefixes.push(layoutId + '_')
            }

            this._ourLayoutPrefixes = prefixes
        } catch {
            return []
        }

        return this._ourLayoutPrefixes
    }

    private isPanelOurs(pc: HTMLElement): boolean {
        const controllerId = this.getControllerId()
        if (!controllerId) return false
        const owner = pc.getAttribute('data-sidebar-panel')
        if (owner === this.props.id) return true
        if (owner && owner !== this.props.id) return false
        const nearestWidget = pc.closest(SEL.widgetId)
        if (nearestWidget) {
            const wid = nearestWidget.getAttribute('data-widgetid')
            if (wid === controllerId) return true
            return false
        }
        // Body-level panel: check if it contains a .controller-panel whose
        // id starts with one of our controller's layout IDs.
        // These IDs are set at DOM creation time — no timing issues.
        const prefixes = this.getOurLayoutPrefixes()
        if (prefixes.length > 0) {
            const panels = pc.querySelectorAll(SEL.controllerPanel)
            for (let i = 0; i < panels.length; i++) {
                const id = panels[i].id
                if (id && prefixes.some(p => id.startsWith(p))) return true
            }
            return false
        }
        // Prefixes not resolved yet (appConfig not ready) — V1 default
        return true
    }

    private isPanelOpen(): boolean {
        const controllerId = this.getControllerId()
        if (!controllerId) return false
        const panels = document.querySelectorAll(SEL.controllerPanel)
        for (let i = 0; i < panels.length; i++) {
            if (panels[i].classList.contains(CLS.hidden)) continue
            const pc = panels[i].closest(SEL.panelContainer) as HTMLElement
            if (pc && this.isPanelOurs(pc)) return true
        }
        return false
    }

    private findPanelContainer(): HTMLElement | null {
        const allContainers = document.querySelectorAll(SEL.panelContainer)
        for (let i = 0; i < allContainers.length; i++) {
            const pc = allContainers[i] as HTMLElement
            if (!this.isPanelOurs(pc)) continue
            const visiblePanel = pc.querySelector(`${SEL.controllerPanel}:not(.${CLS.hidden})`)
            if (visiblePanel) return pc
        }
        return null
    }

    private getVisiblePanelIndex(): number {
        const allContainers = document.querySelectorAll(SEL.panelContainer)
        for (let i = 0; i < allContainers.length; i++) {
            const pc = allContainers[i] as HTMLElement
            if (!this.isPanelOurs(pc)) continue
            const panels = pc.querySelectorAll(SEL.controllerPanel)
            for (let j = 0; j < panels.length; j++) {
                if (!panels[j].classList.contains(CLS.hidden)) return j
            }
        }
        return -1
    }

    /**
     * Returns true if this sidebar's collapsible area is meant to host
     * controller panels (and should therefore show the placeholder).
     *
     * The key insight: a sidebar that hosts controller panels has an empty
     * collapsible side (no child widgets), while a sidebar used for other
     * content (e.g. a table) will have widgets rendered inside its
     * collapsible area.  This prevents the "Select a tool" placeholder
     * from appearing over the bottom table sidebar.
     */
    private isControllerOwnedBySidebar(): boolean {
        // Once we've successfully positioned a panel here, we know we own it.
        if (this.hasEverSynced) return true

        const controllerId = this.getControllerId()
        if (!controllerId) return false

        // Check for any panel container already attributed to us.
        const attributed = document.querySelector(`[data-sidebar-panel="${this.props.id}"]`)
        if (attributed) return true

        // If the collapsible side already contains rendered widgets (e.g. a
        // table), this sidebar is being used for other content, not for
        // hosting controller panels — skip the placeholder.
        const collapseSide = this.getCollapseSide()
        if (collapseSide) {
            const childWidgets = collapseSide.querySelectorAll(SEL.widgetId)
            if (childWidgets.length > 0) return false
        }

        return true
    }

    // ---- Smooth animation safety helpers ----

    private noteLiveResize(): void {
        this.setTransitionsEnabled(false)
        if (this.resizeDebounceTimer !== null) clearTimeout(this.resizeDebounceTimer)
        this.resizeDebounceTimer = window.setTimeout(() => {
            this.setTransitionsEnabled(true)
            this.resizeDebounceTimer = null
        }, 180)
    }

    private setTransitionsEnabled(enabled: boolean): void { this.transitionsEnabled = enabled }

    private rectDiff(a: Rect, b: Rect): number {
        return Math.abs(a.top - b.top) + Math.abs(a.left - b.left) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height)
    }

    private syncPanelToSidebar(forceSnap: boolean = false): void {
        const collapseSide = this.getCollapseSide()
        if (!collapseSide) return

        const sideRect = collapseSide.getBoundingClientRect()
        if (sideRect.width < 50 || sideRect.height < 50) return

        const pc = this.findPanelContainer()
        if (!pc) return

        const now = Date.now()
        const rect: Rect = { top: sideRect.top, left: sideRect.left, width: sideRect.width, height: sideRect.height }

        if (this.lastRect && !forceSnap) {
            const d = this.rectDiff(rect, this.lastRect)
            if (d < 0.5) return
        }

        if (this.lastRect) {
            const dt = now - this.lastSyncTs
            const d = this.rectDiff(rect, this.lastRect)
            if (dt < 90 || d > 30) this.noteLiveResize()
        }

        const isFirstWrite = this.lastRect === null
        this.lastRect = rect
        this.lastSyncTs = now

        pc.setAttribute('data-sidebar-panel', this.props.id)

        const styleId = `sidebar-panel-style-${this.props.id}`
        let styleEl = document.getElementById(styleId) as HTMLStyleElement
        if (!styleEl) {
            styleEl = document.createElement('style')
            styleEl.id = styleId
            document.head.appendChild(styleEl)
        }

        const sel = `.panel-container[data-sidebar-panel="${this.props.id}"]`
        const inWarmupWindow = (this.justExpandedAt > 0) && (now - this.justExpandedAt < 200)
        const useSnap = forceSnap || isFirstWrite || inWarmupWindow || !this.transitionsEnabled || this.prefersReducedMotion()
        const transition = useSnap
            ? 'none'
            : 'top 180ms ease-out, left 180ms ease-out, width 200ms ease-out, height 200ms ease-out'

        styleEl.textContent = `
      ${sel} {
        position: fixed !important;
        top: ${rect.top}px !important;
        left: ${rect.left}px !important;
        width: ${rect.width}px !important;
        height: ${rect.height}px !important;
        max-height: ${rect.height}px !important;
        transform: none !important;
        clip-path: none !important;
        transition: ${transition} !important;
        opacity: 1 !important;
        overflow: hidden !important;
        z-index: 50 !important;
        pointer-events: auto !important;
      }
      ${sel} .controller-panel:not(.d-none) {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        overflow: auto !important;
      }
      ${sel} .panel-header button:first-child {
        display: none !important;
      }
    `
        this.hasEverSynced = true
        this.updatePanelHeader(rect)

    }

    private startSyncLoop(): void {
        if (this.rafId !== null) return
        const loop = () => {
            if (!this.isPanelOpen()) { this.rafId = null; return }
            if (this.props.sidebarVisible) this.syncPanelToSidebar()
            this.rafId = requestAnimationFrame(loop)
        }
        this.rafId = requestAnimationFrame(loop)
    }

    private stopSyncLoop(): void {
        if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
    }

    private cleanupPanelStyles(animate: boolean = false): void {
        this.stopSyncLoop()
        const styleId = `sidebar-panel-style-${this.props.id}`
        const styleEl = document.getElementById(styleId) as HTMLStyleElement

        if (animate && styleEl) {
            const sel = `.panel-container[data-sidebar-panel="${this.props.id}"]`
            styleEl.textContent += `
                ${sel} { opacity: 0 !important; transition: opacity 150ms ease-out !important; pointer-events: none !important; }
            `
            setTimeout(() => this.doCleanupPanelStyles(), 160)
        } else {
            this.doCleanupPanelStyles()
        }
    }

    private doCleanupPanelStyles(): void {
        const styleEl = document.getElementById(`sidebar-panel-style-${this.props.id}`)
        if (styleEl) styleEl.remove()
        document.querySelectorAll(`[data-sidebar-panel="${this.props.id}"]`).forEach(
            el => el.removeAttribute('data-sidebar-panel')
        )
        this.lastRect = null
        this.removePanelHeader()
    }

    private scheduleNextPoll(): void {
        if (this.machineryDisabled) return
        if (this.pollTimer !== null) clearTimeout(this.pollTimer)
        this.pollTimer = window.setTimeout(() => {
            this.runPoll()
            this.scheduleNextPoll()
        }, this.pollDelay)
    }

    // Wraps the poll so a single DOM hiccup can never throw out of the timer.
    // Repeated failures self-disable the machinery (clean fallback to a plain
    // sidebar). Also backs the poll off when there is clearly nothing to do.
    private runPoll(): void {
        if (this.machineryDisabled) return
        let panelOpen = false
        try {
            panelOpen = this.isPanelOpen()
            this.pollControllerPanel()
            this.pollErrorCount = 0
        } catch (err) {
            this.pollErrorCount++
            if (this.pollErrorCount >= MAX_CONSECUTIVE_POLL_ERRORS) {
                console.warn('[sidebar-custom] controller integration disabled after repeated errors; falling back to a plain sidebar.', err)
                this.disableMachinery()
                return
            }
        }
        // Idle backoff: stay responsive while a panel is open or the sidebar is
        // expanded with a controller; otherwise slow down. A real open or close is
        // still caught immediately by the Redux-driven path in componentDidUpdate,
        // so backing off here cannot cause a missed transition.
        const active = panelOpen || (this.props.sidebarVisible && !!this.getControllerId())
        if (active) {
            this.idlePolls = 0
            this.pollDelay = POLL_FAST_MS
        } else if (++this.idlePolls > IDLE_POLLS_BEFORE_BACKOFF) {
            this.pollDelay = POLL_IDLE_MS
        }
    }

    // Return to fast polling immediately (called when Redux signals a change).
    private wakePoll(): void {
        this.idlePolls = 0
        this.pollDelay = POLL_FAST_MS
    }

    // Shut the DOM machinery down cleanly. After this the widget is a plain
    // sidebar: no poll, no observer, no injected styles or placeholder.
    private disableMachinery(): void {
        this.machineryDisabled = true
        if (this.pollTimer !== null) { clearTimeout(this.pollTimer); this.pollTimer = null }
        if (this.panelObserver) { this.panelObserver.disconnect(); this.panelObserver = null }
        try { this.cleanupPanelStyles() } catch { /* ignore */ }
        try { this.removePlaceholder() } catch { /* ignore */ }
    }

    private pollControllerPanel(): void {
        if (!this.getControllerId()) return

        const ss = getSharedState(this.props.id)
        const panelOpen = this.isPanelOpen()

        if (this.manuallyCollapsed) {
            if (!panelOpen) {
                this.manuallyCollapsed = false
                ss.controllerPanelOpen = false
                return
            }
            const currentIndex = this.getVisiblePanelIndex()
            if (currentIndex !== -1 && currentIndex !== this.panelIndexAtCollapse) {
                this.manuallyCollapsed = false
                ss.controllerPanelOpen = false
            } else {
                return
            }
        }

        if (panelOpen && !ss.controllerPanelOpen) {
            ss.controllerPanelOpen = true

            // Immediately hide the panel container so it doesn't flash at
            // ExB's default position (e.g. top-right corner) before our
            // syncPanelToSidebar repositions it into the sidebar.
            const pc = this.findPanelContainer()
            if (pc) {
                pc.style.opacity = '0'
                pc.style.pointerEvents = 'none'
            }

            if (!this.props.sidebarVisible && this.autoExpandOnController()) {
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
                this.justExpandedAt = Date.now()
            } else if (this.props.sidebarVisible && this.autoResizeEnabled()) {
                // Already expanded when the panel appeared, so no collapse dispatch
                // fires and the layout would not re-render on its own. Nudge it so
                // calSidebarSize can apply the auto-resize width.
                this.forceUpdate()
            }
        } else if (!panelOpen && ss.controllerPanelOpen) {
            ss.controllerPanelOpen = false
            this.cleanupPanelStyles(true)
            if (this.props.sidebarVisible && !this.pinned) {
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', false))
            }
        }

        if (panelOpen) {
            if (this.props.sidebarVisible) {
                this.syncPanelToSidebar()
                this.startSyncLoop()
                this.removePlaceholder()
            }
        } else if (this.props.sidebarVisible) {
            this.cleanupPanelStyles()
            this.showPlaceholder()
        } else {
            this.cleanupPanelStyles()
            this.removePlaceholder()
        }

        this.updateBadge()
    }

    private showPlaceholder(): void {
        // Only show the placeholder if this sidebar's controller actually has
        // panel containers that belong to us.  Without this check, a second
        // sidebar instance (e.g. the bottom table sidebar) that shares the same
        // controllerWidgetId would show the toolbar placeholder over its own
        // collapsable area — even though the toolbar panels are attributed to a
        // different sidebar.
        if (!this.isControllerOwnedBySidebar()) return

        const placeholderId = `sidebar-placeholder-${this.props.id}`
        let el = document.getElementById(placeholderId)
        const collapseSide = this.getCollapseSide()
        if (!collapseSide) return
        const rect = collapseSide.getBoundingClientRect()
        if (rect.width < 50 || rect.height < 50) return

        if (!el) {
            el = document.createElement('div')
            el.id = placeholderId
            el.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span>Select a tool from the toolbar to get started</span>
      `
            document.body.appendChild(el)
        }

        el.style.cssText = `
      position: fixed;
      top: ${rect.top}px; left: ${rect.left}px;
      width: ${rect.width}px; height: ${rect.height}px;
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      pointer-events: none; color: #6b7280; font-size: 14px; text-align: center;
      padding: 20px; gap: 8px; z-index: 10; background: rgba(255,255,255,0.85);
      opacity: 0; transition: opacity 250ms ease-in;
    `
        requestAnimationFrame(() => { if (el) el.style.opacity = '1' })
    }

    private removePlaceholder(): void {
        const el = document.getElementById(`sidebar-placeholder-${this.props.id}`)
        if (el) el.remove()
    }

    // ============================================================
    // Phase 3 features. Each is inert unless its config flag is on.
    // ============================================================

    // ---- Peek-on-hover ----
    private setupPeek(): void {
        const cfg = this.peekConfig()
        if (!cfg?.enabled || window.jimuConfig?.isInBuilder) return
        const root = document.querySelector(`[data-widgetid="${this.props.id}"]`) as HTMLElement
        if (!root) { setTimeout(() => { this.setupPeek() }, 500); return }
        this.peekRootEl = root
        root.addEventListener('mouseenter', this.handlePeekEnter)
        root.addEventListener('mouseleave', this.handlePeekLeave)
    }

    private teardownPeek(): void {
        if (this.peekTimer !== null) { clearTimeout(this.peekTimer); this.peekTimer = null }
        if (this.peekRootEl) {
            this.peekRootEl.removeEventListener('mouseenter', this.handlePeekEnter)
            this.peekRootEl.removeEventListener('mouseleave', this.handlePeekLeave)
            this.peekRootEl = null
        }
    }

    private handlePeekEnter = (): void => {
        const cfg = this.peekConfig()
        if (!cfg?.enabled || this.pinned) return
        if (this.props.sidebarVisible) return // already open
        if (this.peekTimer !== null) clearTimeout(this.peekTimer)
        this.peekTimer = window.setTimeout(() => {
            if (!this.props.sidebarVisible) {
                // collapse=true means EXPANDED in this widget's state convention.
                this.peekActive = true
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
            }
        }, Math.max(0, cfg.delay ?? 250))
    }

    private handlePeekLeave = (): void => {
        if (this.peekTimer !== null) { clearTimeout(this.peekTimer); this.peekTimer = null }
        // Only re-collapse if WE peeked it open and the user has not pinned it.
        if (this.peekActive && !this.pinned) {
            this.peekActive = false
            if (this.props.sidebarVisible) {
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', false))
            }
        }
    }

    // ---- Update badge ----
    private updateBadge(): void {
        const id = `sidebar-badge-${this.props.id}`
        const existing = document.getElementById(id)
        const show = this.badgeEnabled() && this.badgePending && !this.props.sidebarVisible
        if (!show) { if (existing) existing.remove(); return }
        const root = document.querySelector(`[data-widgetid="${this.props.id}"]`)
        const btn = root?.querySelector('.sidebar-controller') as HTMLElement
        if (!btn) return
        const r = btn.getBoundingClientRect()
        if (r.width < 1) return
        let el = existing
        if (!el) {
            el = document.createElement('div')
            el.id = id
            document.body.appendChild(el)
        }
        el.style.cssText = `
          position: fixed;
          top: ${r.top - 3}px; left: ${r.left + r.width - 7}px;
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--sys-color-error, #d83020);
          box-shadow: 0 0 0 2px var(--ref-palette-white, #fff);
          pointer-events: none; z-index: 60;
        `
    }

    private removeBadge(): void {
        const el = document.getElementById(`sidebar-badge-${this.props.id}`)
        if (el) el.remove()
    }

    // ---- Panel header (pin / close) ----
    private updatePanelHeader(rect: Rect): void {
        if (!this.panelHeaderEnabled()) { this.removePanelHeader(); return }
        const id = `sidebar-header-${this.props.id}`
        let el = document.getElementById(id) as HTMLElement
        if (!el) {
            el = document.createElement('div')
            el.id = id
            el.innerHTML = `
              <button type="button" data-act="pin" title="Pin open" aria-label="Pin open" style="cursor:pointer;border:none;padding:2px 8px;border-radius:4px;font-size:12px;line-height:1.4;">Pin</button>
              <button type="button" data-act="close" title="Close" aria-label="Close" style="cursor:pointer;border:none;background:transparent;padding:2px 8px;border-radius:4px;font-size:16px;line-height:1;">&times;</button>
            `
            document.body.appendChild(el)
            el.addEventListener('click', this.handleHeaderClick)
        }
        el.style.cssText = `
          position: fixed;
          top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: 28px;
          display: flex; align-items: center; justify-content: flex-end; gap: 4px;
          padding: 0 6px; box-sizing: border-box;
          background: var(--ref-palette-neutral-200, #f0f0f0);
          border-bottom: 1px solid var(--sys-color-divider-secondary, #ccc);
          pointer-events: auto; z-index: 51;
        `
        this.refreshPinButton()
    }

    private refreshPinButton(): void {
        const el = document.getElementById(`sidebar-header-${this.props.id}`)
        const pinBtn = el?.querySelector('[data-act="pin"]') as HTMLElement
        if (pinBtn) {
            pinBtn.style.background = this.pinned ? 'var(--sys-color-primary, #007ac2)' : 'transparent'
            pinBtn.style.color = this.pinned ? '#fff' : 'inherit'
        }
    }

    private handleHeaderClick = (e: MouseEvent): void => {
        const t = (e.target as HTMLElement)?.closest('[data-act]') as HTMLElement
        if (!t) return
        const act = t.getAttribute('data-act')
        if (act === 'pin') {
            this.pinned = !this.pinned
            this.refreshPinButton()
        } else if (act === 'close') {
            this.pinned = false
            this.peekActive = false
            // collapse=false means COLLAPSED in this widget's state convention.
            getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', false))
        }
    }

    private removePanelHeader(): void {
        const el = document.getElementById(`sidebar-header-${this.props.id}`)
        if (el) el.remove()
    }

    // ---- Publish expand/collapse as a message other widgets can subscribe to ----
    private publishToggleMessage(expanded: boolean): void {
        if (!this.publishToggleEnabled()) return
        const stateStr = expanded ? 'expanded' : 'collapsed'
        if (stateStr === this.lastPublishedToggle) return
        this.lastPublishedToggle = stateStr
        try {
            MessageManager.getInstance().publishMessage(
                new StringSelectionChangeMessage(this.props.id, stateStr)
            )
        } catch (err) {
            console.warn('[sidebar-custom] publishToggle failed', err)
        }
    }

    // ---- URL deep-linking (native History API, widget-scoped param) ----
    private applyDeepLinkFromUrl(): void {
        if (!this.deepLinkEnabled() || window.jimuConfig?.isInBuilder) return
        try {
            const params = new URLSearchParams(window.location.search)
            const v = params.get(this.deepLinkKey())
            if (v === 'open' || v === 'closed') {
                const wantVisible = v === 'open'
                if (wantVisible !== this.props.sidebarVisible) {
                    getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', wantVisible))
                }
            }
        } catch { /* ignore */ }
    }

    private writeDeepLinkToUrl(expanded: boolean): void {
        if (!this.deepLinkEnabled() || window.jimuConfig?.isInBuilder) return
        try {
            const url = new URL(window.location.href)
            url.searchParams.set(this.deepLinkKey(), expanded ? 'open' : 'closed')
            const panelIdx = this.getVisiblePanelIndex()
            if (expanded && panelIdx >= 0) {
                url.searchParams.set(`${this.deepLinkKey()}_panel`, String(panelIdx))
            } else {
                url.searchParams.delete(`${this.deepLinkKey()}_panel`)
            }
            window.history.replaceState(window.history.state, '', url.toString())
        } catch { /* ignore */ }
    }

    render(): React.JSX.Element {
        const { layouts, theme, builderSupportModules } = this.props
        const LayoutComponent = !window.jimuConfig.isInBuilder
            ? SidebarLayout
            : builderSupportModules.widgetModules.SidebarLayoutBuilder

        if (LayoutComponent == null) {
            return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>No layout component!</div>
        }

        return (
            <div className='widget-sidebar-layout d-flex w-100 h-100'>
                <LayoutComponent
                    theme={theme}
                    widgetId={this.props.id}
                    direction={this.props.config.direction}
                    firstLayouts={layouts.FIRST}
                    secondLayouts={layouts.SECOND}
                    config={this.props.config}
                    sidebarVisible={this.props.sidebarVisible}
                />
            </div>
        )
    }
} 