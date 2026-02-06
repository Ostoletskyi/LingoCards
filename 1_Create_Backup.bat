@echo off
setlocal

REM LingoCard-next — Commercial backup creator
REM - runs fix-release.ps1
REM - fix-release.ps1 performs smoke test BEFORE creating the ZIP
REM - ZIP name includes a time-based alpha-hash suffix for uniqueness

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%_utilities\ps\1_Create_Backup.ps1" -Tag "v1.0.7-commercial" -Message "release: commercial stable"

popd >nul

endlocal
