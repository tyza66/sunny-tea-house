$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'node_modules\netlify-cli')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络。' }
}
# 部署到当前登录账号关联的 Netlify 站点；账号验证和授权由用户在浏览器完成。
& npx.cmd netlify status
if ($LASTEXITCODE -ne 0) {
  & npx.cmd netlify login
  if ($LASTEXITCODE -ne 0) { throw '尚未完成 Netlify 登录授权。' }
}
& npm.cmd run build:netlify
if ($LASTEXITCODE -ne 0) { throw '页面构建失败，请检查上方错误。' }
& npx.cmd netlify deploy --prod --no-build --dir=out --functions=netlify/functions
if ($LASTEXITCODE -ne 0) { throw '部署失败，请确认账号拥有该项目，并检查上方错误。' }
Write-Host '请打开部署后的网站并刷新，检查是否进入真实 AI 模式。'
