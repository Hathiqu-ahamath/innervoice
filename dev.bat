@echo off
rem Run the Vite dev server from the repo root.
rem Delegates into innervoice/ where package.json lives.
cd /d "%~dp0innervoice"
if errorlevel 1 (
  echo [dev] Cannot find innervoice\ subfolder.
  exit /b 1
)
npm run dev %*
