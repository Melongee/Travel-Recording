# Uses only generated fixtures. Does not modify the main library or user photographs.
param([int]$SourcePort=8093,[int]$RestorePort=8094)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$generated=Join-Path $projectRoot 'test-data\图片边界 样本'
if(!(Test-Path -LiteralPath (Join-Path $generated '.travel-generated-samples'))){throw 'Run scripts/create-samples.py first.'}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$fixture=Join-Path $projectRoot ("test-data\backup-$stamp")
$evidence=Join-Path $projectRoot ("artifacts\backup-check-$stamp")
$sourceData=Join-Path $evidence 'source'
$restoredData=Join-Path $evidence 'restored'
New-Item -ItemType Directory -Path $fixture,$evidence -Force | Out-Null
foreach($name in @('方向6.JPG','透明 竖图.png','真实 WebP.webp','损坏.jpg')){Copy-Item -LiteralPath (Join-Path $generated $name) -Destination $fixture}
Set-Content -LiteralPath (Join-Path $fixture '.travel-generated-samples') -Value 'independent backup verification fixtures'
$checks=New-Object System.Collections.Generic.List[string]
function Assert-Backup([bool]$condition,[string]$label){if(!$condition){throw "FAILED: $label"};$checks.Add($label);Write-Host "PASS: $label"}
function Connect-Backup([int]$port){
    $session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $base="http://127.0.0.1:$port"
    for($attempt=0;$attempt -lt 45;$attempt++){
        try{$token=Invoke-RestMethod "$base/api/session" -WebSession $session -TimeoutSec 2;break}catch{Start-Sleep -Milliseconds 500}
    }
    if(!$token){throw 'Verification service did not start'}
    $headers=@{};$headers[$token.headerName]=$token.token
    return [pscustomobject]@{base=$base;session=$session;headers=$headers}
}
function Request-Backup($instance,[string]$path,$body=$null){
    if($null -eq $body){$reply=Invoke-WebRequest -UseBasicParsing ($instance.base+'/api'+$path) -WebSession $instance.session -TimeoutSec 30}
    else{
        $json=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Compress -Depth 8))
        $reply=Invoke-WebRequest -UseBasicParsing ($instance.base+'/api'+$path) -Method Post -ContentType 'application/json; charset=utf-8' -Body $json -WebSession $instance.session -Headers $instance.headers -TimeoutSec 30
    }
    # Windows PowerShell 5 may otherwise decode JSON without charset as a legacy encoding.
    return ([Text.Encoding]::UTF8.GetString($reply.RawContentStream.ToArray())|ConvertFrom-Json)
}
function Upload-Backup($instance,[string]$file,[int]$expected=200){
    Add-Type -AssemblyName System.Net.Http
    $handler=New-Object System.Net.Http.HttpClientHandler
    $handler.CookieContainer=$instance.session.Cookies;$handler.UseProxy=$false
    $client=New-Object System.Net.Http.HttpClient($handler)
    $form=New-Object System.Net.Http.MultipartFormDataContent
    try{
        foreach($header in $instance.headers.GetEnumerator()){$client.DefaultRequestHeaders.Add($header.Key,[string]$header.Value)}
        $part=New-Object System.Net.Http.StreamContent([IO.File]::OpenRead($file))
        $form.Add($part,'file',[IO.Path]::GetFileName($file))
        $response=$client.PostAsync(($instance.base+'/api/backups/inspect'),$form).GetAwaiter().GetResult()
        try{
            if([int]$response.StatusCode -ne $expected){throw "Unexpected upload HTTP $([int]$response.StatusCode)"}
            return ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult()|ConvertFrom-Json)
        }finally{$response.Dispose()}
    }finally{$form.Dispose();$client.Dispose()}
}
function Scan-Backup($instance){
    $null=Request-Backup $instance '/scans' @{}
    $deadline=(Get-Date).AddSeconds(90)
    do{Start-Sleep -Milliseconds 150;$state=Request-Backup $instance '/scans/current';if((Get-Date) -gt $deadline){throw 'Scan timeout'}}while($state.state -eq 'running')
    if($state.state -eq 'failed'){throw 'Scan failed'}
    return $state
}
function Expect-BackupStatus([scriptblock]$action,[int]$status){
    try{& $action|Out-Null;throw "Expected HTTP $status"}catch{if(!$_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $status){throw}}
}
$chosen=$null;$parked=Join-Path $fixture 'temporarily-missing.bin'
try{
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $SourcePort -DataDir $sourceData -Background
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $RestorePort -DataDir $restoredData -Background
    $source=Connect-Backup $SourcePort;$target=Connect-Backup $RestorePort
    $originals=Get-ChildItem -LiteralPath $fixture -File | Where-Object Name -ne '.travel-generated-samples' | ForEach-Object{[pscustomobject]@{Name=$_.Name;Length=$_.Length;Modified=$_.LastWriteTimeUtc.Ticks;Hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}}
    $null=Request-Backup $source '/roots' @{path=$fixture}
    $scan=Scan-Backup $source
    Assert-Backup ($scan.added -eq 4 -and $scan.failed -eq 1) 'Packaged scan isolates corrupt image from three valid images'
    $photos=Request-Backup $source '/photos?size=200'
    $chosen=$photos.items | Where-Object fileName -eq '透明 竖图.png'
    $place=Request-Backup $source '/places' @{name='备份验证地点';province='青海';provinceCode='630000';lat=36.9;lng=100.18;description='generated fixture'}
    $a=Request-Backup $source '/categories' @{name='风景';placeId=$place.id}
    $b=Request-Backup $source '/categories' @{name='留念';placeId=$place.id}
    $null=Request-Backup $source '/photos/classify' @{photoIds=@($chosen.id);placeId=$place.id;categoryIds=@($a.id,$b.id)}
    $archive=Join-Path $evidence 'export.zip'
    Invoke-WebRequest -UseBasicParsing ($source.base+'/api/backups/export') -Method Post -ContentType application/json -Body '{}' -WebSession $source.session -Headers $source.headers -OutFile $archive
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{Assert-Backup (($zip.Entries.FullName|Sort-Object) -join ',' -eq 'library.db,manifest.json') 'ZIP contains only database and manifest'}finally{$zip.Dispose()}
    $inspection=Upload-Backup $target $archive
    Assert-Backup ($inspection.manifest.counts.photos -eq 4 -and $inspection.manifest.counts.categories -eq 2 -and $inspection.manifest.counts.links -eq 2) 'Preview validates real database counts and both category links'
    $inspection|ConvertTo-Json -Depth 8|Set-Content (Join-Path $evidence 'inspection.json') -Encoding UTF8
    Expect-BackupStatus {Request-Backup $target '/backups/restore' @{token=$inspection.token;confirmed=$false}} 400
    Assert-Backup $true 'Restore requires explicit confirmation'
    $null=Request-Backup $target '/backups/restore' @{token=$inspection.token;confirmed=$true}
    $restored=Request-Backup $target ('/photos/'+$chosen.id)
    Assert-Backup ($restored.placeId -eq $place.id -and $restored.categoryIds.Count -eq 2 -and $restored.categoryIds -contains $a.id -and $restored.categoryIds -contains $b.id) 'Restore preserves photo ID, place ID and both category IDs'
    $root=(Request-Backup $target '/overview').roots[0]
    Assert-Backup (!$root.enabled -and $root.status -eq 'needs_confirmation' -and !$restored.available) 'Imported path does not inherit read permission'
    Expect-BackupStatus {Invoke-WebRequest -UseBasicParsing ($target.base+$restored.src) -WebSession $target.session} 409
    Assert-Backup $true 'Thumbnail request cannot read an unconfirmed directory'
    $null=Request-Backup $target ('/roots/'+$root.id+'/confirm') @{}
    $scan=Scan-Backup $target
    $thumb=Invoke-WebRequest -UseBasicParsing ($target.base+$restored.src) -WebSession $target.session
    Assert-Backup ($thumb.RawContentLength -gt 0 -and $scan.updated -eq 3) 'Confirmed restore rebuilds valid thumbnails without duplicating corrupt record'
    $again=Scan-Backup $target
    Assert-Backup ($again.added -eq 0 -and (Request-Backup $target '/photos').total -eq 4) 'Repeat scan after restore creates no duplicates'
    Move-Item -LiteralPath $chosen.path -Destination $parked
    $null=Scan-Backup $target
    $missing=Request-Backup $target ('/photos/'+$chosen.id)
    Assert-Backup (!$missing.available -and $missing.categoryIds.Count -eq 2) 'Missing original after restore retains both categories'
    Move-Item -LiteralPath $parked -Destination $chosen.path
    $null=Scan-Backup $target
    & (Join-Path $PSScriptRoot 'Stop.ps1') -DataDir $restoredData
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $RestorePort -DataDir $restoredData -Background
    $target=Connect-Backup $RestorePort
    $persisted=Request-Backup $target ('/photos/'+$chosen.id)
    Assert-Backup ($persisted.available -and $persisted.placeId -eq $place.id -and $persisted.categoryIds.Count -eq 2) 'Restored classifications survive a real JAR service restart'
    $inspectedAgain=Upload-Backup $target $archive
    Expect-BackupStatus {Request-Backup $target '/backups/restore' @{token=$inspectedAgain.token;confirmed=$true}} 409
    Assert-Backup $true 'Nonempty target rejects another restore without overwriting data'
    $bad=Join-Path $evidence 'invalid.zip'
    [IO.File]::WriteAllText($bad,'not a backup')
    $null=Upload-Backup $target $bad 400
    Assert-Backup ((Request-Backup $target ('/photos/'+$chosen.id)).categoryIds.Count -eq 2) 'Invalid archive is rejected and existing categories remain'
    $after=Get-ChildItem -LiteralPath $fixture -File | Where-Object Name -ne '.travel-generated-samples' | ForEach-Object{[pscustomobject]@{Name=$_.Name;Length=$_.Length;Modified=$_.LastWriteTimeUtc.Ticks;Hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}}
    Assert-Backup (!(Compare-Object $originals $after -Property Name,Length,Modified,Hash)) 'Generated originals retain names, timestamps, lengths and SHA256'
    $checks|ConvertTo-Json|Set-Content (Join-Path $evidence 'passed-checks.json') -Encoding UTF8
    Write-Host "All $($checks.Count) backup checks passed. Evidence: $evidence"
}finally{
    if($chosen -and (Test-Path -LiteralPath $parked)){Move-Item -LiteralPath $parked -Destination $chosen.path}
    & (Join-Path $PSScriptRoot 'Stop.ps1') -DataDir $sourceData
    & (Join-Path $PSScriptRoot 'Stop.ps1') -DataDir $restoredData
}
