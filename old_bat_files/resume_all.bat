@echo off
setlocal enabledelayedexpansion
title COMMANDER BRIAN - 4-Account Cycle Mode (Resume)
chcp 65001 >nul
cd /d %~dp0

set "PYTHON_EXE=python"

set "DURATION=10"
if not "%~1"=="" set "DURATION=%~1"

echo.
echo ========================================================
echo   Resume Mode - 4 Accounts at a Time (Cycle)
echo   Group A: ACC01~04  then  Group B: ACC05~08
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
