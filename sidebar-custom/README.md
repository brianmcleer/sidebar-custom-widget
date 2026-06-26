# Sidebar Custom (ArcGIS Experience Builder widget)

A customized version of Esri's Sidebar widget for ArcGIS Experience Builder. It keeps everything the stock Sidebar does and adds automatic expansion so a collapsed sidebar opens itself when a table or a controller tool is shown, which keeps that content visible inside the sidebar instead of hidden behind a collapsed panel.

## Features

- Auto-expand on table open. When a collapsed sidebar contains a Table widget and a user runs "Add to table" or "View in table", the sidebar expands automatically so the table is visible.
- Auto-expand for widget controllers. A collapsed sidebar also expands when a widget inside a Widget Controller is opened, so the controller content is not stuck behind a collapsed panel.
- Everything from the stock Sidebar widget: two configurable panels (FIRST and SECOND), fixed layouts, the toggle button with its configurable colors and border, and the toggle and open message actions.

Options added by the City of Grand Junction build, each with a safe default so existing apps behave exactly as before:

- Configurable auto-expand triggers. Turn the table trigger and the widget-controller trigger on or off independently. Both default to on.
- Optional keyboard shortcut. Bind a key combination (for example Ctrl+B) to toggle the sidebar at runtime. Off by default. The shortcut is ignored while typing in an input and is inactive inside the builder.
- Reduced-motion support. When the operating system requests reduced motion, the slide animation is skipped and the sidebar snaps open. On by default.
- Responsive auto-collapse. Below a configurable viewport width the sidebar collapses itself, then restores when the screen grows back. It only restores a collapse that it caused, so it never overrides a collapse the user chose. Off by default.
- Auto-resize for tools and tables. While a tool or table panel is showing, the sidebar widens to a configured size, then restores when it closes. Honors a manual resize. Off by default.
- Peek on hover. Hovering the collapsed edge briefly reveals the sidebar, which re-collapses when the pointer leaves. Off by default.
- Update badge. A dot appears on the toggle button when the collapsed content changes while the sidebar is collapsed, and clears when it is expanded. Off by default.
- Pin and close panel header. An optional header bar on the hosted panel with a pin control (which suppresses auto-collapse until unpinned) and a close control. Off by default.
- Published expand/collapse message. Publishes an Experience Builder String Selection Change message ("expanded" or "collapsed") on toggle, so other widgets can react through a standard message action. Off by default.
- URL deep-linking. Reflects the collapsed or expanded state in the app URL and restores it on load, using a widget-scoped parameter. Off by default.

The auto-expand behavior was inspired by a solution from Jeffrey Thompson ("The Automatically Opening Attribute Table") on Esri Community.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.19 or 1.20 (built and tested on these; they run React 19).
- Experience Builder 1.18 and earlier run React 18 and are not supported.

## Install

1. Download the release zip and extract it.
2. Copy the `sidebar-custom` folder into your Experience Builder client extensions folder so that `manifest.json` sits directly inside:

   ```
   client/your-extensions/widgets/sidebar-custom/manifest.json
   ```

   Do not nest it a second level deep (for example `widgets/sidebar-custom/sidebar-custom/`). A second-level nest is the usual reason a widget does not register.
3. From the `client` folder, run `npm install`. Experience Builder installs widget dependencies automatically from `package.json`. This widget declares no extra dependencies, so this step is just the standard client install.
4. Start or restart the client (`npm start`), then hard-refresh the builder (Ctrl+Shift+R).

The widget then appears in the builder's widget panel as "Sidebar Custom."

## Configuration

All added options live on the widget config and each has a setting in the "Behavior" section of the widget's settings panel, so you do not need to edit config by hand. Defaults preserve the original behavior, so upgrading an existing app changes nothing until you opt in. Saved apps that predate a field are upgraded in place the moment you change the matching setting.

```jsonc
{
  "autoExpand":  { "onTable": true, "onController": true },
  "keyboard":    { "enabled": false, "key": "b", "ctrl": true, "alt": false, "shift": false },
  "responsive":  { "enabled": false, "breakpoint": 768 },
  "respectReducedMotion": true,
  "autoResize":  { "enabled": false, "expandedSize": "600px" },
  "peek":        { "enabled": false, "delay": 250 },
  "badge":       { "enabled": false },
  "panelHeader": { "enabled": false },
  "publishToggle": { "enabled": false },
  "deepLink":    { "enabled": false }
}
```

- `autoExpand.onTable` and `autoExpand.onController`: which events may auto-expand a collapsed sidebar.
- `keyboard`: when enabled, the listed key combination toggles the sidebar. `key` is a single key. `ctrl` matches Ctrl on Windows and Cmd on macOS. The shortcut is ignored while typing in an input and is inactive inside the builder.
- `responsive.breakpoint`: viewport width in pixels below which the sidebar auto-collapses. It restores only a collapse it caused.
- `respectReducedMotion`: skip the slide animation when the OS requests reduced motion.
- `autoResize`: when enabled, the sidebar widens to `expandedSize` while a tool or table panel is showing, then restores. Skipped if the user has manually dragged the sidebar to a custom width. `expandedSize` accepts the same units as the main size field (for example `600px` or `60%`).
- `peek`: when enabled, hovering the collapsed edge for `delay` milliseconds reveals the sidebar; it re-collapses when the pointer leaves, unless it was pinned. Inactive inside the builder.
- `badge`: when enabled, a dot is shown on the toggle button if the collapsed content changes while the sidebar is collapsed; it clears on expand.
- `panelHeader`: when enabled, the hosted panel gets a small header bar with Pin and Close. Pinning suppresses the responsive and on-close auto-collapse until unpinned.
- `publishToggle`: when enabled, the widget publishes a String Selection Change message of `"expanded"` or `"collapsed"` on each toggle. Other widgets subscribe through a standard message action. This requires `"STRING_SELECTION_CHANGE"` in the manifest `publishMessages`, which ships with the widget.
- `deepLink`: when enabled, the collapsed or expanded state is written to a widget-scoped URL parameter (`sb_<widgetId>`) and restored on load. It uses the browser History API rather than Experience Builder's URL-parameters system, so it does not appear in the builder's URL-parameters configuration UI. On small screens the responsive setting may take precedence after load.

## Troubleshooting: `sidebar-custom is duplicated`

This means the widget name is registered more than once, so a second copy is present somewhere in the install. Replacing just one folder does not fix it. Check, in order:

1. A nested folder: `widgets/sidebar-custom/sidebar-custom/`. The manifest must sit directly inside the widget folder, not a second level deep.
2. A leftover folder from an earlier build or version, including any `-copy` folder or a folder under a previous name.
3. A stale compiled build in `client/dist/widgets`. Stop the client, delete the matching folder under `dist/widgets` (or run a clean build), then start again. This is common after moving a widget between EB versions, because the build can see both the new source and the old compiled output.

If removing one copy makes the widget disappear from the Entrypoint list entirely, the copy that remains is nested too deep. Move it so the manifest is directly inside the widget folder.

## Feedback

Questions and issues are welcome on the Esri Community Experience Builder Custom Widgets board (https://community.esri.com/t5/experience-builder-custom-widgets/sidebar-custom-auto-expand-when-using-quot-add-to/ba-p/1681650), or as a GitHub issue on this repository.

## Credits and license

This widget is a derivative work based on Esri's ArcGIS Experience Builder "Sidebar" widget (by Esri R&D Center Beijing), which Esri publishes under the Apache License, Version 2.0. It has been modified and extended by the City of Grand Junction, CO.

Licensed under Apache-2.0. See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for attribution. Original work copyright Esri; modifications copyright City of Grand Junction, CO. This software is free to use, modify, and redistribute under those terms.
