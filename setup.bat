@echo off
title COMMANDER BRIAN - Setup
chcp 65001 >nul
echo.
echo ================================================
echo   COMMANDER BRIAN - Bot Setup
echo ================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [!] Not found Python - Downloading...
    curl -L "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe" -o python_installer.exe
    echo [*] Installing Python...
    python_installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    del python_installer.exe
    echo [OK] Python installed.
) else (
    echo [OK] Python found.
)

echo.
echo [*] Installing dependencies...
python -m pip install --upgrade pip --quiet
python -m pip install curl_cffi --quiet
echo [OK] Dependencies installed.

echo.
echo ================================================
echo   Setup Done! Ready to run bot.
echo ================================================
echo.
pause
