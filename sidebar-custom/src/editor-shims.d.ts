// editor-shims.d.ts
// City of Grand Junction GIS Division
//
// Widget-level, editor-only declarations for Visual Studio under Experience
// Builder 1.21 (pnpm layout). Companion to src/exb-editor-shims.d.ts, which is
// the shared master copied unchanged from your-extensions\widgets\_vs. This file
// adds only what the Sidebar Custom widget needs beyond the master. It emits no
// JavaScript and changes no runtime behavior; the EB webpack build resolves the
// real packages and never reads it.
//
// Rules (WIDGETHANDOFF Section 12, item 3): do not edit the master shim. Put
// widget-specific additions here. Ambient module declarations with a body merge
// with the master's, so members can be added without touching it.

// ───────────── jimu-core members used by this widget, missing from master ─────────────
declare module 'jimu-core' {
  // Types the master declares as values only; add the type side so they can be
  // used in type positions (`appMode: AppMode`, `messageType: MessageType`).
  export type AppMode = any
  export type MessageType = any
  export type BaseVersionManager = any
  export type LayoutType = any

  // Emotion
  export type SerializedStyles = any

  // Runtime helpers
  export const moduleLoader: {
    loadModule<T = any> (moduleName: string): Promise<T>
    [key: string]: any
  }
  export const APP_FRAME_NAME_IN_BUILDER: string
  export const LayoutItemType: any
  export type LayoutItemType = any
  export const MessageManager: any
  export const DataSourceTypes: any
  export type UseDataSource = any

  // Messaging
  export const AbstractMessageAction: any
  export type Message = any
  export type MessageDescription = any
  export type DataRecordsSelectionChangeMessage = any
  export const StringSelectionChangeMessage: any
  export type StringSelectionChangeMessage = any
  export type ActionSettingProps<C = any> = {
    widgetId: string
    messageWidgetId?: string
    actionId?: string
    config?: C
    onSettingChange: (...args: any[]) => void
    intl?: any
    theme?: any
    [key: string]: any
  }

  // App config operations extension point
  export namespace extensionSpec {
    interface AppConfigOperationsExtension {
      id: string
      widgetId?: string
      afterWidgetCopied?: (...args: any[]) => any
      [key: string]: any
    }
  }
  export type DuplicateContext = any
  export type IMSizeModeLayoutJson = any
  export type IMThemeVariables = any
}

declare module 'jimu-core/dnd' {
  export const interact: any
}

// ───────────── React members used by this widget, missing from master ─────────────
declare module 'react' {
  export type ComponentClass<P = any, S = any> = any
}

// ───────────── Third-party editor-only shims ─────────────
declare function require (path: string): any

declare module '*.svg' {
  const icon: any
  export default icon
}

declare module '@interactjs/core/InteractStatic' {
  export type InteractStatic = any
}

declare namespace Interact {
  type Interactable = any
  interface DragEvent {
    dx: number
    dy: number
    stopPropagation (): void
  }
}

interface Window {
  jimuConfig: any
  isExpressBuilder?: boolean
}

// Legacy global JSX names remain available to editor-only type references.
// TSX rendering uses the automatic Emotion runtime. Its module and JSX
// namespace are already declared locally in exb-editor-shims.d.ts; do not
// restore classic JSX factory pragmas to work around editor resolution.
declare namespace JSX {
  type Element = any
  interface IntrinsicElements { [k: string]: any }
  interface ElementClass { render (): any }
  interface ElementAttributesProperty { props: {} }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { [k: string]: any }
}
