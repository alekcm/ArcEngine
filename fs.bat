@echo off
rem ==========================================================================
rem  ArcEngine - Forbidden Stars: the LAN server
rem  Starts the game server (tools/fs-server.mjs) on 0.0.0.0 and opens a browser.
rem  The printed address is for the friends in the same network.
rem  Needs Node.js only - the kit itself has zero dependencies.
rem
rem    fs.bat              -> port 8080 (or the next free one), opens a browser
rem    fs.bat 9000         -> port 9000
rem    fs.bat 9000 --no-open -> do not open a browser
rem ==========================================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [x] Node.js not found in PATH.
    echo       Install it from https://nodejs.org/ ^(LTS^) and run this file again.
    echo.
    pause
    exit /b 1
)

set "PORT_ARG="
set "OPEN_ARG="
for %%A in (%*) do (
    echo %%A | findstr /r "^[0-9][0-9]*$" >nul && set "PORT_ARG=--port=%%A"
    if /i "%%A"=="--no-open" set "OPEN_ARG=--no-open"
)

node tools\fs-server.mjs %PORT_ARG% %OPEN_ARG%

if errorlevel 1 (
    echo.
    echo   [x] The server exited with an error - see the message above.
    pause
)
endlocal
