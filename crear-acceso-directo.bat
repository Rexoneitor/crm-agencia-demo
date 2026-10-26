@echo off
setlocal
cd /d "%~dp0"
title Crear acceso directo del CRM

echo ============================================================
echo    CREAR ACCESO DIRECTO EN EL ESCRITORIO
echo ============================================================
echo.
echo   Crea un icono "CRM DEMO" en el Escritorio para abrir
echo   el programa con doble clic.
echo.

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([IO.Path]::Combine($ws.SpecialFolders('Desktop'),'CRM DEMO.lnk'));" ^
  "$lnk.TargetPath = '%~dp0iniciar-crm.bat';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.IconLocation = '%~dp0assets\crm.ico,0';" ^
  "$lnk.Description = 'Abrir el CRM de la agencia';" ^
  "$lnk.Save();" ^
  "Write-Output 'Acceso directo creado en el Escritorio.'"

echo.
pause
