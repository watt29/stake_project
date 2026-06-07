@echo off
title COMMANDER BRIAN - Setup
echo.
echo ================================================
echo   COMMANDER BRIAN - Bot Setup
echo ================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [!] ไม่พบ Python - กำลังดาวน์โหลด...
    curl -L "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe" -o python_installer.exe
    echo [*] ติดตั้ง Python...
    python_installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    del python_installer.exe
    echo [OK] ติดตั้ง Python เสร็จแล้ว
) else (
    echo [OK] พบ Python แล้ว
)

echo.
echo [*] ติดตั้ง dependencies...
python -m pip install --upgrade pip --quiet
python -m pip install curl_cffi --quiet
echo [OK] ติดตั้ง dependencies เสร็จแล้ว

echo.
echo ================================================
echo   Setup เสร็จแล้ว! พร้อมรันบอท
echo ================================================
echo.
pause
