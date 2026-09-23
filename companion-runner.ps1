param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$quietState = Join-Path $env:LOCALAPPDATA 'QuietFeed'
$quietServer = Join-Path $PSScriptRoot 'dist\server.mjs'
$quietMutex = [Threading.Mutex]::new($false, 'Local\QuietFeedCompanion')
$quietOwned = $false
try {
    try { $quietOwned = $quietMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $quietOwned = $true }
    if (-not $quietOwned) { exit 0 }
    New-Item -ItemType Directory -Path $quietState -Force | Out-Null
    while ($true) {
        # Read the saved key on each restart; never put credentials in task arguments.
        $env:TYPESAFE_API_KEY = [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')
        if (-not $env:TYPESAFE_API_KEY) { throw 'No saved TypeSafe key. Run Start Quiet Feed once.' }
        if (-not (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue)) {
            $quietChild = Start-Process -FilePath $NodePath -ArgumentList @('"' + $quietServer + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $quietState 'companion.log') -RedirectStandardError (Join-Path $quietState 'companion-error.log')
            $quietChild.Id | Set-Content -LiteralPath (Join-Path $quietState 'companion.pid')
            Start-Sleep -Seconds 1
            try {
                $quietToken = (Get-Content -LiteralPath (Join-Path $quietState 'pairing-token') -Raw).Trim()
                $quietHealth = Invoke-RestMethod 'http://127.0.0.1:43127/health' -Headers @{ Authorization = "Bearer $quietToken" } -TimeoutSec 3
                @{ ready = [bool]$quietHealth.ok; configured = [bool]$quietHealth.configured; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $quietState 'startup-status.json')
            } catch {
                @{ ready = $false; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $quietState 'startup-status.json')
            }
            $quietChild.WaitForExit()
        }
        # An intentional Stop terminates this supervisor before its child.
        Start-Sleep -Seconds 5
    }
} finally {
    if ($quietOwned) { $quietMutex.ReleaseMutex() }
    $quietMutex.Dispose()
}
