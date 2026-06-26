import { Immutable, type ImmutableObject } from 'jimu-core'
import { type BorderStyle, NormalLineType } from 'jimu-ui'

export interface SidebarControllerStyle {
  style: React.CSSProperties
}

export interface ColorDef {
  useTheme?: boolean
  color?: string
  opacity?: number
}

export interface ToggleBtnColor {
  normal: {
    icon: ColorDef
    bg: ColorDef
  }
  hover?: {
    icon?: ColorDef
    bg?: ColorDef
  }
}

export interface SidebarConfig {
  direction: SidebarType
  collapseSide: CollapseSides
  overlay: boolean
  size: string
  resizable: boolean
  toggleBtn: {
    visible: boolean
    icon: ICON_TYPE
    iconSource?: number
    template?: string
    offsetX?: number
    offsetY?: number
    position?: SidebarControllerPositions
    color: ToggleBtnColor
    border: BorderStyle
    iconSize: number
    width: number
    height: number
    expandStyle?: SidebarControllerStyle // style for the expand button
    collapseStyle?: SidebarControllerStyle // style for the collapse button
  }
  defaultState: number
  controllerWidgetId?: string
  divider: {
    visible: boolean
    lineStyle?: BorderStyle
  }
  firstPanelStyle?: any
  secondPanelStyle?: any
  // ---- Custom (City of Grand Junction) enhancements ----
  // Which events are allowed to auto-expand a collapsed sidebar.
  autoExpand?: {
    onTable: boolean // expand when a table is opened via Add to table / View in table
    onController: boolean // expand when a widget inside the linked controller opens
  }
  // Optional keyboard shortcut to toggle the sidebar at runtime.
  keyboard?: {
    enabled: boolean
    key: string // single key, e.g. 'b'
    ctrl?: boolean // ctrl on Windows / cmd on macOS
    alt?: boolean
    shift?: boolean
  }
  // Auto-collapse on small screens, then restore when the screen grows back.
  responsive?: {
    enabled: boolean
    breakpoint: number // viewport width in px below which the sidebar collapses
  }
  // Honor the OS "reduce motion" setting by skipping the slide animation.
  respectReducedMotion?: boolean
  // Auto-resize: widen the sidebar while a tool or table panel is showing in it,
  // then restore the configured size when it closes. Skipped if the user has
  // manually resized the sidebar.
  autoResize?: {
    enabled: boolean
    expandedSize: string // CSS size applied while content is open, e.g. '600px'
  }
  // Peek-on-hover: hovering the collapsed edge briefly reveals the sidebar.
  peek?: {
    enabled: boolean
    delay: number // ms of hover before it peeks open
  }
  // Update badge: a dot on the toggle button when collapsed content changes
  // while the sidebar is collapsed; cleared when it is expanded.
  badge?: {
    enabled: boolean
  }
  // Optional header bar on the hosted panel with pin and close controls.
  // Pinning suppresses the auto-collapse behaviors until unpinned.
  panelHeader?: {
    enabled: boolean
  }
  // Publish an Experience Builder StringSelectionChange message ('expanded' or
  // 'collapsed') on toggle so other widgets can react via a message action.
  publishToggle?: {
    enabled: boolean
  }
  // Reflect the collapsed/expanded state in the app URL and restore it on load.
  deepLink?: {
    enabled: boolean
  }
}

export type IMSidebarConfig = ImmutableObject<SidebarConfig>

export enum CollapseSides {
  First = 'FIRST',
  Second = 'SECOND',
}

export enum SidebarControllerPositions {
  Start = 'START',
  Center = 'CENTER',
  End = 'END',
}

export enum SidebarType {
  Horizontal = 'HORIZONTAL',
  Vertical = 'VERTICAL',
}

export enum ICON_TYPE {
  Left = 'LEFT',
  Right = 'RIGHT',
  Up = 'UP',
  Down = 'DOWN',
}

export const defaultConfig: IMSidebarConfig = Immutable({
  direction: SidebarType.Horizontal,
  collapseSide: CollapseSides.First,
  overlay: false,
  size: '300px',
  divider: {
    visible: true,
    lineStyle: {
      type: NormalLineType.SOLID,
      color: 'var(--ref-palette-neutral-500)',
      width: '1px'
    }
  },
  resizable: false,
  toggleBtn: {
    visible: true,
    icon: ICON_TYPE.Left,
    iconSource: 0,
    offsetX: 15,
    offsetY: 0,
    position: SidebarControllerPositions.Center,
    iconSize: 14,
    width: 15,
    height: 60,
    border: {
      type: NormalLineType.SOLID,
      color: 'var(--ref-palette-neutral-500)',
      width: '1px'
    },
    color: {
      normal: {
        icon: {
          useTheme: false,
          color: 'var(--ref-palette-black)'
        },
        bg: {
          useTheme: true,
          color: 'var(--ref-palette-neutral-200)'
        }
      },
      hover: {
        bg: {
          useTheme: true,
          color: 'var(--ref-palette-neutral-200)'
        }
      }
    },
    expandStyle: {
      style: {
        borderRadius: '0 92px 92px 0'
      }
    },
    collapseStyle: {
      style: {
        borderRadius: '0 92px 92px 0'
      }
    }
  },
  defaultState: 1,
  autoExpand: {
    onTable: true,
    onController: true
  },
  keyboard: {
    enabled: false,
    key: 'b',
    ctrl: true,
    alt: false,
    shift: false
  },
  responsive: {
    enabled: false,
    breakpoint: 768
  },
  respectReducedMotion: true,
  autoResize: {
    enabled: false,
    expandedSize: '600px'
  },
  peek: {
    enabled: false,
    delay: 250
  },
  badge: {
    enabled: false
  },
  panelHeader: {
    enabled: false
  },
  publishToggle: {
    enabled: false
  },
  deepLink: {
    enabled: false
  }
})
