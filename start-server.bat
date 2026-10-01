@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "NODE_EXE=D:\SoftwareTools\nvm\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
echo   Building frontend...
"%NODE_EXE%" node_modules\vite\bin\vite.js build --config vite.config.js
if errorlevel 1 (
  echo   Frontend build failed. Run npm install and try again.
  pause
  exit /b 1
)
echo.
echo   Typing game server  ^-^>  http://localhost:3000
echo   Keep this window open while you play. Closing it stops the server.
echo.
"%NODE_EXE%" src\server.js
echo.
echo   Server stopped. Exit code = %ERRORLEVEL%
echo   (See server-events.log for the reason and the last heartbeat time.)
pause
