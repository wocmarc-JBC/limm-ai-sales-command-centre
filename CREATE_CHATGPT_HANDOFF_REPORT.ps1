$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
Set-Location $ProjectRoot

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (!$NodeCommand) {
  $BundledNode = "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $BundledNode) {
    $NodePath = $BundledNode
  } else {
    throw "Node.js was not found. Install Node.js LTS, then run again."
  }
} else {
  $NodePath = $NodeCommand.Path
  if (!$NodePath) { $NodePath = $NodeCommand.Source }
}

Write-Host "Generating ChatGPT handoff report. Secrets and .env values are not printed."
& $NodePath scripts\generate_chatgpt_handoff_report.mjs
Write-Host "Created CHATGPT_HANDOFF_REPORT.md"
