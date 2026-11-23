@echo off
rem ==========================================================================
rem  Nemesis - LAN server. Needs Node.js only (zero dependencies).
rem    nemesis.bat          -> port 8090 (or the next free one)
rem    nemesis.bat 9000     -> port 9000
rem  Friends connect to http://<your LAN IP>:<port> (printed at startup).
rem  This server is the ONLY entrance to the game: the kit's dev server
rem  (run.bat), the editor (editor.bat) and a file opened from disk show a
rem  note instead of the table - they have no /ws.
rem ==========================================================================
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo   [x] Node.js not found in PATH. Install it from https://nodejs.org/ ^(LTS^).
    pause
    exit /b 1
)
set "PORT=8090"
if not "%~1"=="" set "PORT=%~1"
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node server.mjs --port=%PORT%
if errorlevel 1 pause
endlocal
