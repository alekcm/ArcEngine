@echo off
rem ==========================================================================
rem  ArcEngine - editor launch (_utils/editor)
rem  Starts the editor server (location, camera, render settings) and opens a browser.
rem  Needs Node.js only - zero dependencies, same as the kit itself.
rem
rem    editor.bat              -> port 8090 (or the next free one), opens browser
rem    editor.bat 9100         -> custom port
rem    editor.bat 9100 --no-open  -> do not open a browser
rem    editor.bat nemesis      -> the Nemesis board editor (doors, beam, numbers,
rem                               colours, lamps): nemesis\nemesis-editor.bat
rem    editor.bat nemesis 9100 -> the same on a custom port
rem ==========================================================================
setlocal
cd /d "%~dp0"

if /i "%~1"=="nemesis" (
    call "%~dp0nemesis\nemesis-editor.bat" %2
    exit /b %ERRORLEVEL%
)

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

node _utils\editor\server.mjs %PORT_ARG% %OPEN_ARG%

if errorlevel 1 (
    echo.
    echo   [x] The server exited with an error - see the message above.
    pause
)
endlocal
