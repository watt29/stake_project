@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - Dice Bot
chcp 65001 >nul
cd /d %~dp0

echo.
echo ================================================
echo   COMMANDER BRIAN - Select Profile
echo ================================================
echo.

set COUNT=0
for %%f in (config_*.json) do (
    set /a COUNT+=1
    echo   [!COUNT!] %%f
)

echo   [0] config.json (default)
echo.

if %COUNT%==0 (
    echo No additional profiles found. Using config.json
    set PROFILE=config.json
    goto START
)

set /p CHOICE="Select profile (Enter = default): "

if "%CHOICE%"=="" (
    set PROFILE=config.json
    goto START
)

set IDX=0
for %%f in (config_*.json) do (
    set /a IDX+=1
    if "!IDX!"=="%CHOICE%" set PROFILE=%%f
)

:START
echo.
echo [*] Running with: %PROFILE%
echo.

:loop
echo [%date% %time%] Starting bot...
python -u dice_bot.py --config %PROFILE%
echo.
echo [%date% %time%] Bot stopped. Restarting in 10 seconds... (Ctrl+C to cancel)
timeout /t 10
goto loop
