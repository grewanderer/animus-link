param(
  [string]$StateName = "client",
  [int]$ApiPort = 9999,
  [ValidateSet("default", "advanced", "dev")]
  [string]$UiMode = "default",
  [string]$RelayAddr = "45.12.70.107:7777",
  [string]$BootstrapUrl = "http://45.12.70.107:9999"
)

$ErrorActionPreference = "Stop"

$messengerDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $messengerDir "..")).Path
$daemonState = ".animus-link/state/$StateName.json"
$webState = ".animus-link/messenger-web/$StateName.json"
$seedHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"

$daemonCommand = @"
Set-Location '$repoRoot'
cargo run -p link-daemon -- --api-bind 127.0.0.1:$ApiPort --state-file $daemonState --relay-addr $RelayAddr --relay-name default-relay --relay-token-signing-seed-hex $seedHex
Read-Host 'link-daemon stopped. Press Enter to close'
"@

Write-Host "Starting local link-daemon in a separate window..." -ForegroundColor Cyan
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $daemonCommand) -WorkingDirectory $repoRoot | Out-Null

Set-Location $messengerDir

$env:ANIMUS_MESSENGER_STATE_FILE = $webState
$env:ANIMUS_MESSENGER_BOOTSTRAP_URL = $BootstrapUrl
$env:NEXT_PUBLIC_MESSENGER_AUTO_ROOM_FLOW = "1"
$env:NEXT_PUBLIC_SITE_URL = "http://localhost:3000"

Remove-Item Env:NEXT_PUBLIC_MESSENGER_ADVANCED_UI -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_PUBLIC_MESSENGER_DEV_UI -ErrorAction SilentlyContinue

switch ($UiMode) {
  "advanced" {
    $env:NEXT_PUBLIC_MESSENGER_ADVANCED_UI = "1"
  }
  "dev" {
    $env:NEXT_PUBLIC_MESSENGER_DEV_UI = "1"
  }
}

if (-not (Test-Path (Join-Path $messengerDir "node_modules"))) {
  Write-Host "Installing messenger dependencies with npm ci..." -ForegroundColor Cyan
  npm.cmd ci
}

Write-Host "Starting messenger web on http://localhost:3000/link" -ForegroundColor Green
npm.cmd run dev
