@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - Dice Bot
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
    where python >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python not found. Run setup.bat first.
        pause
        exit /b 1
    )
)

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
set "CHOICE=!CHOICE: =!"

if "!CHOICE!"=="" (
    set PROFILE=config.json
    goto START
)

if "!CHOICE!"=="0" (
    set PROFILE=config.json
    goto START
)

set IDX=0
for %%f in (config_*.json) do (
    set /a IDX+=1
    if "!IDX!"=="!CHOICE!" set PROFILE=%%f
)

if not defined PROFILE (
    echo [WARN] Invalid selection. Using config.json
    set PROFILE=config.json
)

:START
echo.
echo [*] Running with: %PROFILE%
echo [*] Python: %PYTHON_EXE%
echo.

if "%BOT_CHECK%"=="1" (
    "%PYTHON_EXE%" -u dice_bot_utf8.py --config "%PROFILE%" --check
    exit /b %errorlevel%
)

echo [%date% %time%] Starting bot...
"%PYTHON_EXE%" -u dice_bot_utf8.py --config "%PROFILE%"
echo.
echo [%date% %time%] Bot stopped. Auto-restart is disabled.
echo Exit code: %errorlevel%
pause
