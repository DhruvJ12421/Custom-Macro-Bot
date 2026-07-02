# AGENTS.md

## Overview

Windows Macro Bot is a Windows-only Electron and TypeScript workflow editor for foreground application automation. Workflows are directed graphs persisted as versioned `*.macro.json` files. The app currently runs from the terminal; packaging is intentionally deferred.

## Architecture

- `src/shared/workflow.ts`: Zod workflow schema, defaults, and shared types.
- `src/main/engine.ts`: Workflow traversal, route resolution, cancellation, logging, and held-input cleanup.
- `src/main/capabilities/`: Windows discovery, screen/OCR detection, and synthetic input adapters.
- `src/main/index.ts`: Electron lifecycle, validated IPC, emergency hotkey, and workflow dialogs.
- `src/preload/index.ts`: Context-isolated `window.macroApi` bridge. Renderer code must not access Node directly.
- `src/renderer/App.tsx`: React Flow graph, synchronized step list, inspector, recording, and execution controls.
- `workflows/`: User-created workflow definitions. Open and Save must default here.

Coordinates and detection regions are relative to the selected target window, not the desktop. The target must remain visible, foreground, and unminimized. F8 is the default emergency stop.

## Workflow Routing

- Start, action, and delay nodes use `next`.
- Text/color detection nodes use `found` and `notFound`.
- Branch nodes use `true` and `false`.
- Loop nodes use `repeat` and `done` and must remain bounded.
- Stop nodes have no outgoing route.

The schema validates node IDs, exactly one start node, edge references, field bounds, and workflow version 1. Route completeness is currently checked by the engine when it reaches a node; missing routes fail with `No '<outcome>' route`. Do not add implicit route guessing. If completeness moves into schema validation, update tests and this document together.

## Renderer Constraints

- The workflow model is canonical for both the graph and step list.
- React Flow nodes must retain nonzero `initialWidth` and `initialHeight`; otherwise React Flow leaves them at `visibility: hidden`.
- Persist graph positions in workflow JSON, but do not persist renderer-only measurements.
- `Fit nodes` and `Auto layout` must work after loading or adding nodes.
- Keep `base: './'` in `vite.config.ts` so production assets load through Electron's `file://` URL.
- Opening the Vite URL in Chrome is unsupported because `window.macroApi` exists only through Electron preload.

## Persistence

- Open and Save default to `<project>/workflows`; create the directory if missing.
- Parse imported and saved data with `workflowSchema` at IPC boundaries.
- Do not mechanically rewrite user workflows unless requested. `workflows/` is excluded from Prettier.
- Explicit text actions may store user text. Recording must not reconstruct typed text automatically.

## Current AFS Workflow

`workflows/AFS Quest Compass.macro.json` is calibrated for a 1920x1080 Roblox window. It:

1. Polls the Chakra quest row for `100%` every 10 seconds.
2. Checks Durability and then Strength when Chakra is complete.
3. Clicks the compass at window-relative `(59, 739)` for the first incomplete follow-up stat.
4. Stops after opening the compass because destination-menu coordinates have not been captured.

Recalibrate OCR regions and clicks after any Roblox resolution, UI scale, or window-chrome change. A screenshot of the opened compass menu is required before automating destination selection.

Do not implement anti-cheat bypasses. Games may reject synthetic input or penalize macro use.

## Development

```powershell
npm install
npm run dev
```

The Electron entry point is `dist/main/main/index.js`. Development startup must wait for that file and port 5173 before launching Electron.

## Verification

Run after implementation changes:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Report every command's exact status. The production audit currently includes moderate transitive advisories through `@nut-tree-fork/nut-js`/Jimp with no upstream fix.

If PowerShell blocks `npm.ps1`, use `npm.cmd` or invoke npm's CLI with the installed Node executable. Do not change the system execution policy for this project.
