/** @jsx jsx */
import {
    React,
    type AllWidgetProps,
    jsx,
    type IMState,
    getAppStore,
    appActions
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

type Rect = { top: number; left: number; width: number; height: number }

export default class Widget extends React.PureComponent<AllWidgetProps<IMSidebarConfig> & ExtraProps> {
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

    static mapExtraStateProps = (state: IMState, props: AllWidgetProps<IMSidebarConfig>): ExtraProps => {
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

    private getCollapseSide(): HTMLElement | null {
        const widgetEl = document.querySelector(`[data-widgetid="${this.props.id}"]`)
        if (!widgetEl) return null
        const allCollapsible = widgetEl.querySelectorAll('.side-collapsable')
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
            this.pollTimer = window.setInterval(() => this.pollControllerPanel(), 250)
        }, 2000)

        window.addEventListener('resize', this.handleWindowResize)
    }

    componentWillUnmount(): void {
        window.removeEventListener('resize', this.handleWindowResize)
        if (this.pollTimer !== null) clearInterval(this.pollTimer)
        if (this.rafId !== null) cancelAnimationFrame(this.rafId)
        if (this.resizeDebounceTimer !== null) clearTimeout(this.resizeDebounceTimer)
        if (this.panelObserver) { this.panelObserver.disconnect(); this.panelObserver = null }
        this.cleanupPanelStyles()
        this.removePlaceholder()
    }

    componentDidUpdate(prevProps: AllWidgetProps<IMSidebarConfig> & ExtraProps): void {
        if (
            this.initialized && !this.getControllerId() &&
            this.props.tableActiveTabId && this.props.tableActiveTabId !== this.lastActiveTabId
        ) {
            this.lastActiveTabId = this.props.tableActiveTabId
            getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
        }

        // --- Sidebar just EXPANDED ---
        if (!prevProps.sidebarVisible && this.props.sidebarVisible) {
            this.justExpandedAt = Date.now()
            this.manuallyCollapsed = false

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

        // --- Controller Redux state changed (backup detection) ---
        if (this.getControllerId() && prevProps.controllerOpenState !== this.props.controllerOpenState) {
            if (this.manuallyCollapsed) {
                this.manuallyCollapsed = false
                const ss = getSharedState(this.props.id)
                ss.controllerPanelOpen = false
            }
            setTimeout(() => this.pollControllerPanel(), 100)
        }
    }

    private handleWindowResize = (): void => {
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
            for (const mutation of mutations) {
                // Check added nodes for new panel containers / controller-panels
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i]
                    if (!(node instanceof HTMLElement)) continue

                    const panels = node.classList?.contains('controller-panel')
                        ? [node]
                        : Array.from(node.querySelectorAll('.controller-panel'))

                    for (const panel of panels) {
                        if (panel.classList.contains('d-none')) continue
                        const pc = panel.closest('.panel-container') as HTMLElement
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
                    if (el.classList?.contains('controller-panel') && !el.classList.contains('d-none')) {
                        const pc = el.closest('.panel-container') as HTMLElement
                        if (pc && !pc.hasAttribute('data-sidebar-panel') && this.isPanelOurs(pc)) {
                            pc.style.opacity = '0'
                            pc.style.pointerEvents = 'none'
                        }
                    }
                }
            }
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
        const containers = document.querySelectorAll('.panel-container') as NodeListOf<HTMLElement>
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
        const nearestWidget = pc.closest('[data-widgetid]')
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
            const panels = pc.querySelectorAll('.controller-panel')
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
        const panels = document.querySelectorAll('.controller-panel')
        for (let i = 0; i < panels.length; i++) {
            if (panels[i].classList.contains('d-none')) continue
            const pc = panels[i].closest('.panel-container') as HTMLElement
            if (pc && this.isPanelOurs(pc)) return true
        }
        return false
    }

    private findPanelContainer(): HTMLElement | null {
        const allContainers = document.querySelectorAll('.panel-container')
        for (let i = 0; i < allContainers.length; i++) {
            const pc = allContainers[i] as HTMLElement
            if (!this.isPanelOurs(pc)) continue
            const visiblePanel = pc.querySelector('.controller-panel:not(.d-none)')
            if (visiblePanel) return pc
        }
        return null
    }

    private getVisiblePanelIndex(): number {
        const allContainers = document.querySelectorAll('.panel-container')
        for (let i = 0; i < allContainers.length; i++) {
            const pc = allContainers[i] as HTMLElement
            if (!this.isPanelOurs(pc)) continue
            const panels = pc.querySelectorAll('.controller-panel')
            for (let j = 0; j < panels.length; j++) {
                if (!panels[j].classList.contains('d-none')) return j
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
            const childWidgets = collapseSide.querySelectorAll('[data-widgetid]')
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
        const useSnap = forceSnap || isFirstWrite || inWarmupWindow || !this.transitionsEnabled
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

            if (!this.props.sidebarVisible) {
                getAppStore().dispatch(appActions.widgetStatePropChange(this.props.id, 'collapse', true))
                this.justExpandedAt = Date.now()
            }
        } else if (!panelOpen && ss.controllerPanelOpen) {
            ss.controllerPanelOpen = false
            this.cleanupPanelStyles(true)
            if (this.props.sidebarVisible) {
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