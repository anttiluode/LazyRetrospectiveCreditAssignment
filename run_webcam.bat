@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is needed. It was already used for your delayed_cue tests.
  pause
  exit /b 1
)
node webcam_server.cjs
if errorlevel 1 pause
