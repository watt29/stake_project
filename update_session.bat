@echo off
setlocal enabledelayedexpansion
title Update Session
chcp 65001 >nul
cd /d %~dp0

echo.
echo ================================================
echo   Update Cookie and Token
echo ================================================
echo.
echo How to get new Cookie and Token:
echo   1. Open stake.games in Chrome
echo   2. Press F12 - Network tab
echo   3. Click on any "graphql" request
echo   4. Copy from Request Headers:
echo      - x-access-token
echo      - cookie
echo.

REM Select which config to update
set COUNT=0
for %%f in (config_*.json) do (
    set /a COUNT+=1
    echo   [!COUNT!] %%f
)
echo   [0] config.json (default)
echo.

if %COUNT%==0 (
    set CFGFILE=config.json
    goto INPUT
)

set /p CHOICE="Select profile to update (Enter = default): "
if "%CHOICE%"=="" (
    set CFGFILE=config.json
    goto INPUT
)

set IDX=0
for %%f in (config_*.json) do (
    set /a IDX+=1
    if "!IDX!"=="%CHOICE%" set CFGFILE=%%f
)
if not defined CFGFILE set CFGFILE=config.json

:INPUT
echo.
echo Updating: %CFGFILE%
echo.
set /p TOKEN="Paste x-access-token: "
echo.

echo Paste cookie value then press Enter:
set /p COOKIES="cookie: "
echo.

python _update_session_helper.py "%CFGFILE%" "%TOKEN%" "%COOKIES%"

if errorlevel 1 (
    echo [ERROR] Update failed.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Done! Restart the bot to use new session.
echo ================================================
echo.
pause
