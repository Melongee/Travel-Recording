param([switch]$SkipAppBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (![Environment]::Is64BitOperatingSystem -or [Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Build on Windows x64.' }
$tools = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$runtime = Get-Content -LiteralPath (Join-Path $projectRoot 'desktop/runtime-lock.json') -Raw | ConvertFrom-Json
function Get-VerifiedArchive($url, $hash, $destination) {
    if (!(Test-Path -LiteralPath $destination) -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing -TimeoutSec 300
    }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw "SHA256 mismatch: $destination" }
}
Push-Location $projectRoot
try {
    Get-VerifiedArchive $runtime.electron.url $runtime.electron.sha256 (Join-Path $tools ('electron-v'+$runtime.electron.version+'-win32-x64.zip'))
    $jreZip = Join-Path $tools 'desktop-jre.zip'
    Get-VerifiedArchive $runtime.java.url $runtime.java.sha256 $jreZip
    Expand-Archive -LiteralPath $jreZip -DestinationPath (Join-Path $tools 'desktop-jre') -Force
    if (!$SkipAppBuild) { & (Join-Path $PSScriptRoot 'Build.ps1') -DesktopResources }
    # Desktop publication excludes development-facing Markdown while retaining maps and licenses.
    # Build.ps1 already generated static files; only this known generated file is removed.
    $assetReadme = Join-Path $projectRoot 'backend/src/main/resources/static/assets/README.md'
    if (Test-Path -LiteralPath $assetReadme) { Remove-Item -LiteralPath $assetReadme }
    $compiledReadme = Join-Path $projectRoot 'backend/target/classes/static/assets/README.md'
    if (Test-Path -LiteralPath $compiledReadme) { Remove-Item -LiteralPath $compiledReadme }
    . (Join-Path $PSScriptRoot 'Toolchain.ps1')
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent (Find-TravelJava))
    $env:MAVEN_USER_HOME = Join-Path $tools 'wrapper'
    $settings = Join-Path $projectRoot 'backend/.mvn/settings.xml'
    if (Test-Path -LiteralPath (Join-Path $tools 'maven-system-settings.xml')) { $settings = Join-Path $tools 'maven-system-settings.xml' }
    Push-Location backend
    try {
        & ./mvnw.cmd -B -ntp -gs $settings -s $settings package -DskipTests
        if ($LASTEXITCODE -ne 0) { throw 'Desktop JAR package failed' }
        & ./mvnw.cmd -B -ntp -gs $settings -s $settings org.codehaus.mojo:license-maven-plugin:2.7.0:add-third-party '-Dlicense.outputDirectory=target/generated-resources/licenses' '-Dlicense.excludedScopes=test,provided,system'
        if ($LASTEXITCODE -ne 0) { throw 'Backend license inventory failed' }
    } finally { Pop-Location }
    Push-Location desktop
    try {
        $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Desktop npm ci failed' }
        & node package.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Desktop assembly failed' }
    } finally { Pop-Location }
    $bundle = Get-Content -LiteralPath (Join-Path $tools 'desktop-bundle-path.txt') -Raw
    $version = (Get-Content -LiteralPath desktop/package.json -Raw | ConvertFrom-Json).version
    $zip = Join-Path $projectRoot ('artifacts/旅迹-Windows-x64-'+$version+'.zip')
    if (Test-Path -LiteralPath $zip) { throw "Existing delivery ZIP preserved; move it before rebuilding: $zip" }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($bundle, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
    & (Join-Path $PSScriptRoot 'Verify-DesktopPackage.ps1') -Zip $zip
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($zip+'.sha256'),($hash+'  '+[IO.Path]::GetFileName($zip)+[Environment]::NewLine),(New-Object Text.UTF8Encoding $false))
    Write-Host "ZIP: $zip"
    Write-Host "SHA256: $hash"
} finally { Pop-Location }
