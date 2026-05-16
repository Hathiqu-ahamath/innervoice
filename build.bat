@echo off
rem Build the Vite app from the repo root.
rem Delegates into innervoice/ where package.json lives.
cd /d "%~dp0innervoice"
if errorlevel 1 (
  echo [build] Cannot find innervoice\ subfolder.
  exit /b 1
)
npm run build %*
