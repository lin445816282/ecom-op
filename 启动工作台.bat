@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

:: Convert a trailing backslash-safe path for CD using PowerShell
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (($args[0]) -replace '[\\/]+$','')" "%SCRIPT_DIR%"`) do set "SAFE_DIR=%%P"

cd /d "%SAFE_DIR%"
if errorlevel 1 (
  echo [ERROR] Cannot enter script folder.
  pause
  exit /b 1
)

echo ================================================
echo   E-commerce operation workbench
echo   After starting, open: http://127.0.0.1:8765
echo ================================================

python api.py

echo.
echo Server stopped.
pause
