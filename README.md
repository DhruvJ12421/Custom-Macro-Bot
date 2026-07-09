# Windows Macro Bot

Electron and TypeScript macro editor for foreground Windows applications. It supports graph/list workflow editing, validated JSON persistence, bounded loops, color/OCR detection, mouse and keyboard actions, input recording, cancellation, and an F8 emergency stop.

## Run

```powershell
npm install
npm run dev
```

Use **Refresh** to list windows, select a foreground target, add nodes, and connect them in the graph. Edit node settings in the JSON inspector. Detection/action coordinates are relative to the selected window. Save files use the versioned `*.macro.json` format.

## Safety and limitations

- Keep the target visible and focused. Execution stops when it is minimized, closed, or loses focus.
- Press F8 to stop and release held input.
- The recorder stores key identities and timings, not reconstructed typed text.
- Synthetic input can be rejected by games or elevated applications. This project does not bypass anti-cheat systems.
- Run the bot at the same privilege level as the target application.

## Manual smoke test

Before considering a change ready, run through this app-level check on Windows:

1. Start the app with `npm run dev`.
2. Click **Refresh** and select a visible, foreground test window such as Notepad.
3. Create a simple workflow: Start -> Delay -> Action -> Stop.
4. Pick the action location from the target window and verify the stored point is relative to that window.
5. Run the workflow and confirm the active node/log output advances to completion.
6. Press F8 during a second run and confirm execution stops cleanly.
7. Save the workflow, reopen it, then use **Fit nodes** and **Auto layout** to confirm the graph remains usable.
8. For detection nodes, use the text/color debug buttons on a small target region before relying on a full run.

## Checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```
