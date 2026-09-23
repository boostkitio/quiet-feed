param([Parameter(Mandatory=$true)][string]$Installation, [Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference = 'Stop'
$quietState = Join-Path $env:LOCALAPPDATA 'QuietFeed'
$quietTokenBefore = (Get-Content (Join-Path $quietState 'pairing-token') -Raw).Trim()
$quietKeyBefore = [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')
function Get-QuietFeedbackHash {
    $quietFeedbackFile = Join-Path $quietState 'feedback.json'
    if (Test-Path -LiteralPath $quietFeedbackFile) { return (Get-FileHash -LiteralPath $quietFeedbackFile -ErrorAction Stop).Hash }
    return 'absent'
}
$quietFeedbackBefore = Get-QuietFeedbackHash
function Get-QuietHealth {
    Invoke-RestMethod 'http://127.0.0.1:43127/health' -Headers @{Authorization = "Bearer $quietTokenBefore"} -TimeoutSec 2
}
function Get-QuietPid {
    (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue).OwningProcess
}
try {
    & (Join-Path $Installation 'start.ps1') | Out-Null
    $quietFirstPid = Get-QuietPid
    if (-not (Get-QuietHealth).configured) { throw 'Saved key not loaded' }
    & (Join-Path $Installation 'start.ps1') | Out-Null
    if ((Get-QuietPid) -ne $quietFirstPid) { throw 'Duplicate start replaced the companion' }
    $quietProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $quietFirstPid"
    if ($quietProcessInfo.Name -ne 'node.exe' -or -not $quietProcessInfo.CommandLine.Contains((Join-Path $Installation 'dist\server.mjs'))) { throw 'Unexpected listener; will not stop it' }
    Stop-Process -Id $quietFirstPid
    $quietRecovered = $false
    for ($quietAttempt = 0; $quietAttempt -lt 15; $quietAttempt++) {
        Start-Sleep -Seconds 1
        try { if ((Get-QuietHealth).ok) { $quietRecovered = $true; break } } catch {}
    }
    if (-not $quietRecovered -or (Get-QuietPid) -eq $quietFirstPid) { throw 'Unexpected exit did not recover' }
    & (Join-Path $Installation 'stop.ps1') | Out-Null
    Start-Sleep -Seconds 7
    if (Get-QuietPid) { throw 'Intentional stop restarted unexpectedly' }
    & (Join-Path $Installation 'start.ps1') | Out-Null
    $quietHealth = Get-QuietHealth
    $quietConnection = Get-Content (Join-Path $Installation 'dist\extension\local-connection.json') -Raw | ConvertFrom-Json
    if ($quietConnection.token -ne $quietTokenBefore -or (Get-Content (Join-Path $quietState 'pairing-token') -Raw).Trim() -ne $quietTokenBefore) { throw 'Pairing changed' }
    if ([Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User') -ne $quietKeyBefore) { throw 'Saved key changed' }
    if ((Get-QuietFeedbackHash) -ne $quietFeedbackBefore) { throw 'Feedback changed' }
    $quietTask = Get-ScheduledTask -TaskName ('Quiet Feed Companion - ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
    if ($quietTask.State -ne 'Running' -or -not $quietTask.Triggers) { throw 'Startup task not active' }
    @{ passed=$true; savedKeyLoaded=$quietHealth.configured; automaticRecovery=$true; duplicateStartSafe=$true; intentionalStop=$true; credentialsPreserved=$true; feedbackPreserved=$true; taskRunning=$true; checkedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $Report
} catch {
    @{ passed=$false; error=$_.Exception.Message; checkedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $Report
    exit 1
}
