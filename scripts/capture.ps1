<#
  生成移动端尺寸截图（准备台 / 提词页 / 设置抽屉 / 完成态）。
  用法：pwsh -File scripts/capture.ps1
  前置：node serve.js 已启动，且本机已安装 Chrome。
#>
param(
  [string]$Base = 'http://localhost:5173',
  [string]$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe',
  [int]$Width = 390,
  [int]$Height = 844
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'artifacts'
$profile = Join-Path $root '.chrome-capture'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# 清掉旧 profile，避免缓存到过期资源
if (Test-Path $profile) {
  Remove-Item -LiteralPath $profile -Recurse -Force
}

$commonArgs = @(
  '--headless=old', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
  '--hide-scrollbars', '--disk-cache-size=1', "--user-data-dir=$profile"
)

$sample = "第一段：大家好，欢迎来到本次分享。`n第二段：今天我们聊的是 iPhone 上的提词体验。`n`n第三段：字号、边距、语速、主题，提词中都能实时调整。`n第四段：滚到底会给出重播与下一条脚本。"
$text = [uri]::EscapeDataString($sample)

$cases = @(
  @{ name = '01-prepare';         page = '/index.html?reset=1' },
  @{ name = '02-prepare-panel';   page = '/index.html?reset=1&panel=1' },
  @{ name = '03-prompter';         page = "/index.html?reset=1&text=$text&auto=1&cd=0&theme=dark" },
  @{ name = '04-prompter-light';   page = "/index.html?reset=1&text=$text&auto=1&cd=0&theme=light&fs=44&margin=8" },
  @{ name = '05-prompter-sheet';   page = "/index.html?reset=1&text=$text&auto=1&cd=0&sheet=1" },
  @{ name = '06-prompter-finish';  page = "/index.html?reset=1&text=$text&auto=1&cd=0&finish=1" },
  @{ name = '07-prompter-yellow';  page = "/index.html?reset=1&text=$text&auto=1&cd=0&theme=yellow&mirror=1" }
)

foreach ($c in $cases) {
  $page = [uri]::EscapeDataString($c.page)
  & $Chrome @commonArgs --screenshot="$outDir\$($c.name).png" --window-size=520,900 `
    --virtual-time-budget=2500 "$Base/artifacts/frame.html?w=$Width&h=$Height&page=$page" | Out-Null
  Write-Output ("已生成 {0}.png" -f $c.name)
}

Write-Output "截图目录：$outDir"