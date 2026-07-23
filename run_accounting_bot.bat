@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - Central Accounting Dashboard
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo.
echo ================================================
echo   COMMANDER BRIAN - Central Accounting Dashboard
echo ================================================
echo.

"%PYTHON_EXE%" -u accounting_bot.py
