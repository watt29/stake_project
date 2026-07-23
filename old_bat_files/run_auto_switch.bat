@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - Central Dashboard Launcher
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=python"

set "DURATION=10"
if not "%~1"=="" set "DURATION=%~1"

echo.
echo ========================================================
echo   One-Button Launch Mode
echo   8 accounts will run in the background.
echo   This window will show the central dashboard.
echo   Duration per account: %DURATION% minutes
echo ========================================================
echo.

echo [%date% %time%] Resetting all history before launch...
"%PYTHON_EXE%" -u reset_history.py
if errorlevel 1 (
    echo [ERROR] Reset failed. Aborting launch.
    exit /b 1
)

echo [%date% %time%] Launching 8 accounts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account2.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account3.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account4.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account5.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account6.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account7.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%PYTHON_EXE%' -ArgumentList @('-u','dice_bot_utf8.py','--config','config_account8.json','--duration','%DURATION%') -WorkingDirectory '%CD%'"

echo.
echo [%date% %time%] All 8 accounts launched in the background.
echo [%date% %time%] Central dashboard will stay visible in this window.
echo.

"%PYTHON_EXE%" -u accounting_bot.py --watch --interval 5

echo.
echo [%date% %time%] Dashboard closed. Stopping background processes and clearing history...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'stake_project_3' -and ($_.CommandLine -match 'dice_bot_utf8.py|accounting_bot.py|hermes_brain.py') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
"%PYTHON_EXE%" -u reset_history.py
