param([int]$Port = 8080, [string]$DataDir = '', [switch]$Background)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Toolchain.ps1')
$java = Find-TravelJava
$jar = Join-Path $projectRoot 'backend\target\travel-recording-0.1.0.jar'
if (!(Test-Path -LiteralPath $jar)) { throw 'JAR not found. Run Build.cmd first.' }
if (!$DataDir) { $DataDir = Join-Path $projectRoot 'data' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$address = "http://127.0.0.1:$Port"
$probe = New-Object Net.Sockets.TcpClient
try { $connect = $probe.ConnectAsync('127.0.0.1', $Port); $portOccupied = $connect.Wait(700) -and $probe.Connected } catch { $portOccupied = $false } finally { $probe.Dispose() }
if ($portOccupied) {
    try { $health = Invoke-RestMethod "$address/api/health" -TimeoutSec 2 } catch { $health = $null }
    if ($health -and $health.app -eq 'travel-recording' -and $health.dataDir -eq $DataDir) {
        Write-Host "Already running: $address/"
        Write-Host "Data: $DataDir"
        return
    }
    throw "Port $Port is already in use. Stop the existing service first, or choose another port AND data directory."
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Write-Host "Address: http://127.0.0.1:$Port/"
Write-Host "Data: $DataDir"
Write-Host 'Original photos are read-only. No directory is scanned until you add it and click Scan.'
$configUri = ([uri](Join-Path $projectRoot 'config\application-local.properties')).AbsoluteUri
$configArgument = '--spring.config.import=optional:' + $configUri
if ($Background) {
    $process = Start-Process -FilePath $java -ArgumentList @('-Xmx1024m','-Djava.net.useSystemProxies=true','-jar',('"'+$jar+'"'),('--server.port='+$Port),('--app.data-dir="'+$DataDir+'"'),$configArgument) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $DataDir 'console.log') -RedirectStandardError (Join-Path $DataDir 'console-error.log')
    Set-Content -LiteralPath (Join-Path $DataDir 'app.pid') -Value $process.Id
    Write-Host "Background PID: $($process.Id)"
} else {
    Push-Location $projectRoot
    try { & $java '-Xmx1024m' '-Djava.net.useSystemProxies=true' -jar $jar "--server.port=$Port" "--app.data-dir=$DataDir" $configArgument; if ($LASTEXITCODE -ne 0) { throw 'Service stopped with an error; see console above.' } }
    finally { Pop-Location }
}
