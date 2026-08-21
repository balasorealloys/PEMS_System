# PEMS — update the running deployment to the latest release.
#   Run this on the server, in the PEMS folder:
#       powershell -ExecutionPolicy Bypass -File .\update.ps1
#
# It pulls the latest code, refreshes Python deps, and restarts the service.
# The built UI (frontend\dist) ships in the repo, so there is NO npm / build step.
# DB migrations are applied separately, only when new ones appear (see note at end).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> Pulling latest code..." -ForegroundColor Cyan
git pull --ff-only

# prefer the venv python if present, else system python
$py = "$root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

Write-Host "==> Updating Python dependencies..." -ForegroundColor Cyan
& $py -m pip install -q -r "$root\backend\requirements.txt"

if (-not (Test-Path "$root\frontend\dist\index.html")) {
  Write-Host "WARNING: frontend\dist missing — UI won't be served. (It should be in the repo.)" -ForegroundColor Yellow
}

# Restart: if PEMS is installed as a Windows service, restart it; otherwise tell the user.
$svc = Get-Service -Name PEMS -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "==> Restarting PEMS service..." -ForegroundColor Cyan
  Restart-Service PEMS
  Start-Sleep -Seconds 3
  (Get-Service PEMS).Status | ForEach-Object { Write-Host "PEMS service is now: $_" -ForegroundColor Green }
} else {
  Write-Host "==> No 'PEMS' Windows service found." -ForegroundColor Yellow
  Write-Host "    Stop the current run.py window (Ctrl+C) and start it again:" -ForegroundColor Yellow
  Write-Host "        powershell -ExecutionPolicy Bypass -File .\run-prod.ps1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Open http://<server-ip>:<APP_PORT> and hard-refresh (Ctrl+F5)." -ForegroundColor Green
Write-Host "Note: if db\migrations has a NEW .sql since your last deploy, apply it once:" -ForegroundColor DarkGray
Write-Host "    cd backend; python scripts\run_sql.py ..\db\migrations\<file>.sql" -ForegroundColor DarkGray
