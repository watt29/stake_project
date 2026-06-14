@echo off
setlocal enabledelayedexpansion
title New Profile
chcp 65001 >nul
cd /d %~dp0

echo.
echo ================================================
echo   New Profile Setup
echo ================================================
echo.
set /p NAME="Profile name (e.g. user2, john): "

if "%NAME%"=="" (
    echo [ERROR] Profile name required.
    pause
    exit /b 1
)

set CFGFILE=config_%NAME%.json

if exist %CFGFILE% (
    echo [ERROR] %CFGFILE% already exists.
    pause
    exit /b 1
)

if not exist config.json (
    echo [ERROR] config.json template not found.
    pause
    exit /b 1
)

copy config.json %CFGFILE% >nul
echo [OK] Created %CFGFILE%
echo.

echo Enter Stake account details:
set /p TOKEN="x-access-token: "
set /p COOKIES="cookie: "
set /p CHAT_ID="Telegram chat_id: "
set /p BASE_BET="base_bet (e.g. 0.5): "
set /p INIT_CAP="initial_capital (TRX): "

python _profile_helper.py "%NAME%" "%TOKEN%" "%COOKIES%" "%CHAT_ID%" "%BASE_BET%" "%INIT_CAP%"

if errorlevel 1 (
    echo [ERROR] Failed to save. Check that base_bet and initial_capital are numbers.
    del %CFGFILE% >nul 2>&1
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Profile "%NAME%" is ready!
echo   Run: python dice_bot.py --config %CFGFILE%
echo   Or:  double-click run_bot.bat and select profile
echo ================================================
echo.
pause
