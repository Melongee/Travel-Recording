param([string]$DataDir = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$DataDir) { $DataDir = Join-Path $projectRoot 'data' }
$pidFile = Join-Path $DataDir 'app.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'No background process recorded. For Start.cmd, press Ctrl+C in its window.'; exit 0 }
$appProcessId = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$appProcessId"
$jar = Join-Path $projectRoot 'backend\target\travel-recording-0.1.0.jar'
if ($process -and ($process.Name -ne 'java.exe' -or !$process.CommandLine.Contains($jar))) { throw 'PID belongs to a different process; not stopping it.' }
if ($process) { Stop-Process -Id $appProcessId; Write-Host "Stopped $appProcessId" }
Remove-Item -LiteralPath $pidFile
