@echo off
echo ==============================================
echo Fixing Chrome / ChromeDriver Hang Issues
echo ==============================================
echo.
echo 1. Killing all Chrome and ChromeDriver processes...
taskkill /F /IM chrome.exe /T >nul 2>&1
taskkill /F /IM chromedriver.exe /T >nul 2>&1
taskkill /F /IM undetected_chromedriver.exe /T >nul 2>&1

echo 2. Deleting corrupted undetected_chromedriver cache...
rmdir /S /Q "%APPDATA%\undetected_chromedriver" >nul 2>&1

echo 3. Cleaning up local browser profiles (Optional but recommended)...
rmdir /S /Q "%~dp0browser_profiles" >nul 2>&1

echo.
echo ==============================================
echo Done! Please run start_rotation.bat again.
echo ==============================================
pause
