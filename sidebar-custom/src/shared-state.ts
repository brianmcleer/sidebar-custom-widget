export interface SidebarSharedState {
  controllerPanelOpen: boolean
  lastPanelContainerSelector?: string
  panelHiddenByToggle?: boolean
}

const state: Record<string, SidebarSharedState> = {}

export function getSharedState(widgetId: string): SidebarSharedState {
    if (!state[widgetId]) {
        state[widgetId] = {
            controllerPanelOpen: false,
            lastPanelContainerSelector: undefined,
            panelHiddenByToggle: false
        }
    }
    return state[widgetId]
} 