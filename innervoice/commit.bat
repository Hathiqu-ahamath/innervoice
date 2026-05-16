@echo off
:: 1. Capture the commit message
set COMMIT_MSG=%~1

:: 2. Stage all changed files
git add .

:: 3. Commit with the message AND the Co-authored-by tag
git commit -m "%COMMIT_MSG%" -m "Co-authored-by: Ahamath Hathiqu <ahamathhathiqu@gmail.com>"

:: 4. Push to GitHub
git push origin main