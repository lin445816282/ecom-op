$ErrorActionPreference = 'Stop'

$WslIp = (wsl.exe hostname -I 2>$null).Trim() -split '\s+' | Select-Object -First 1
if (-not $WslIp) {
    Write-Error "Cannot get WSL IP. Is Ubuntu running?"
    exit 1
}
Write-Host "WSL IP: $WslIp"

$oldRules = netsh interface portproxy show v4tov4 | Out-String
if ($oldRules -match "listenaddress=127.0.0.1\s+listenport=8765") {
    Write-Host "Removing old port forward..."
    netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8765 | Out-Null
}

Write-Host "Adding port forward 127.0.0.1:8765 -> ${WslIp}:8765 ..."
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8765 connectaddress=$WslIp connectport=8765

Write-Host "Done. Open http://127.0.0.1:8765 in Windows browser."
