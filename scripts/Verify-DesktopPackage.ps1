param([Parameter(Mandatory=$true)][string]$Zip)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Zip))
try {
    $manifestEntry = @($archive.Entries | Where-Object FullName -like '*/package-manifest.json')
    if ($manifestEntry.Count -ne 1) { throw 'Missing unique package manifest' }
    $prefix = $manifestEntry[0].FullName.Substring(0,$manifestEntry[0].FullName.LastIndexOf('/')+1)
    $reader = New-Object IO.StreamReader ($manifestEntry[0].Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($manifest.platform -ne 'win32-x64') { throw 'Unexpected platform' }
    $files = @($archive.Entries | Where-Object { !$_.FullName.EndsWith('/') })
    if ($files.Count -ne $manifest.files.Count+1) { throw 'Unlisted or missing package files' }
    foreach ($item in $manifest.files) {
        if ($item.file -match '(^/|(^|/)\.\.(/|$)|\\|:)' -or $item.file -match '(^|/)(data|config|node_modules|\.git|\.tools|artifacts|docs)/|\.(db|sqlite|log|pid)$|application-local|(^|/)demo\.(png|jpg)$') { throw "Forbidden package path: $($item.file)" }
        $entry = $archive.GetEntry($prefix+$item.file)
        if (!$entry -or $entry.Length -ne $item.bytes) { throw "Missing/incorrect size: $($item.file)" }
        $sha = [Security.Cryptography.SHA256]::Create(); $stream = $entry.Open()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
        if ($hash -ne $item.sha256) { throw "Incorrect hash: $($item.file)" }
    }
    foreach ($required in @('resources/java/bin/java.exe','resources/java/bin/server/jvm.dll','resources/java/lib/modules','resources/java/legal/java.base/LICENSE','resources/java/NOTICE','resources/server/travel-recording.jar','resources/app.asar','LICENSE','LICENSES.chromium.html','licenses/backend-dependencies.txt','licenses/cities-LICENSE.txt')) {
        if (!$archive.GetEntry($prefix+$required)) { throw "Required runtime/license missing: $required" }
    }
    $jarBytes = New-Object IO.MemoryStream
    $jarStream = $archive.GetEntry($prefix+'resources/server/travel-recording.jar').Open()
    try { $jarStream.CopyTo($jarBytes) } finally { $jarStream.Dispose() }
    $jarBytes.Position=0
    $jar = New-Object IO.Compression.ZipArchive ($jarBytes,[IO.Compression.ZipArchiveMode]::Read)
    try {
        if (!$jar.GetEntry('BOOT-INF/classes/static/index.html') -or !$jar.GetEntry('BOOT-INF/classes/static/assets/china-provinces.geojson')) { throw 'Missing application or offline map' }
        if ($jar.Entries | Where-Object { $_.FullName -match 'application-local|library\.db|static/.*\.md$|demo\.png|正式开发交接' }) { throw 'Non-runtime/private files in JAR' }
    } finally { $jar.Dispose(); $jarBytes.Dispose() }
    Write-Host "PASS: $($files.Count) ZIP files match SHA256 manifest; runtime, maps and licenses present; forbidden paths absent."
    Get-FileHash -LiteralPath $Zip -Algorithm SHA256 | Select-Object Hash
} finally { $archive.Dispose() }
