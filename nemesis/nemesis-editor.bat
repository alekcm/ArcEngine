@echo off
rem ==========================================================================
rem  Nemesis - board editor: client/editor.html
rem  The full test ship in 3D plus sliders for the corridor door (frame, beam,
rem  stencil on it, colours, emergency lamps). "Save" writes
rem  nemesis\client\tuning.json, which the game and the lobby gallery read at
rem  boot.  Launched by "editor.bat nemesis".
rem
rem    nemesis-editor.bat        -> port 8090 (or the next free one)
rem    nemesis-editor.bat 9000   -> port 9000
rem ==========================================================================
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo   [x] Node.js not found in PATH. Install it from https://nodejs.org/.
    pause
    exit /b 1
)
set "PORT=8090"
if not "%~1"=="" set "PORT=%~1"
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/client/editor.html"
node server.mjs --port=%PORT%
if errorlevel 1 pause
endlocal
