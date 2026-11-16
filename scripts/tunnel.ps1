<#
  建立公网 HTTPS 隧道（Cloudflare 快速隧道，无需注册账号）。
  用法：pwsh -File scripts/tunnel.ps1
  效果：打印一个 https://xxx.trycloudflare.com 地址，iPhone 用 5G 也能打开。
#>
param([int]$Port = 5173)

$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cmd) {
  Write-Host '未找到 cloudflared 可执行文件。' -ForegroundColor Yellow
  Write-Host '请先安装： winget install cloudflare.cloudflared' -ForegroundColor Cyan
  Write-Host '或从 https://github.com/cloudflare/cloudflared/releases 下载后加入 PATH。' -ForegroundColor DarkGray
  exit 1
}

Write-Host '正在建立隧道，请用 iPhone 打开下方打印出的 https 地址：' -ForegroundColor Green
Write-Host ''

& $cmd.Source tunnel --url "http://localhost:$Port" --no-autoupdate 2>&1 |
  ForEach-Object {
    $text = "$_"
    Write-Host $text
    if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      Write-Host ''
      Write-Host '======================================================' -ForegroundColor Green
      Write-Host ('  iPhone 直接打开： ' + $Matches[0]) -ForegroundColor Green
      Write-Host '  Safari 打开 → 分享 → 添加到主屏幕 → 从图标启动' -ForegroundColor Green
      Write-Host '======================================================' -ForegroundColor Green
    }
  }