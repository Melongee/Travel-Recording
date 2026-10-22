@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Build.ps1" %*
if errorlevel 1 (
  echo Failed. See the error above.
  pause
  exit /b 1
)
