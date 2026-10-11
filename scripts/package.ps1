param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [ValidateSet('windows','macOS')][string]$Platform = 'windows'
)
$ErrorActionPreference = 'Stop'
$quietProject = Split-Path $PSScriptRoot -Parent
$quietVersion = (Get-Content -LiteralPath (Join-Path $quietProject 'package.json') -Raw | ConvertFrom-Json).version
$quietStage = Join-Path $quietProject ('work\packages\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $quietStage 'dist\extension'), $Destination -Force | Out-Null
# Deliberate allowlist: never package local-connection.json or other local state.
foreach ($quietFile in @('background.js','content.js','content.css','popup.js','popup.html','popup.css','manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $quietProject "dist\extension\$quietFile") -Destination (Join-Path $quietStage "dist\extension\$quietFile")
}
Copy-Item -LiteralPath (Join-Path $quietProject 'dist\server.mjs') -Destination (Join-Path $quietStage 'dist\server.mjs')
Copy-Item -LiteralPath (Join-Path $quietProject 'README.md') -Destination (Join-Path $quietStage 'README.md')
if ($Platform -eq 'windows') {
    foreach ($quietFile in @('start.ps1','stop.ps1','companion-runner.ps1','Start Quiet Feed.cmd','Stop Quiet Feed.cmd','Disable Quiet Feed Startup.cmd')) {
        Copy-Item -LiteralPath (Join-Path $quietProject $quietFile) -Destination (Join-Path $quietStage $quietFile)
    }
    Copy-Item -LiteralPath (Join-Path $quietProject 'docs\QUICK-START.md') -Destination (Join-Path $quietStage 'QUICK-START.md')
} else {
    New-Item -ItemType Directory -Path (Join-Path $quietStage 'mac') -Force | Out-Null
    foreach ($quietFile in @('start-mac.sh','stop-mac.sh','disable-mac-startup.sh')) {
        Copy-Item -LiteralPath (Join-Path $quietProject $quietFile) -Destination (Join-Path $quietStage $quietFile)
    }
    foreach ($quietFile in @('common.sh','runner.sh','connect.mjs')) {
        Copy-Item -LiteralPath (Join-Path $quietProject "mac\$quietFile") -Destination (Join-Path $quietStage "mac\$quietFile")
    }
    Copy-Item -LiteralPath (Join-Path $quietProject 'docs\MAC-QUICK-START.md') -Destination (Join-Path $quietStage 'MAC-QUICK-START.md')
}
$quietSecretMatches = @(rg -l 'apikey_[A-Za-z0-9_]+|"token"\s*:\s*"[a-f0-9]{48}"' $quietStage)
if ($quietSecretMatches.Count) { throw 'Credential scan failed. Release not created.' }
$quietFileName = if ($Platform -eq 'macOS') { "Quiet-Feed-macOS-$quietVersion.zip" } else { "Quiet-Feed-$quietVersion.zip" }
$quietZip = Join-Path (Resolve-Path -LiteralPath $Destination) $quietFileName
# Compress-Archive in Windows PowerShell 5.1 writes backslash entry names,
# which macOS cannot extract into folders. Write forward slashes explicitly.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $quietZip) { Remove-Item -LiteralPath $quietZip }
$quietArchive = [IO.Compression.ZipFile]::Open($quietZip, 'Create')
try {
    foreach ($quietItem in Get-ChildItem -LiteralPath $quietStage -Recurse -File) {
        $quietName = $quietItem.FullName.Substring($quietStage.Length + 1).Replace('\', '/')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($quietArchive, $quietItem.FullName, $quietName)
    }
} finally { $quietArchive.Dispose() }
Write-Host "Packaged Quiet Feed $quietVersion for $Platform; private connection files excluded."
