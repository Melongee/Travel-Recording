@echo off
setlocal EnableExtensions
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto directory_error

where.exe node.exe >nul 2>nul
if errorlevel 1 goto node_error

if not exist "%~dp0dist\index.html" goto build_error

echo.
echo Starting Travel Recording Demo...
echo Keep this window open while using the demo.
echo.
node.exe "%~dp0server.mjs" --open %*
set "DEMO_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%DEMO_EXIT_CODE%"=="0" goto service_stopped
echo The demo could not start. Please read the error above.
goto finish

:service_stopped
echo The demo service has stopped.
goto finish

:node_error
set "DEMO_EXIT_CODE=1"
echo Node.js was not found. Install Node.js and open this file again.
goto finish

:build_error
set "DEMO_EXIT_CODE=1"
echo Missing dist\index.html. Run npm install and npm run build in the demo folder.
goto finish

:directory_error
set "DEMO_EXIT_CODE=1"
echo Unable to open the demo folder.
goto finish_without_popd

:finish
popd
:finish_without_popd
echo.
echo Press any key to close this window.
pause >nul
exit /b %DEMO_EXIT_CODE%
