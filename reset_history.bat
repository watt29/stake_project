@echo off
setlocal
title Reset Bot History
chcp 65001 >nul
cd /d "%~dp0"

set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python312\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

echo.
echo This will stop the bot and delete all bot history for every account.
echo.
"%PYTHON_EXE%" -u reset_history.py

echo.
if errorlevel 1 (
    echo Reset failed.
) else (
    echo Reset completed.
)
pause
