@echo off
rem Incremental commit helper, callable from the repo root.
rem Delegates to innervoice\commit.bat which does the actual git work.
rem
rem Usage:
rem   commit.bat "fix: short message"
rem   commit.bat "feat: short message" --no-push

call "%~dp0innervoice\commit.bat" %*
exit /b %ERRORLEVEL%
