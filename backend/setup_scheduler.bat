@echo off
:: SPECTRA — Register nightly ML pipeline as a Windows Task Scheduler job
:: Run this script once as Administrator to set it up.
:: The pipeline will run every day at 02:00 AM.

SET TASK_NAME=SPECTRA_ML_Pipeline
SET PYTHON=C:\Users\Elion\AppData\Local\Microsoft\WindowsApps\python3.13.exe
SET SCRIPT=%~dp0run_pipeline.py
SET LOG=%~dp0pipeline.log

echo Registering scheduled task: %TASK_NAME%

:: Delete existing task if present
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create new task: daily at 02:00, run as current user
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%PYTHON%\" \"%SCRIPT%\"" ^
  /sc daily ^
  /st 02:00 ^
  /ru "%USERNAME%" ^
  /rl highest ^
  /f

IF %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS: Task "%TASK_NAME%" scheduled to run daily at 02:00 AM.
    echo Log file: %LOG%
    echo.
    echo To run immediately:
    echo   schtasks /run /tn "%TASK_NAME%"
    echo.
    echo To check status:
    echo   schtasks /query /tn "%TASK_NAME%" /fo list
) ELSE (
    echo.
    echo ERROR: Failed to create scheduled task. Try running as Administrator.
)
pause
