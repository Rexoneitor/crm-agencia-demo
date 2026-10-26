@echo off
setlocal
title Apagar CRM
cd /d "%~dp0"
echo.
echo   Lo normal es APAGAR el programa cerrando la ventana negra llamada
echo   "CRM - servidor (no cerrar)".
echo.
echo   Usa este boton solo si esa ventana se colgo o se cerro sola.
echo   Solo apaga el CRM: otros proyectos (por ejemplo la plataforma fitness)
echo   siguen encendidos.
echo.
choice /c SN /m "Forzar el apagado del servidor del CRM (S/N)"
if errorlevel 2 exit /b 0

powershell -NoProfile -Command "$dir=(Get-Location).Path; Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like ('*'+$dir+'*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo.
echo   Servidor del CRM detenido.
timeout /t 3 /nobreak >nul
