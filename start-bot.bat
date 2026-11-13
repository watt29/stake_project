@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Bot Orchestrator Controller

if exist "%~dp0tools\STOP_FLEET.txt" del /f /q "%~dp0tools\STOP_FLEET.txt" >nul 2>&1
if exist "%~dp0STOP_FLEET.txt" del /f /q "%~dp0STOP_FLEET.txt" >nul 2>&1

echo ============================================================
echo   Stake Dice Bot - Single Account Mode (watt29)
echo   Profile: watt29 (Profile 4)
echo   Mode: 20 Mins -> Instant Profit Lock (P/L >= 0) -> Rest 3 Mins
echo ============================================================
echo.

:run_loop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\rotate-accounts.ps1"

echo.
echo ============================================================
echo   [!] Bot stopped (Exit Code: %ERRORLEVEL%)
echo   Press any key to restart...
echo ============================================================
pause
goto run_loop
