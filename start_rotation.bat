@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - 2-Account Cycle Mode
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

set "DURATION=10"
if not "%~1"=="" set "DURATION=%~1"

echo.
echo ========================================================
echo   2 Accounts at a Time (Cycle)
echo   Group A-D (2 accounts each)
echo   Duration per group: %DURATION% minutes
echo   Cycling until you close this window.
echo ========================================================
echo.

echo [%date% %time%] Starting switch controller...
echo.

"%PYTHON_EXE%" -u switch_controller.py --duration %DURATION%

echo.
echo [%date% %time%] Switch controller ended.
echo.
pause
