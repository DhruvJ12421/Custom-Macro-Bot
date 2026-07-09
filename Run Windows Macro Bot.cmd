@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run Windows Macro Bot from this bootstrap package.
  echo Install the current LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on PATH.
  echo Reinstall Node.js with npm enabled, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies. This can take several minutes on the first run.
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm run start
if errorlevel 1 (
  echo Windows Macro Bot exited with an error.
  pause
  exit /b 1
)
