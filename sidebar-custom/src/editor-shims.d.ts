// Editor-only compatibility declarations for Experience Builder 1.21 + Visual Studio.
// These declarations do not emit JavaScript and do not change runtime behavior.

declare function require(path: string): any

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
    stopPropagation(): void
  }
}

interface Window {
  jimuConfig: any
  isExpressBuilder?: boolean
}
