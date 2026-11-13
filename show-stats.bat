@echo off
chcp 65001 >nul
title Stake Dice Bot Stats
python "%~dp0tools\show_stats.py"
echo.
pause
