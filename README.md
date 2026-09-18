# Sidebar Custom widget

[![License](https://img.shields.io/github/license/brianmcleer/sidebar-custom-widget)](LICENSE) [![Release](https://img.shields.io/github/v/release/brianmcleer/=tag)](https://github.com/brianmcleer/sidebar-custom-widget/releases) [![Issues](https://img.shields.io/github/issues/brianmcleer/sidebar-custom-widget)](https://github.com/brianmcleer/sidebar-custom-widget/issues)

A customized ArcGIS Experience Builder Sidebar widget for the City of Grand Junction, CO. It extends Esri's stock Sidebar widget so a collapsed sidebar expands automatically when a table is opened with "Add to table" or "View in table", and when a widget inside a Widget Controller is opened, keeping that content visible instead of hidden behind a collapsed panel. On top of that it adds a set of opt-in behaviors, each off or set to its original default so existing apps are unchanged until configured.

The downloadable widget lives in the `sidebar-custom` subfolder. Download a release, drop that folder into your Experience Builder install, and run the standard client `npm install`. See the widget's own README for the full feature list, configuration reference, and install steps.

## Features at a glance

- Auto-expand a collapsed sidebar when a table or a controller tool opens (each trigger independently toggleable).
- Optional keyboard shortcut to toggle the sidebar.
- Reduced-motion support (on by default).
- Responsive auto-collapse below a configurable viewport width.
- Auto-resize: widen the sidebar while a tool or table is showing, then restore.
- Peek on hover: hovering the collapsed edge briefly reveals the sidebar.
- Update badge on the toggle when collapsed content changes.
- Optional pin and close header on the hosted panel.
- Published expand/collapse message so other widgets can react via a message action.
- URL deep-linking of the collapsed or expanded state.

## Repository layout

```
sidebar-custom-widget/           <- this repo
â”œâ”€â”€ README.md                    <- this file (GitHub landing page)
â”œâ”€â”€ LICENSE                      <- Apache-2.0
â”œâ”€â”€ NOTICE                       <- attribution for the derivative work
â”œâ”€â”€ .gitignore                   <- ignores node_modules, .vs, dist, OS cruft
â”œâ”€â”€ SECURITY.md                  <- how to report a vulnerability
â”œâ”€â”€ publish.ps1                  <- one-command publish/update automation
â””â”€â”€ sidebar-custom/              <- the widget (drops into your-extensions/widgets)
    â”œâ”€â”€ package.json
    â”œâ”€â”€ package-lock.json        <- generated in the EB environment
    â”œâ”€â”€ manifest.json
    â”œâ”€â”€ README.md                <- features, configuration, install steps
    â”œâ”€â”€ LICENSE
    â”œâ”€â”€ NOTICE
    â””â”€â”€ src/ ...
```

## Install (for users)

See [sidebar-custom/README.md](sidebar-custom/README.md). In short: download the release zip, place the `sidebar-custom` folder so its `manifest.json` sits directly inside `client/your-extensions/widgets/sidebar-custom/`, then run `npm install` in the `client` folder and restart.

### The release zip and the editor shims

The zip is the widget only. The Visual Studio type shims in the repo (`sidebar-custom/src/editor-shims.d.ts`, `sidebar-custom/src/exb-editor-shims.d.ts`) are left out on purpose: their ambient `declare module` blocks are not file-scoped and would rewrite the react, jimu and esri types for every other widget in your `your-extensions` folder.

If you clone the repository instead of using the zip, delete `sidebar-custom/src/editor-shims.d.ts` and the other shim files listed above before building; nothing else depends on them.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.19 or 1.20 (React 19). EB 1.18 and earlier are not supported.

## Configuration

Every added behavior has a control in the "Behavior" section of the widget's settings panel, and every one defaults to the original behavior, so an existing app is unchanged until you opt in. The widget config fields are `autoExpand`, `keyboard`, `responsive`, `respectReducedMotion`, `autoResize`, `peek`, `badge`, `panelHeader`, `publishToggle`, and `deepLink`. See the widget README for the full reference with defaults and notes, including the two implementation choices worth knowing: the published message uses Experience Builder's standard String Selection Change message (custom message types are not supported by the framework), and URL deep-linking uses the browser History API rather than Experience Builder's URL-parameters system.

## Publishing updates (for the maintainer)

The widget is developed in the Experience Builder install, then synced into this repo and pushed with `publish.ps1`. Edit the three variables at the top of the script the first time on a new machine, then:

```
# Code update only
powershell -ExecutionPolicy Bypass -File .\publish.ps1

# Code update plus a new downloadable release
powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.21.0
```

The script mirrors the widget from the EB folder into the `sidebar-custom` subfolder (skipping `node_modules` and `.vs`), commits, pushes, and optionally cuts a versioned GitHub release with a downloadable zip. Keep the `manifest.json` and `package.json` versions in sync, and make tags increase and never repeat.

## Esri Community

Post: <https://community.esri.com/t5/experience-builder-custom-widgets/sidebar-custom-auto-expand-when-using-quot-add-to/ba-p/1681650>

## Credits and license

This widget is a derivative work based on Esri's ArcGIS Experience Builder "Sidebar" widget (by Esri R&D Center Beijing), which Esri publishes under the Apache License, Version 2.0. It has been modified and extended by the City of Grand Junction, CO. The auto-expand behavior was inspired by a solution from Jeffrey Thompson on Esri Community.

Licensed under Apache-2.0. See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for attribution. Original work copyright Esri; modifications copyright City of Grand Junction, CO. This software is free to use, modify, and redistribute under those terms.
