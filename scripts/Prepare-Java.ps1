$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
$assets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
$package = $assets[0].binary.package
$archive = Join-Path $toolsDirectory 'jdk21.zip'
Write-Host 'Downloading official Eclipse Temurin Java 21...'
Invoke-WebRequest -Uri $package.link -OutFile $archive
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -ne $package.checksum) { throw 'Java archive checksum mismatch' }
Expand-Archive -LiteralPath $archive -DestinationPath $toolsDirectory -Force
Write-Host 'Java 21 prepared in project .tools; system Java settings were not changed.'
