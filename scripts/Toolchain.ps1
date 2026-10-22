$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Find-TravelJava {
    $bundled = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
    $candidates = @()
    if ($bundled) { $candidates += Join-Path $bundled.FullName 'bin\java.exe' }
    if ($env:JAVA_HOME) { $candidates += Join-Path $env:JAVA_HOME 'bin\java.exe' }
    foreach ($javaPath in $candidates) {
        if (Test-Path -LiteralPath $javaPath) {
            $probe = New-Object System.Diagnostics.ProcessStartInfo
            $probe.FileName = $javaPath
            $probe.Arguments = '-version'
            $probe.UseShellExecute = $false
            $probe.CreateNoWindow = $true
            $probe.RedirectStandardError = $true
            $probe.RedirectStandardOutput = $true
            $process = [System.Diagnostics.Process]::Start($probe)
            if (!$process.WaitForExit(10000)) { $process.Kill(); continue }
            $version = $process.StandardError.ReadToEnd() + $process.StandardOutput.ReadToEnd()
            $process.Dispose()
            if ($version -match 'version "(2[1-9]|[3-9][0-9])\.') { return $javaPath }
        }
    }
    throw 'Java 21+ not found. Set JAVA_HOME or run scripts\Prepare-Java.ps1.'
}
