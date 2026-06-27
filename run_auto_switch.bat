@echo off
setlocal enabledelayedexpansion
title Auto-Switching Dice Bot
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

set /p DURATION="Enter duration to run each account (in minutes, default 10): "
if "%DURATION%"=="" set DURATION=10

echo.
echo ========================================================
echo   Auto-Switching Mode Started (Duration: %DURATION% minutes)
echo ========================================================
echo.

:loop
echo [%date% %time%] Starting Account 1 (config.json)...
"%PYTHON_EXE%" -u dice_bot_utf8.py --config config.json --duration %DURATION%

echo.
echo [%date% %time%] Switching to Account 2 in 10 seconds...
timeout /t 10

echo [%date% %time%] Starting Account 2 (config_account3.json)...
"%PYTHON_EXE%" -u dice_bot_utf8.py --config config_account3.json --duration %DURATION%

echo.
echo [%date% %time%] Switching to Account 3 in 10 seconds...
timeout /t 10

echo [%date% %time%] Starting Account 3 (config_account4.json)...
"%PYTHON_EXE%" -u dice_bot_utf8.py --config config_account4.json --duration %DURATION%

echo.
echo [%date% %time%] Cycle complete. Restarting from Account 1 in 10 seconds... (Ctrl+C to stop)
timeout /t 10
goto loop
