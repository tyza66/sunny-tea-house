$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22 或以上版本，然后重新启动。' }
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
$teaPort = 4318
Get-Content -LiteralPath '.env' | ForEach-Object { if ($_ -match '^PORT=(\d+)\s*$') { $teaPort = [int]$Matches[1] } }
if (Get-NetTCPConnection -State Listen -LocalPort $teaPort -ErrorAction SilentlyContinue) { throw "端口 $teaPort 已占用，请在 .env 修改 PORT 后重试。" }
if (-not (Test-Path -LiteralPath 'node_modules')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络和上方错误信息。' }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '页面构建失败，请检查上方错误信息。' }
Write-Host "请在浏览器打开 http://127.0.0.1:$teaPort 。保持此窗口打开；按 Ctrl+C 停止服务。"
& npm.cmd start
