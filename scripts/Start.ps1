param([int]$Port = 8080, [string]$DataDir = '', [switch]$Background)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Toolchain.ps1')
$java = Find-TravelJava
$jar = Join-Path $projectRoot 'backend\target\travel-recording-0.1.0.jar'
if (!(Test-Path -LiteralPath $jar)) { throw 'JAR not found. Run Build.cmd first.' }
if (!$DataDir) { $DataDir = Join-Path $projectRoot 'data' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Write-Host "Address: http://127.0.0.1:$Port/"
Write-Host "Data: $DataDir"
Write-Host 'Original photos are read-only. No directory is scanned until you add it and click Scan.'
if ($Background) {
    $process = Start-Process -FilePath $java -ArgumentList @('-Xmx1024m','-jar',('"'+$jar+'"'),('--server.port='+$Port),('--app.data-dir="'+$DataDir+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $DataDir 'console.log') -RedirectStandardError (Join-Path $DataDir 'console-error.log')
    Set-Content -LiteralPath (Join-Path $DataDir 'app.pid') -Value $process.Id
    Write-Host "Background PID: $($process.Id)"
} else {
    Push-Location $projectRoot
    try { & $java '-Xmx1024m' -jar $jar "--server.port=$Port" "--app.data-dir=$DataDir"; if ($LASTEXITCODE -ne 0) { throw 'Service stopped with an error; see console above.' } }
    finally { Pop-Location }
}
