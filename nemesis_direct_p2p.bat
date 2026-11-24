@echo off
setlocal
rem Start a local copy of the Nemesis client and choose manual direct-WebRTC role.
rem Both people need the same game files and Node.js; no tunnel or relay is started.
choice /c HG /n /m "Choose role: H = host (game owner), G = guest (friend): "
if errorlevel 2 (set "ROLE=guest") else (set "ROLE=host")
set "PORT=18090"
set "SERVER_DIR=%~dp0nemesis"
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js LTS first.
    pause
    exit /b 1
)
powershell -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1', %PORT%); exit 1 } catch { exit 0 } finally { $c.Dispose() }"
if errorlevel 1 (
    echo [ERROR] Port %PORT% is already in use. Close the other app using it and retry.
    pause
    exit /b 1
)
start "Nemesis local client server" /D "%SERVER_DIR%" cmd /k "node server.mjs --port=%PORT% --strict-port"
echo Starting local game client in %ROLE% mode...
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0; $i -lt 30; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/client/' -TimeoutSec 1; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
    echo [ERROR] The local game server did not start. Check its window.
    pause
    exit /b 1
)
start "" "http://127.0.0.1:%PORT%/client/?p2p=%ROLE%"
echo.
echo This is direct P2P: no tunnel/relay. Follow the in-lobby copy/paste offer and answer.
echo Keep the local server window open. Both players should connect before starting the game.
echo The guest must have a local copy of the Nemesis game files and Node.js.
pause
