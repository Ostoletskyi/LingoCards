@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM =====================================================
REM LingoCard Utilities (PS 5.0)
REM Single entry point: this BAT
REM All logic: _utilities\ps\
REM =====================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "MENU_PS=%ROOT%\_utilities\ps\menu.ps1"
if not exist "%MENU_PS%" (
  echo [ERROR] Missing: "%MENU_PS%"
  pause
  exit /b 1
)

:MAIN
cls
echo ==================================================
echo                 LingoCard Utilities
echo Root: %ROOT%
echo ==================================================
echo 1^) Create project FILEMAP (FILEMAP.md)
echo 2^) Check project FILEMAP (FILEMAP.md)
echo 3^) Contracts and integrity test (smoke)
echo 4^) Backups (submenu)
echo 5^) Run local server
echo 6^) Initialize repository (git init)
echo 7^) i18n audit (RU/DE/EN)
echo 0^) Exit
echo --------------------------------------------------
set /p "CH=Select [0-7]: "

if "%CH%"=="0" exit /b 0

if "%CH%"=="1" call :RUN filemap_create & goto MAIN
if "%CH%"=="2" call :RUN filemap_check & goto MAIN
if "%CH%"=="3" call :RUN contracts_test & goto MAIN
if "%CH%"=="4" goto BACKUPS
if "%CH%"=="5" call :RUN server_run & goto MAIN
if "%CH%"=="6" call :RUN repo_init & goto MAIN
if "%CH%"=="7" call :RUN i18n_audit & goto MAIN

echo Invalid option.
pause
goto MAIN

:BACKUPS
cls
echo ==================================================
echo                  BACKUPS / RESTORE
echo Root: %ROOT%
echo ==================================================
echo 1^) Create release backup (ZIP)
echo 2^) Restore from backup (into _utilities\_restore)
echo 0^) Back to main menu
echo --------------------------------------------------
set /p "BH=Select [0-2]: "

if "%BH%"=="0" goto MAIN
if "%BH%"=="1" call :RUN backup_create & goto BACKUPS
if "%BH%"=="2" call :RUN backup_restore & goto BACKUPS

echo Invalid option.
pause
goto BACKUPS

:RUN
set "ACTION=%~1"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%MENU_PS%" -Root "%ROOT%" -Action "%ACTION%"
echo.
pause
exit /b 0
