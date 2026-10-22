# Run after create-samples.py. This script moves only marked, generated fixtures under test-data.
param([int]$Port = 8091)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $projectRoot 'test-data\图片边界 样本'
$fixtureRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'test-data')) + '\'
if (!$fixture.StartsWith($fixtureRoot) -or !(Test-Path -LiteralPath (Join-Path $fixture '.travel-generated-samples'))) { throw 'Generate the independent marked fixtures first.' }
$dataDir = Join-Path $projectRoot ('artifacts\package-check-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$base = "http://127.0.0.1:$Port"
$checks = New-Object System.Collections.Generic.List[string]
function Assert-Check([bool]$ok, [string]$label) { if (!$ok) { throw "FAILED: $label" }; $checks.Add($label); Write-Host "PASS: $label" }
function Connect-Check {
    $script:apiSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $ready = $false
    for ($attempt=0; $attempt -lt 45; $attempt++) {
        try { $token = Invoke-RestMethod "$base/api/session" -WebSession $script:apiSession -TimeoutSec 2; $ready=$true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (!$ready) { throw 'Verification service did not start' }
    $script:headers = @{}; $script:headers[$token.headerName] = $token.token
}
function Request-Check([string]$path, $body=$null, [string]$method='POST') {
    if ($null -eq $body) { $reply = Invoke-WebRequest -UseBasicParsing "$base/api$path" -WebSession $script:apiSession -TimeoutSec 30 }
    else { $reply = Invoke-WebRequest -UseBasicParsing "$base/api$path" -Method $method -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8 -Compress))) -WebSession $script:apiSession -Headers $script:headers -TimeoutSec 30 }
    return ([Text.Encoding]::UTF8.GetString($reply.RawContentStream.ToArray()) | ConvertFrom-Json)
}
function Scan-Check {
    $null = Request-Check '/scans' @{}
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Milliseconds 150
        $state = Request-Check '/scans/current'
        if ((Get-Date) -gt $deadline) { throw 'Scan timeout' }
    } while ($state.state -eq 'running')
    if ($state.state -eq 'failed') { throw ($state | ConvertTo-Json -Depth 4) }
    return $state
}
function Expect-Status([scriptblock]$action,[int]$status) {
    try { & $action | Out-Null; throw "Expected HTTP $status" }
    catch { if (!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $status) { throw } }
}
$parkedFile = Join-Path $projectRoot 'test-data\temporarily-unavailable.bin'
$offlineRoot = Join-Path $projectRoot 'test-data\temporarily-offline-fixture'
try {
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $Port -DataDir $dataDir -Background
    Connect-Check
    $null = Request-Check '/roots' @{path=$fixture}
    $null = Request-Check '/roots' @{path=(Join-Path $fixture '分页')}
    $scan = Scan-Check
    $page = Request-Check '/photos?size=100&sort=name'
    Assert-Check ($page.total -eq 210 -and $page.items.Count -eq 100) 'Packaged JAR: 210 unique photo records including one corrupt file; pagination size 100'
    Assert-Check ($scan.failed -gt 0 -and $scan.added -eq 210) 'Corrupt image is isolated; other files continue'
    $all = @($page.items) + @((Request-Check '/photos?size=100&page=1&sort=name').items) + @((Request-Check '/photos?size=100&page=2&sort=name').items)
    Assert-Check (($all.id | Sort-Object -Unique).Count -eq 210) 'Stable pagination has no duplicate or missing IDs'
    foreach ($name in @('方向6.JPG','真实 WebP.webp','透明 竖图.png','大图.jpg')) {
        $photo = $all | Where-Object fileName -eq $name
        $thumb = Invoke-WebRequest -UseBasicParsing -Uri ($base + $photo.src) -WebSession $script:apiSession
        $preview = Invoke-WebRequest -UseBasicParsing -Uri ($base + $photo.previewSrc) -WebSession $script:apiSession
        Assert-Check ($photo.available -and $thumb.RawContentLength -gt 0 -and $preview.RawContentLength -gt 0) "JAR image plug-ins: $name thumbnail and preview"
        [IO.File]::WriteAllBytes((Join-Path $dataDir ($name+'.preview.png')), $preview.Content)
    }
    $oriented = $all | Where-Object fileName -eq '方向6.JPG'
    Assert-Check ($oriented.width -eq 60 -and $oriented.height -eq 90) 'EXIF orientation 6 is applied'
    $chosen = $all | Where-Object fileName -eq '透明 竖图.png'
    $beforeHash = (Get-FileHash -LiteralPath $chosen.path -Algorithm SHA256).Hash
    $place = Request-Check '/places' @{name='包验证地点';province='青海';provinceCode='630000';lat=36.9;lng=100.18;description='generated sample only'}
    $categoryA = Request-Check '/categories' @{name='A类';placeId=$place.id}
    $categoryB = Request-Check '/categories' @{name='B类';placeId=$place.id}
    $null = Request-Check '/photos/classify' @{photoIds=@($chosen.id);placeId=$place.id;categoryIds=@($categoryA.id,$categoryB.id)}
    Assert-Check ((Request-Check ("/photos?categoryId="+$categoryA.id)).total -eq 1) 'Photo belongs to category A'
    Assert-Check ((Request-Check ("/photos?categoryId="+$categoryB.id)).total -eq 1) 'Same photo also belongs to category B'
    $stableCache = Get-ChildItem -LiteralPath (Join-Path $dataDir 'cache') -Filter '*-thumb.png' | Select-Object Name,LastWriteTimeUtc
    $again = Scan-Check
    $cacheAfter = Get-ChildItem -LiteralPath (Join-Path $dataDir 'cache') -Filter '*-thumb.png' | Select-Object Name,LastWriteTimeUtc
    Assert-Check ($again.added -eq 0 -and $again.updated -eq 0 -and (Request-Check '/photos').total -eq 210) 'Repeated and overlapping scans do not create duplicate rows'
    Assert-Check (!(Compare-Object $stableCache $cacheAfter -Property Name,LastWriteTimeUtc)) 'Unchanged files keep their thumbnail cache'
    Move-Item -LiteralPath $chosen.path -Destination $parkedFile
    $null = Scan-Check
    $missing = Request-Check ('/photos/'+$chosen.id)
    Assert-Check (!$missing.available -and $missing.placeId -eq $place.id -and $missing.categoryIds.Count -eq 2) 'Missing file keeps the same ID, place and categories'
    Move-Item -LiteralPath $parkedFile -Destination $chosen.path
    $null = Scan-Check
    Assert-Check ((Request-Check ('/photos/'+$chosen.id)).available) 'Restored file becomes available without reclassification'
    Move-Item -LiteralPath $fixture -Destination $offlineRoot
    $null = Scan-Check
    $offline = Request-Check ('/photos/'+$chosen.id)
    Assert-Check (!$offline.available -and $offline.categoryIds.Count -eq 2 -and (Request-Check '/photos').total -eq 210) 'Offline roots retain every record and classification'
    Move-Item -LiteralPath $offlineRoot -Destination $fixture
    $null = Scan-Check
    Expect-Status { Invoke-WebRequest -UseBasicParsing "$base/api/scans" -Method Post -ContentType application/json -Body '{}' } 403
    Assert-Check $true 'State mutations require CSRF token'
    Expect-Status { Invoke-WebRequest -UseBasicParsing "$base/api/overview" -Headers @{Origin='http://example.invalid'} } 403
    Assert-Check $true 'Foreign Origin is rejected'
    Expect-Status { Invoke-WebRequest -UseBasicParsing "$base/api/overview" -Headers @{Host='example.invalid'} } 403
    Assert-Check $true 'Foreign Host is rejected'
    & (Join-Path $PSScriptRoot 'Stop.ps1') -DataDir $dataDir
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $Port -DataDir $dataDir -Background
    Connect-Check
    $persisted = Request-Check ('/photos/'+$chosen.id)
    Assert-Check ($persisted.placeId -eq $place.id -and $persisted.categoryIds.Count -eq 2) 'Classification survives a packaged service restart'
    Assert-Check ((Get-FileHash -LiteralPath $chosen.path -Algorithm SHA256).Hash -eq $beforeHash) 'Generated source content is unchanged by scan, browse and classify'
    $checks | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'passed-checks.json') -Encoding UTF8
    Write-Host "All $($checks.Count) package checks passed. Evidence: $dataDir"
} finally {
    if (Test-Path -LiteralPath $parkedFile) { Move-Item -LiteralPath $parkedFile -Destination (Join-Path $fixture '透明 竖图.png') }
    if (Test-Path -LiteralPath $offlineRoot) { Move-Item -LiteralPath $offlineRoot -Destination $fixture }
    & (Join-Path $PSScriptRoot 'Stop.ps1') -DataDir $dataDir
}
