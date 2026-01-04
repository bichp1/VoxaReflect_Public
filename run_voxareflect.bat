@echo off
setlocal enabledelayedexpansion

REM Root folder
set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%Backend"
set "FRONTEND_DIR=%PROJECT_ROOT%Frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "REQUIREMENTS_FILE=%BACKEND_DIR%\requirements.txt"
set "ENV_FILE=%PROJECT_ROOT%.env"

REM Load optional frontend settings from .env
set "VOXAREFLECT_FRONTEND_API_BASE="
set "VOXAREFLECT_FRONTEND_ENTRY_URL="

if exist "%ENV_FILE%" (
    for /f "usebackq delims=" %%L in ("%ENV_FILE%") do (
        set "line=%%L"
        if not "!line!"=="" if not "!line:~0,1!"=="#" (
            for /f "tokens=1,* delims==" %%A in ("!line!") do (
                set "key=%%A"
                set "value=%%B"
                set "key=!key: =!"
                if /I "!key!"=="VOXAREFLECT_FRONTEND_API_BASE" (
                    set "VOXAREFLECT_FRONTEND_API_BASE=!value!"
                ) else if /I "!key!"=="VOXAREFLECT_FRONTEND_ENTRY_URL" (
                    set "VOXAREFLECT_FRONTEND_ENTRY_URL=!value!"
                )
            )
        )
    )
)

REM Normalize optional values (strip surrounding quotes)
if defined VOXAREFLECT_FRONTEND_API_BASE (
    set "VOXAREFLECT_FRONTEND_API_BASE=%VOXAREFLECT_FRONTEND_API_BASE:"=%"
)
if defined VOXAREFLECT_FRONTEND_ENTRY_URL (
    set "VOXAREFLECT_FRONTEND_ENTRY_URL=%VOXAREFLECT_FRONTEND_ENTRY_URL:"=%"
)

if not defined VOXAREFLECT_FRONTEND_ENTRY_URL (
    set "VOXAREFLECT_FRONTEND_ENTRY_URL=http://localhost:3000/?lang=de&mic=1&ava=1&group=1"
)

set "REACT_APP_SERVER_URL=%VOXAREFLECT_FRONTEND_API_BASE%"

REM === Backend Setup ===
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [Backend] Creating virtual environment...
    pushd "%BACKEND_DIR%"
    python -m venv .venv
    if errorlevel 1 (
        echo [Backend] FAILED to create venv. Aborting.
        pause
        exit /b 1
    )
    popd
)

if exist "%REQUIREMENTS_FILE%" (
    echo [Backend] Installing dependencies...
    call "%VENV_DIR%\Scripts\python.exe" -m pip install --quiet --upgrade pip
    call "%VENV_DIR%\Scripts\pip.exe" install --quiet -r "%REQUIREMENTS_FILE%"
) else (
    echo [Backend] WARNING: requirements.txt not found
)

echo [Backend] Starting Flask server...
start "VoxaReflect Backend" cmd /K "cd /d %BACKEND_DIR% && call .venv\Scripts\activate && python app.py"

REM === Frontend Setup ===
REM Kill any existing Node processes to free port 3000
taskkill /F /IM node.exe 2>nul

REM Force clean install if react-scripts is missing
if not exist "%FRONTEND_DIR%\node_modules\react-scripts" (
    echo [Frontend] Installing dependencies...
    pushd "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [Frontend] FAILED to install. Check npm logs.
        pause
        exit /b 1
    )
    popd
)

REM Verify npm is accessible
where npm >nul 2>&1
if errorlevel 1 (
    echo [Frontend] ERROR: npm not found in PATH
    echo Add Node.js to your system PATH or edit this script with the full npm path
    pause
    exit /b 1
)

echo [Frontend] Starting React dev server...
start "VoxaReflect Frontend" cmd /K "cd /d %FRONTEND_DIR% && set REACT_APP_SERVER_URL=%REACT_APP_SERVER_URL% && set BROWSER=none && npm start"

REM Wait a few seconds for server to initialize before opening browser
timeout /t 5 /nobreak >nul
start "" "%VOXAREFLECT_FRONTEND_ENTRY_URL%"

echo.
echo [SUCCESS] VoxaReflect is launching. Check the two command windows for status.
echo Backend: http://localhost:5000 (if Flask default)
echo Frontend: http://localhost:3000
echo.

endlocal
