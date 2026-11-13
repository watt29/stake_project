@echo off
chcp 65001 >nul
title Stake Dice - Daily Summary & Telegram Notification
powershell -ExecutionPolicy Bypass -File "%~dp0tools\show-summary.ps1" -Telegram
echo.
pause
