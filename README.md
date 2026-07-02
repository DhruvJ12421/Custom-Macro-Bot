# Windows Macro Bot

Electron and TypeScript macro editor for foreground Windows applications. It supports graph/list workflow editing, validated JSON persistence, bounded branching and loops, color/OCR detection, mouse and keyboard actions, input recording, cancellation, and an F8 emergency stop.

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

## Checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```
