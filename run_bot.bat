@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - Dice Bot
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=python"
where python >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
        set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
    ) else (
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
echo [*] Python: %PYTHON_EXE%
echo.

:loop
echo [%date% %time%] Starting bot...
"%PYTHON_EXE%" -u dice_bot.py --config "%PROFILE%"
echo.
echo [%date% %time%] Bot stopped. Restarting in 10 seconds... (Ctrl+C to cancel)
timeout /t 10
goto loop
