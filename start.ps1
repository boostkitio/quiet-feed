$ErrorActionPreference = 'Stop'
$quietRoot = $PSScriptRoot
$quietState = Join-Path $env:LOCALAPPDATA 'QuietFeed'
$quietServer = Join-Path $quietRoot 'dist\server.mjs'
if (-not (Test-Path -LiteralPath $quietServer)) { throw 'Build missing. Run npm install and npm run build, or use the release package.' }
$quietNode = (Get-Command node.exe -ErrorAction Stop).Source
$quietKey = [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')
if (-not $quietKey) { $quietKey = $env:TYPESAFE_API_KEY }
if (-not $quietKey) {
    $quietSecure = Read-Host 'Enter your TypeSafe API key (stored in your Windows user environment)' -AsSecureString
    $quietPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($quietSecure)
    try { $quietKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($quietPtr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($quietPtr) }
    if (-not $quietKey) { throw 'An API key is required.' }
    [Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', $quietKey, 'User')
}
# Persist a process-only key too, so the scheduled task can use it next sign-in.
if (-not [Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY', 'User')) {
    [Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', $quietKey, 'User')
}
New-Item -ItemType Directory -Path $quietState -Force | Out-Null
$quietIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$quietTaskName = 'Quiet Feed Companion - ' + $quietIdentity.User.Value
$quietRunner = Join-Path $quietRoot 'companion-runner.ps1'
if (-not (Test-Path -LiteralPath $quietRunner)) { throw 'Companion runner missing. Extract all release files into this folder.' }
$quietArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $quietRunner + '" -NodePath "' + $quietNode + '"'
$quietListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue
if ($quietListener) {
    $quietListenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($quietListener.OwningProcess)"
    if (-not $quietListenerProcess -or $quietListenerProcess.Name -ne 'node.exe' -or -not $quietListenerProcess.CommandLine.Contains('"' + $quietServer + '"')) {
        throw 'Port 43127 belongs to another process or installation. Stop that installation before starting this one.'
    }
}
$quietExisting = Get-ScheduledTask -TaskName $quietTaskName -ErrorAction SilentlyContinue
if ($quietExisting -and $quietExisting.Actions.Arguments -ne $quietArguments) {
    throw 'Automatic startup is registered to another folder. Run Disable Quiet Feed Startup.cmd from that folder before switching installations.'
}
if (-not $quietExisting) {
    $quietAction = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $quietArguments -WorkingDirectory $quietRoot
    $quietTrigger = New-ScheduledTaskTrigger -AtLogOn -User $quietIdentity.Name
    $quietPrincipal = New-ScheduledTaskPrincipal -UserId $quietIdentity.Name -LogonType Interactive -RunLevel Limited
    $quietSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $quietTaskName -Action $quietAction -Trigger $quietTrigger -Principal $quietPrincipal -Settings $quietSettings -Description 'Starts Quiet Feed at sign-in and restores its companion after an unexpected exit. No credentials are stored in this task.' | Out-Null
}
Start-ScheduledTask -TaskName $quietTaskName
$quietTokenFile = Join-Path $quietState 'pairing-token'
$quietRunning = $false
for ($quietAttempt = 0; $quietAttempt -lt 15; $quietAttempt++) {
    if (Test-Path -LiteralPath $quietTokenFile) {
        $quietToken = (Get-Content -LiteralPath $quietTokenFile -Raw).Trim()
        try { $quietHealth = Invoke-RestMethod 'http://127.0.0.1:43127/health' -Headers @{ Authorization = "Bearer $quietToken" } -TimeoutSec 2; $quietRunning = $quietHealth.ok -and $quietHealth.configured } catch {}
    }
    if ($quietRunning) { break }
    Start-Sleep -Seconds 1
}
if (-not $quietRunning) { throw 'Companion did not become ready. Check Task Scheduler and the QuietFeed folder in Local AppData. Your saved key has not been removed.' }
$quietToken = (Get-Content -LiteralPath $quietTokenFile -Raw).Trim()
$quietConnectionFile = Join-Path $quietRoot 'dist\extension\local-connection.json'
# Local installation only: release packaging explicitly excludes this file.
$quietConnectionJson = @{ token = $quietToken } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($quietConnectionFile, $quietConnectionJson, [Text.UTF8Encoding]::new($false))
Write-Host "`nQuiet Feed is running and will start automatically when you sign into Windows.`n"
Write-Host 'The extension will pair automatically when loaded or reloaded.'
Write-Host 'Your key and pairing are saved. You do not need to paste them again.'
Write-Host 'You can close this window. Stop Quiet Feed pauses the companion until Start or your next sign-in.'
Write-Host 'Disable Quiet Feed Startup stops it and removes automatic startup.'
