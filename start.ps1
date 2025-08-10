$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot

function Start-App {
  param(
    [string]$File,
    [string]$ArgumentList,
    [string]$WorkDir
  )
  return Start-Process -WindowStyle Minimized -FilePath $File -ArgumentList $ArgumentList -WorkingDirectory $WorkDir -PassThru
}

Write-Host "Starting backend on 5174..." -ForegroundColor Cyan
$server = Start-App -File "node" -ArgumentList "server.js" -WorkDir (Join-Path $root "server")

Write-Host "Starting frontend on 5173..." -ForegroundColor Cyan
$client = Start-App -File "npx" -ArgumentList "--yes serve -s . -l 5173" -WorkDir $root

Start-Sleep -Seconds 1
Write-Host "Opening browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "Backend PID: $($server.Id)  Frontend PID: $($client.Id)" -ForegroundColor Yellow
Write-Host "To stop, close the spawned windows or end the processes from Task Manager." -ForegroundColor DarkGray


