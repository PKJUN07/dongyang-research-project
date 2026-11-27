@echo off
setlocal
title ResearchBoard Capture
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\Capture-Screens.ps1" %*
pause
