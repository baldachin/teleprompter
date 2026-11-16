<#
  一键发布到 GitHub Pages（需先完成 GitHub 登录）。
  用法：
    gh auth login                       # 首次登录（浏览器授权）
    pwsh -File scripts/publish.ps1      # 发布
  也支持直接用令牌：$env:GH_TOKEN = 'ghp_xxx'
#>
param(
  [string]$RepoName = 'teleprompter',
  [switch]$SkipPages
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error '未找到 gh（GitHub CLI），请先安装。'
  exit 1
}

if (-not $env:GH_TOKEN) {
  $auth = gh auth status 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '尚未登录 GitHub。二选一：' -ForegroundColor Yellow
    Write-Host '  A) 交互登录（推荐，浏览器授权）： gh auth login' -ForegroundColor Cyan
    Write-Host '  B) 使用个人访问令牌：' -ForegroundColor Cyan
    Write-Host '     $env:GH_TOKEN = ''ghp_你的令牌''' -ForegroundColor Cyan
    Write-Host '     （令牌需具备 repo 与 admin:pages_homesite 权限）' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
  }
}

# 1. 提交本地改动
Push-Location $root
try {
  if (-not (Test-Path '.git')) {
    git init -q
    git branch -M main
  }
  git add -A
  if (-not ([string]::IsNullOrWhiteSpace((git status --porcelain)))) {
    git commit -q -m '发布提词器 v2：一页两态流程、提词中实时调参、三套配色预设'
  }
} finally {
  Pop-Location
}

# 2. 建仓并推送
Push-Location $root
try {
  $remote = git remote get-url origin 2>&1
  if ($LASTEXITCODE -ne 0) {
    gh repo create $RepoName --public --source=. --remote=origin --push 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Error '创建仓库失败（可能仓库名已存在或无权限），可先在 GitHub 网页建空仓库后重跑。'
      exit 1
    }
  } else {
    git push -u origin main 2>&1 | Out-Null
  }
} finally {
  Pop-Location
}

$owner = (gh api user --jq .login).Trim()
$url = "https://$owner.github.io/$RepoName/"

# 3. 开启 GitHub Pages（分支根目录直出）
if (-not $SkipPages) {
  gh api -X POST "repos/$owner/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    gh api -X PUT "repos/$owner/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/" 2>&1 | Out-Null
  }
}

Write-Host ''
Write-Host '发布完成：' -ForegroundColor Green
Write-Host ('  ' + $url) -ForegroundColor Green
Write-Host 'Pages 首次构建约需 1-2 分钟，之后 iPhone Safari 打开该地址即可。' -ForegroundColor DarkGray
Write-Host 'iPhone：Safari 打开 → 分享 → 添加到主屏幕 → 从图标启动（全屏 + 常亮 + 离线）。' -ForegroundColor DarkGray