@echo off
setlocal
set "ROOT=%~dp0"
pushd "%ROOT%" >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%_utilities\ps\start_ps_server.ps1"

popd >nul
endlocal
