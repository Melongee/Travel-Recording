$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Toolchain.ps1')
$java = Find-TravelJava
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $java)
$env:MAVEN_USER_HOME = Join-Path $projectRoot '.tools\wrapper'
if (Test-Path -LiteralPath (Join-Path $projectRoot 'data\app.pid')) {
    $runningId = [int](Get-Content -LiteralPath (Join-Path $projectRoot 'data\app.pid'))
    if (Get-Process -Id $runningId -ErrorAction SilentlyContinue) { throw 'Service is running. Run Stop.cmd before Build.cmd.' }
}
Push-Location $projectRoot
try {
    $proxyAddress = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy([uri]'https://repo.maven.apache.org')
    $settings = Join-Path $projectRoot 'backend\.mvn\settings.xml'
    if ($proxyAddress.Host -ne 'repo.maven.apache.org') {
        $settings = Join-Path $projectRoot '.tools\maven-system-settings.xml'
        $hostXml = [System.Security.SecurityElement]::Escape($proxyAddress.Host)
        Set-Content -LiteralPath $settings -Encoding UTF8 -Value ('<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"><proxies><proxy><id>system</id><active>true</active><protocol>http</protocol><host>' + $hostXml + '</host><port>' + $proxyAddress.Port + '</port><nonProxyHosts>localhost|127.0.0.1</nonProxyHosts></proxy></proxies></settings>')
        $env:HTTPS_PROXY = $proxyAddress.AbsoluteUri
        $env:HTTP_PROXY = $proxyAddress.AbsoluteUri
    }
    Push-Location frontend
    try {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    } finally { Pop-Location }
    $static = Join-Path $projectRoot 'backend\src\main\resources\static'
    # The checked target is an application-generated directory inside this repository.
    if (Test-Path -LiteralPath $static) {
        $resolved = (Resolve-Path -LiteralPath $static).Path
        if ($resolved -ne (Join-Path $projectRoot 'backend\src\main\resources\static')) { throw 'Unexpected static path' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    New-Item -ItemType Directory -Path $static -Force | Out-Null
    Copy-Item -Path 'frontend\dist\*' -Destination $static -Recurse -Force
    Push-Location backend
    try {
        & .\mvnw.cmd -B -ntp -gs $settings -s $settings clean package
        if ($LASTEXITCODE -ne 0) { throw 'Backend tests or package failed' }
    } finally { Pop-Location }
    Write-Host 'Built backend\target\travel-recording-0.1.0.jar. Run Start.cmd.'
} finally { Pop-Location }
