@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%_utilities\ps\2_Restore_Backup.ps1"
set "ERR=%ERRORLEVEL%"

popd >nul

if not "%ERR%"=="0" (
  echo.
  echo ERROR: Restore failed with exit code %ERR%.
  echo Press any key . . .
  pause >nul
  exit /b %ERR%
)

echo.
echo Press any key . . .
pause >nul
exit /b 0
