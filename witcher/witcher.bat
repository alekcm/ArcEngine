@echo off
rem ==========================================================================
rem  Witcher: Old World - LAN server. Needs Node.js only (zero dependencies).
rem    witcher.bat          -> port 8095 (or the next free one), opens the browser
rem    witcher.bat 9000     -> port 9000
rem  Friends connect to http://<your LAN IP>:<port> (printed at startup).
rem ==========================================================================
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo   [x] Node.js not found in PATH. Install it from https://nodejs.org/ ^(LTS^).
    pause
    exit /b 1
)
set "PORT=8095"
if not "%~1"=="" set "PORT=%~1"
node server.mjs --port=%PORT% --open
if errorlevel 1 pause
endlocal
