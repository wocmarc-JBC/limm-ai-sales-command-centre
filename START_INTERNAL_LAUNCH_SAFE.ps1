$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
Set-Location $ProjectRoot

Write-Host "LIMM AI Sales Command Centre v4.5"
Write-Host "Internal controlled use mode"
Write-Host "Project: $ProjectRoot"
Write-Host ""
Write-Host "Safety status:"
Write-Host "- OpenAI brain: disabled"
Write-Host "- WhatsApp integration: disabled"
Write-Host "- Calendar live booking: disabled"
Write-Host "- Auto-pricing: disabled"
Write-Host "- Quote ranges: disabled"
Write-Host "- Review route: disabled by default"
Write-Host "- Public production: not enabled"
Write-Host ""

function Resolve-CommandPath($CommandName) {
  $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if (!$Command) {
    return ""
  }
  if ($Command.Path) {
    return $Command.Path
  }
  return $Command.Source
}

$NodePath = Resolve-CommandPath "node"
if (!$NodePath) {
  throw "Node.js was not found. Install Node.js LTS, then run this script again."
}

$NpmPath = Resolve-CommandPath "npm.cmd"
if (!$NpmPath) {
  $NpmPath = Resolve-CommandPath "npm"
}
if (!$NpmPath) {
  throw "npm was not found. Install Node.js LTS, then run this script again."
}

if (!(Test-Path ".\package.json")) {
  throw "package.json was not found. Check the project folder."
}

if (!(Test-Path ".\node_modules\.bin\next.cmd")) {
  Write-Host "Dependencies are missing. Running npm install..."
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
  Write-Host ".env.local not found. The app will run in Mock Mode."
}

Write-Host ""
Write-Host "Running safety doctor..."
& $NpmPath run doctor

Write-Host ""
Write-Host "Opening http://localhost:3000 after the server starts..."
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 6
  Start-Process "http://localhost:3000"
} | Out-Null

Write-Host "Starting local server. Keep this window open while using the CRM."
& $NpmPath run start:local
