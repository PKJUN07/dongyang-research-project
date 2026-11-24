@echo off
setlocal
title ResearchBoard
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\Start-ResearchBoard.ps1" %*
if not errorlevel 1 exit /b 0
pause
exit /b 1
