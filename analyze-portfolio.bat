@echo off
chcp 65001 >nul
title Stake Dice Portfolio Analyst
cd /d "%~dp0"
python "%~dp0tools\analyst\run_analyst.py"
echo.
pause
