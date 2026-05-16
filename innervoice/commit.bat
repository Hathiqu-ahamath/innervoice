@echo off
setlocal

cd /d "%~dp0"

set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" (
  echo Usage: commit.bat "feat: short commit message"
  exit /b 1
)

git add .
if errorlevel 1 exit /b %ERRORLEVEL%

git diff --cached --quiet
if %ERRORLEVEL%==0 (
  echo No changes staged. Skipping commit.
  exit /b 0
)

git commit -m "%COMMIT_MSG%" -m "Co-authored-by: Ahamath Hathiqu <ahamathhathiqu@gmail.com>"
if errorlevel 1 exit /b %ERRORLEVEL%

git push origin main
