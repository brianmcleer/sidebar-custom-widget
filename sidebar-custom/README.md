# Sidebar Custom (ArcGIS Experience Builder widget)

A customized version of Esri's Sidebar widget for ArcGIS Experience Builder. It keeps everything the stock Sidebar does and adds automatic expansion so a collapsed sidebar opens itself when a table is shown, which keeps the Table widget visible inside the sidebar instead of hidden behind a collapsed panel.

## Features

- Auto-expand on table open. When a collapsed sidebar contains a Table widget and a user runs "Add to table" or "View in table", the sidebar expands automatically so the table is visible.
- Auto-expand for widget controllers. A collapsed sidebar also expands when a widget inside a Widget Controller is opened, so the controller content is not stuck behind a collapsed panel.
- Everything from the stock Sidebar widget: two configurable panels (FIRST and SECOND), fixed layouts, the toggle button with its configurable colors and border, and the toggle and open message actions.

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
3. From the `client` folder, run `npm install`. Experience Builder installs widget dependencies automatically from `package.json`, so there are no per-dependency commands to run. This widget declares no extra dependencies, so this step is just the standard client install.
4. Start or restart the client (`npm start`), then hard-refresh the builder (Ctrl+Shift+R).

The widget then appears in the builder's widget panel as "Sidebar Custom."

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
