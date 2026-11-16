/**
 * 本地静态服务器：用于在 iPhone 上通过局域网访问提词器。
 *
 * 用法：node serve.js [端口]
 * 探针：GET /health 返回 ok，用于区分「网络不通」与「页面异常」
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

function listLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach((name) => {
    nets[name].forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) ips.push({ address: net.address, iface: name });
    });
  });
  return ips;
}

function log(message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log('[' + time + '] ' + message);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, rel);
  const from = req.socket.remoteAddress;

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    log('探针 ' + from + ' GET /health -> 200');
    return;
  }

  // 防止路径穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    log('拒绝 ' + from + ' GET ' + urlPath + ' -> 403');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      log('缺失 ' + from + ' GET ' + urlPath + ' -> 404');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    }).end(data);
    log('命中 ' + from + ' GET ' + urlPath + ' -> 200 (' + data.length + 'B)');
  });
});

server.on('error', (err) => {
  console.error('服务器错误：', err.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  log('提词器本地服务已启动');
  log('  本机： http://localhost:' + PORT);
  listLanIps().forEach((ip) => {
    log('  iPhone（需与电脑同一 Wi-Fi）： http://' + ip.address + ':' + PORT);
  });
  log('  连通性探针： http://<上面IP>:' + PORT + '/health');
  log('提示：若 iPhone 打不开，请确认 ① 手机与电脑同一 Wi-Fi ② 未连 VPN/蜂窝 ③ Windows 防火墙已放行 Node.js');
});