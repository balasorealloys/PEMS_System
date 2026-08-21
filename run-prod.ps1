# PEMS — production run helper (single process: API + built SPA on one port).
# Usage:   powershell -ExecutionPolicy Bypass -File .\run-prod.ps1 [-Port <n>] [-Build]
#   -Port    override the port for this run (otherwise APP_PORT in .env is used).
#   -Build   also (re)build the frontend before starting.
# For a real deployment, run this under NSSM as a Windows service (see DEPLOYMENT.md).

param(
  [int]$Port = 0,
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Build) {
  Write-Host "Building frontend..." -ForegroundColor Cyan
  Push-Location "$root\frontend"
  npm ci --legacy-peer-deps
  npm run build
  Pop-Location
}

if (-not (Test-Path "$root\frontend\dist\index.html")) {
  Write-Host "WARNING: frontend\dist not found — the API will run but the UI won't be served. Run with -Build." -ForegroundColor Yellow
}

# prefer the venv python if present, else system python
$py = "$root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

if ($Port -gt 0) { $env:APP_PORT = "$Port" }   # override .env for this run
Write-Host "Starting PEMS (port from .env unless -Port given). Ctrl+C to stop." -ForegroundColor Green
Push-Location "$root\backend"
& $py run.py
Pop-Location
