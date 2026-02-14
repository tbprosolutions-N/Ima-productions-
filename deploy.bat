@echo off
set "PROJECT_ROOT=%~dp0"
if not exist "%PROJECT_ROOT%package.json" set "PROJECT_ROOT=C:\Users\tbsol\Downloads\OS\"
cd /d "%PROJECT_ROOT%"
if not exist package.json (
  echo.
  echo  ERROR: package.json not found in project folder.
  echo  Put deploy.bat in:  C:\Users\tbsol\Downloads\OS
  echo  Or run in cmd:  cd /d "C:\Users\tbsol\Downloads\OS"   then   deploy.bat
  echo.
  pause
  exit /b 1
)
echo Deploying from: %CD%
echo.
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
call npx --yes netlify deploy --prod --dir=dist
pause
