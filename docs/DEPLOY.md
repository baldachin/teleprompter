# 部署到 iPhone 可用的 HTTPS 环境

局域网 `http://<IP>:5173` 仅适合快速调试：**Service Worker（离线）、Wake Lock（防锁屏）、添加到主屏后的完整 PWA 行为都需要 https**。
正式给 iPhone 使用，建议部署到任意静态托管（纯静态，无需构建）。

## 打包内容

需要上传的文件（整个目录原样上传即可）：

```
index.html
manifest.webmanifest
sw.js
assets/
  app.js
  styles.css
  icon-180.png
  icon-192.png
  icon-512.png
```

`artifacts/`、`docs/`、`scripts/`、`serve.js` 为开发辅助文件，部署时可不上传。

## 方式一：GitHub Pages

1. 新建仓库，上传上述文件（保持目录结构）。
2. Settings → Pages → Source 选择 `main` 分支 `/ (root)`。
3. 等待 1–2 分钟，得到 `https://<用户名>.github.io/<仓库名>/`。
4. iPhone Safari 打开该地址 → 分享 → 添加到主屏幕。

## 方式二：Vercel / Netlify

- Vercel：导入仓库，Framework Preset 选 `Other`，构建命令留空，输出目录填 `.`（或根目录）。
- Netlify：New site → Deploy manually → 拖拽包含上述文件的目录。

两者都会分配 `https://xxx.vercel.app` 之类的地址。

## 方式三：任意虚拟主机 / 对象存储

把上述文件放进站点根目录，确保 `.webmanifest` 的 MIME 为 `application/manifest+json`（Nginx 加
`types { application/manifest+json webmanifest; }`）。

## iPhone 端使用步骤

1. Safari 打开 https 地址（必须是 Safari，Chrome 无法添加到主屏）。
2. 底部「分享」→ 添加到主屏幕 → 命名「提词器」→ 添加。
3. 从主屏图标启动：全屏无地址栏，竖屏锁定，离线可用，屏幕不熄灭。

## 自检清单

- [ ] https 地址可打开，控制台无报错
- [ ] 添加到主屏后从图标启动，无地址栏
- [ ] 断网后仍能打开并提词（Service Worker 生效）
- [ ] 提词过程中屏幕不自动熄灭（Wake Lock 生效）