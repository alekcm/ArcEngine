@echo off
setlocal
rem Direct-address host mode: friends connect to the host's public IP and TCP port.
rem This is the browser/server equivalent of a listen server, not WebRTC P2P.
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
start "Nemesis direct-IP server" /D "%SERVER_DIR%" cmd /k "node server.mjs --port=%PORT% --strict-port"
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; for($i=0; $i -lt 30; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/client/' -TimeoutSec 1; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
    echo [ERROR] The local game server did not start. Check its window.
    pause
    exit /b 1
)
start "" "http://127.0.0.1:%PORT%/client/"
echo.
echo DIRECT ADDRESS MODE (no Cloudflare tunnel, no WebRTC signaling).
echo Friends open http://YOUR_PUBLIC_IP:%PORT%/client/ in a browser.
echo In your router, forward TCP port %PORT% to this PC's LAN IP, and allow node.exe through Windows Firewall.
echo If your ISP uses CGNAT or your VPN blocks inbound TCP, public-IP hosting will not work; use a mesh VPN or a relay.
echo Keep the server window open. Friends need only a browser, not Node.js or a local game copy.
pause
