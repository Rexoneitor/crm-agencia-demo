@echo off
setlocal
title CRM Agencia de Viajes
cd /d "%~dp0"

echo ============================================================
echo    CRM AGENCIA DE VIAJES
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js en este equipo.
  echo.
  echo    1^) Entra a  https://nodejs.org  y descarga la version "LTS".
  echo    2^) Instalala ^(Siguiente, Siguiente, Finalizar^).
  echo    3^) Cierra esta ventana y vuelve a abrir "iniciar-crm".
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Primera vez: instalando. Puede tardar varios minutos...
  echo ^(esto necesita internet SOLO esta primera vez^)
  echo.
  call npm install || goto :error
)
if not exist "data\crm.db" (
  echo Preparando la base de datos...
  call npm run db:deploy || goto :error
  call npm run db:seed
  echo.
)

REM ¿Ya hay un CRM encendido? Entonces solo abrimos la ventana.
REM (se usa 127.0.0.1 y no "localhost" porque PowerShell resuelve localhost como
REM  IPv6 primero y el servidor escucha en IPv4).
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3200')|Out-Null;exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 (
  echo El CRM ya estaba encendido. Abriendo la ventana...
  goto :openapp
)

echo Iniciando el CRM...
start "CRM - servidor (no cerrar)" /min /d "%CD%" cmd /c "npm run dev"

echo Esperando a que arranque (puede tardar la primera vez)...
powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3200')|Out-Null;exit 0}catch{Start-Sleep -Seconds 1}};exit 1"
if errorlevel 1 (
  echo.
  echo [AVISO] Esta tardando mas de lo normal. Abrimos la ventana igualmente;
  echo         si sale en blanco, espera unos segundos y recarga.
)

:openapp
set "APPFLAGS=--app=http://127.0.0.1:3200 --window-size=1360,900 --user-data-dir=%LOCALAPPDATA%\CRM-Agencia-App"
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined BROWSER (
  start "" "%BROWSER%" %APPFLAGS%
) else (
  start "" http://127.0.0.1:3200
)
echo.
echo ============================================================
echo   El CRM esta funcionando en su propia ventana.
echo.
echo   Para APAGARLO: cierra la ventana negra llamada
echo   "CRM - servidor (no cerrar)"  (o usa "apagar-crm").
echo ============================================================
ping -n 6 127.0.0.1 >nul 2>&1
exit /b 0

:error
echo.
echo [ERROR] Algo fallo. Revisa el mensaje de arriba.
pause
exit /b 1
