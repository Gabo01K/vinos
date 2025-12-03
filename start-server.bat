@echo off
setlocal
set NODE_DIR=%~dp0server\node-v20.14.0-win-x64\node-v20.14.0-win-x64
set SERVER_DIR=%~dp0server

if not exist "%NODE_DIR%\npm.cmd" (
  echo No se encontro npm en %NODE_DIR%.
  pause
  exit /b 1
)

echo Iniciando servidor Le Rosset...
start "Le Rosset Server" cmd /k "cd /d \"%SERVER_DIR%\" ^& \"%NODE_DIR%\npm.cmd\" start"
timeout /t 3 >nul
start "" http://localhost:3000/index.html
echo Servidor lanzado en una nueva ventana. Puedes cerrar esta ventana si lo deseas.
pause
