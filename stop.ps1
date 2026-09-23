param([switch]$DisableStartup)
$ErrorActionPreference = 'Stop'
$quietTaskName = 'Quiet Feed Companion - ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$quietTask = Get-ScheduledTask -TaskName $quietTaskName -ErrorAction SilentlyContinue
if ($quietTask) {
    $quietRunner = Join-Path $PSScriptRoot 'companion-runner.ps1'
    if (-not $quietTask.Actions.Arguments.Contains('"' + $quietRunner + '"')) { throw 'Automatic startup belongs to another installation. Stop it from that folder.' }
    Stop-ScheduledTask -TaskName $quietTaskName
    if ($DisableStartup) { Unregister-ScheduledTask -TaskName $quietTaskName -Confirm:$false }
    # Let Windows terminate the supervisor before stopping any surviving child.
    Start-Sleep -Milliseconds 500
}
$quietPidFile = Join-Path $env:LOCALAPPDATA 'QuietFeed\companion.pid'
$quietCandidates = @()
if (Test-Path -LiteralPath $quietPidFile) {
    $quietStoredPid = 0
    if ([int]::TryParse((Get-Content -LiteralPath $quietPidFile -Raw).Trim(), [ref]$quietStoredPid)) { $quietCandidates += $quietStoredPid }
}
# Recover a stale pid file without stopping any other installation or service.
$quietCandidates += @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)
$quietStopped = $false
foreach ($quietProcessId in ($quietCandidates | Select-Object -Unique)) {
    $quietProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $quietProcessId"
    $quietExpectedPath = Join-Path $PSScriptRoot 'dist\server.mjs'
    if ($quietProcessInfo -and $quietProcessInfo.Name -eq 'node.exe' -and $quietProcessInfo.CommandLine.Contains($quietExpectedPath)) {
        Stop-Process -Id $quietProcessId
        $quietStopped = $true
    }
}
if ($quietStopped) { Write-Host 'Quiet Feed stopped. Pause the extension or refresh LinkedIn to reveal hidden content.' }
else { Write-Host 'No matching Quiet Feed process is running from this folder.' }
if ($DisableStartup) { Write-Host 'Automatic startup disabled. Saved credentials and feedback are preserved.' }
