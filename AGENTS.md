# Repository Guidelines

## 项目概览

Teleprompter：面向 iPhone 的滚动提词器，采用**零依赖静态 Web App（PWA）**形态。
无构建步骤、无 npm 依赖，`index.html` 直接可运行；通过 Safari「添加到主屏幕」获得无地址栏全屏体验。

## 项目结构与模块组织

- `index.html` — 单页两态结构：准备台（脚本/设置/入口）、提词态（沉浸滚动区 + HUD）、抽屉与浮层；设置面板放在 `<template>` 中，由 JS 挂载。
- `assets/styles.css` — 全部样式；`:root` 存放基础变量，`#prompterScreen[data-theme]` 存放三套提词主题变量。
- `assets/app.js` — 全部逻辑，IIFE 封装，按节划分：存储、设置面板、速度换算、准备台、脚本库、提词态、完成态、拖拽与 HUD、常亮、URL 参数。
- `assets/icon-*.png` — 应用图标（180/192/512），供 `apple-touch-icon` 与 manifest 使用。
- `manifest.webmanifest` / `sw.js` — PWA 清单与离线缓存。
- `serve.js` — 零依赖本地静态服务器（打印局域网地址，供 iPhone 真机访问）。
- `scripts/capture.ps1` — 生成移动端尺寸截图；`artifacts/frame.html` 为 iframe 视口模拟页。
- `docs/REQUIREMENTS.md` — 功能清单与取舍；`docs/FLOW-OPTIMIZATION.md` — 参考页对照与优化记录。

## 构建、测试与本地开发命令

无构建流程，命令均为验证性质：

- `node serve.js 5173` — 启动本地服务并打印局域网地址。
- `pwsh -File scripts/capture.ps1` — 无头 Chrome 在 390×844 视口下截图，验证准备台/提词页/抽屉/完成态。
- `node --check assets/app.js` / `node --check serve.js` — 语法检查（改完 JS 必跑）。

## 编码风格与命名约定

- 2 空格缩进；单引号字符串；`const` 优先，禁止全局变量。
- 函数与变量 `camelCase`，DOM 缓存统一放 `dom`，局部状态放 `state`，设置项键名用小驼峰。
- 中文用于界面文案与代码注释；标识符、API 名、命令保持原样。
- 新增主题或设置项时：默认值写入 `DEFAULT_SETTINGS`，读取时与默认值合并，避免旧数据出现 `undefined`。

## 测试指南

- 改动后执行：`node --check assets/app.js` + `scripts/capture.ps1` 并人工查看截图。
- 重点回归：滚动起停与到底停止、拖拽定位后自动续播、镜像翻转、主题切换、抽屉实时改参、完成态三动作、窄屏（375px）无横向溢出。
- 调试参数：`?reset=1` 清空本地数据，`?panel=1`/`?sheet=1`/`?finish=1` 展开对应界面，`?bold=1`/`?ls=3`/`?font=serif` 覆盖字体设置。Chrome 会缓存旧 JS，验证前先清 `.chrome-capture` profile。
- 发布到 GitHub Pages 时，仓库根目录必须保留 `CNAME`（自定义域名），缺失会导致域名绑定失效。
- 无自动化测试框架；新增逻辑保持函数纯度，便于后续接入 Vitest。

## 提交与合并请求规范

- 提交信息采用 Conventional Commits：`feat(prompter): 支持白底黑字主题`、`fix: 修正高亮行坐标`。标题 ≤ 72 字符。
- PR 需说明改动动机、影响范围，界面改动附 `artifacts/` 下的移动端截图。
- 合并前须通过语法检查与截图验证。

## iPhone 适配与安全配置

- 保持 `viewport-fit=cover`、`user-scalable=no` 与安全区内边距；`[hidden]` 需显式 `display:none`，组件的 `display:flex` 会覆盖 `hidden` 属性。
- 提词页依赖 Wake Lock 与 Service Worker，两者均需 HTTPS 或 localhost 生效。
- 数据仅存于浏览器 `localStorage`，不上传服务器；键名统一 `teleprompter.` 前缀。