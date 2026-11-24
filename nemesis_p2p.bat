@echo off
setlocal
rem Secure outbound tunnel for friends who cannot reach the host over LAN.
rem Requires Node.js. Downloads Cloudflare Tunnel once to the user's LocalAppData.
set "PORT=18090"
set "SERVER_DIR=%~dp0nemesis"
set "CF_DIR=%LOCALAPPDATA%\Nemesis"
set "CLOUDFLARED=%CF_DIR%\cloudflared.exe"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js LTS first.
    pause
    exit /b 1
)

if not exist "%CLOUDFLARED%" (
    echo Downloading Cloudflare Tunnel client from its official GitHub release...
    if not exist "%CF_DIR%" mkdir "%CF_DIR%"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CLOUDFLARED%'"
    if errorlevel 1 (
        echo [ERROR] Download failed. Check that GitHub is reachable, then run this file again.
        pause
        exit /b 1
    )
)

rem Use a fixed port so the tunnel always forwards to the correct server instance.
powershell -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1', %PORT%); exit 1 } catch { exit 0 } finally { $c.Dispose() }"
if errorlevel 1 (
    echo [ERROR] Port %PORT% is already in use. Close the other app using it and retry.
    pause
    exit /b 1
)

start "Nemesis host server" /D "%SERVER_DIR%" cmd /k "node server.mjs --port=%PORT% --strict-port"
echo Waiting for the local Nemesis server...
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0; $i -lt 30; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/client/' -TimeoutSec 1; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
    echo [ERROR] The game server did not start. Check the Nemesis host server window.
    pause
    exit /b 1
)

start "" "http://127.0.0.1:%PORT%/client/?p2p=host"
echo.
echo Starting the temporary internet tunnel.
echo Wait for a URL ending in .trycloudflare.com and send that URL to your friend.
echo They can open it from their VPN; the game server stays on this computer.
echo Keep this window open for the whole game. Closing it ends the tunnel.
echo IMPORTANT: Anyone who has the link can try to join. Share it only with trusted people.
echo.
node "%~dp0nemesis\tunnel-launcher.mjs" "%CLOUDFLARED%" "%PORT%"
echo.
echo The tunnel has stopped. The local Nemesis server is still running in its own window.
pause
