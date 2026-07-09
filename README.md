# Windows Macro Bot

Windows Macro Bot is a desktop app for building and running repeatable macros against a visible
Windows application. You choose a target window, create a workflow, and let the bot perform clicks,
key presses, delays, color checks, and OCR-based text checks in order.

## Download

Download the latest installer from the GitHub Releases page and run the file named like:

`Windows Macro Bot-Setup-0.1.2.exe`

- You do not need Node.js or npm to use the installed app.
- The installer includes the app runtime and dependencies.
- The installer is currently unsigned, so Windows may show a SmartScreen warning before launch.

## What You Can Do

- Build macros visually with connected workflow nodes.
- Target a specific foreground window instead of your full desktop by default.
- Record input steps and reuse them in a workflow.
- Add waits, loops, mouse actions, keyboard actions, color detection, and OCR text detection.
- Stop a running macro at any time with `F8`.

## Basic Use

1. Open the app.
2. Click **Refresh** and select the window you want to automate.
3. Create or load a workflow.
4. Configure each node.
5. Run the workflow and watch the log/output panel for progress.
6. Press `F8` if you need to stop the macro immediately.

Saved workflows use the `*.macro.json` format.

## Important Behavior

- The target window must stay visible and focused while the macro runs.
- If the window is minimized, closed, or loses focus, execution stops.
- Coordinates for target-window actions are stored relative to that selected window.
- Installed builds save workflow files under the app's user-data area, not inside the install
  directory.

## Safety And Limits

- Test on something harmless first, such as Notepad.
- Run the bot at the same privilege level as the target app.
- Some games, anti-cheat systems, or elevated apps may block synthetic input.
- OCR and color detection depend on what is actually visible on screen.
- Input recording stores key identities and timings, not reconstructed typed sentences.

## Source Build

If you want to run or modify the project from source:

```powershell
npm install
npm run dev
```

To build a local Windows installer from source:

```powershell
npm run dist
```

That writes the installer into `release/`.

`Run Windows Macro Bot.cmd` is only for source-checkout/bootstrap use. It is not the normal end-user
installer.
