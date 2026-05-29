$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
Set-Location $ProjectRoot
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$NextCommand = ".\node_modules\.bin\next.cmd"
$NextBin = ".\node_modules\next\dist\bin\next"

Write-Host "LIMM AI Sales Command Centre v4.0"
Write-Host "Project: $ProjectRoot"

if (!$NodeCommand) {
  throw "Node.js was not found. Install Node.js LTS, then run this script again."
}
$NodePath = $NodeCommand.Path
if (!$NodePath) {
  $NodePath = $NodeCommand.Source
}
$NodeUsable = $false
try {
  & $NodePath --version | Out-Null
  $NodeUsable = $true
} catch {
  $NodeUsable = $false
}
if (!$NodeUsable) {
  $BundledNode = "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $BundledNode) {
    $NodePath = $BundledNode
    Write-Host "Using bundled Node runtime."
  } else {
    throw "Node.js was found but could not run. Install Node.js LTS, then run this script again."
  }
}

$NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (!$NpmCommand) {
  $NpmCommand = Get-Command npm -ErrorAction SilentlyContinue
}
if ($NpmCommand) {
  $NpmPath = $NpmCommand.Path
  if (!$NpmPath) {
    $NpmPath = $NpmCommand.Source
  }
} else {
  $NpmPath = ""
  Write-Host "npm was not found on PATH. If dependencies are already installed, the app can still start from next.cmd."
}

if (!(Test-Path ".\package.json")) {
  throw "package.json not found. Check the project folder."
}

if (!(Test-Path $NextCommand)) {
  if (!$NpmPath) {
    throw "Dependencies are missing and npm was not found. Install Node.js LTS, then run this script again."
  }
  Write-Host "Dependencies missing. Running npm install..."
  & $NpmPath install
}

if (Test-Path ".\.env.local") {
  Write-Host ".env.local found. Values are hidden."
  $EnvLines = Get-Content ".\.env.local"
  $HasSupabaseUrl = [bool]($EnvLines | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_URL\s*=" })
  $HasSupabaseAnon = [bool]($EnvLines | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=" })
  Write-Host "Supabase URL variable present: $HasSupabaseUrl"
  Write-Host "Supabase anon key variable present: $HasSupabaseAnon"
} else {
  Write-Host ".env.local not found. App will run in Mock Mode."
}

Write-Host "Running doctor..."
if ($NpmPath) {
  & $NpmPath run doctor
} else {
  & $NodePath scripts\doctor.mjs
}

Write-Host "Opening local app after server starts..."
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 6
  Start-Process "http://localhost:3000"
} | Out-Null

Write-Host "Starting local server. Keep this window open."
if ($NpmPath) {
  & $NpmPath run start:local
} else {
  & $NodePath $NextBin dev
}
