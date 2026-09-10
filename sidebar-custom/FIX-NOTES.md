# Sidebar Custom: JSX rendering fix

Patch date: September 10, 2026
Target environment: ArcGIS Experience Builder Developer Edition 1.21

## Error addressed

The supplied console log points to Setting.render in layout-setting.tsx, followed
by Emotion's hasOwnProperty call and the message:

    Cannot convert undefined or null to object

The uploaded widget combines classic JSX compilation (`jsx: "react"` and legacy
JSX factory pragmas) with a JSX helper whose automatic-runtime calling convention
expects `(type, props, key)`. Classic calls instead use `(type, props, ...children)`.
That mismatch can pass null props for elements such as `<strong>` and `<br />`.
It can also omit nested content from `props.children`, leaving a layout blank.
The mismatch was reproduced in an isolated test using the supplied source and
an automatic Emotion-compatible calling contract. A live EB installation was not
available to independently inspect the user's loaded Emotion bundle.

## Changes

- Changed this widget's tsconfig.json to `jsx: "react-jsx"` with
  `jsxImportSource: "@emotion/react"`. Kept noEmit and the existing local editor
  declarations, include/exclude patterns, and all other compiler options.
- Removed legacy `/** @jsx jsx */` directives and unused jimu-core jsx imports
  from the affected TSX files. JSX is now handled by the automatic Emotion runtime.
- Corrected an outdated comment in the widget-specific editor shim. Its actual
  declarations are unchanged. The shared exb-editor-shims.d.ts master is untouched.

Updated existing files:

- src/layout/builder/layout-item.tsx
- src/layout/builder/layout.tsx
- src/layout/layout-base.tsx
- src/layout/runtime/layout.tsx
- src/layout/toggle-button.tsx
- src/message-actions/open-sidebar-setting.tsx
- src/runtime/widget.tsx
- src/setting/layout-setting.tsx
- src/setting/setting.tsx
- tsconfig.json
- src/editor-shims.d.ts (comments only)

Added file: FIX-NOTES.md (this document).

The widget name, manifest version, package version, dependency declarations,
config.json, configuration defaults, message actions, layout IDs, and all sidebar
behavior logic are unchanged. No client-level tsconfig edits are required.
No additional npm or pnpm packages are required by this patch.

## Install into the existing widget

1. Stop the Experience Builder client process.
2. Back up the existing sidebar-custom source folder outside every extensions
   widgets directory. Do not keep a second discoverable manifest with the same name.
3. Extract the sidebar-custom folder from this archive into:

       client/your-extensions/widgets/sidebar-custom

   Replace the existing files, including tsconfig.json. manifest.json must remain
   directly inside sidebar-custom, not inside a second nested sidebar-custom folder.
4. Restart the client using your normal start command and wait for the build to finish.
5. Hard-refresh the builder with Ctrl+Shift+R, then select the existing Sidebar 3.
   Test its Content settings and the sidebar in Live view.

Do not delete/re-add the sidebar in the experience, reset its configuration, or
remove its child widgets for this patch. This archive updates source files only.
It contains no .vs database, node_modules, or generated dist files.

## Validation performed

- TypeScript 5.8.3: `tsc -p tsconfig.json --pretty false` passed with the widget's
  local editor shims. This is not a type check against the full Esri SDK.
- Reproduced the reported settings exception with the original classic JSX output
  and an automatic Emotion-compatible JSX contract.
- Reproduced missing nested runtime layout children with the same original setup.
- Patched settings retained text, children, CSS props, and keyed options in 48
  combinations of design/run mode, controller selection, dock side, direction,
  and toggle visibility.
- Patched layout retained both panels and CSS props in 32 combinations of
  direction, collapse side, overlay, visibility, and right-to-left mode.
- Checked runtime and builder wrapper branches, the missing-layout loading
  element, and all-data/custom-data message-action settings.
- All 11 TSX files emit the same behavior logic as the originals when both are
  compiled using the same automatic JSX configuration.

Jimu APIs and React UI elements were mocked for these isolated render-contract
tests. No actual Experience Builder webpack build, browser rendering, Visual
Studio session, map-service request, or interactive expand/collapse test was run.
Verify the installed widget in your builder before publishing.

The log's SSL/service-worker warning and ArcGIS service/data-source errors are
outside the scope of this sidebar rendering patch.

## Technical references

Esri's React 19 migration notes state that the legacy JSX directive is no longer
required for Emotion CSS properties:
https://developers.arcgis.com/experience-builder/guide/1.19/whats-new/

Emotion automatic JSX runtime source:
https://github.com/emotion-js/emotion/blob/main/packages/react/src/jsx-runtime.ts

Emotion classic JSX factory source:
https://github.com/emotion-js/emotion/blob/main/packages/react/src/jsx.ts
