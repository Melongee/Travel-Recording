import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// 只提供构建好的前端文件，没有照片扫描或其他后端业务。
const directory = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const configuredPort = process.env.PORT;
let port = Number(configuredPort || 4173);
let address = `http://127.0.0.1:${port}`;
let portRetries = 0;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('PORT 需要是 1024～65535 之间的端口。'); process.exit(1);
}
if (!existsSync(resolve(directory, 'index.html'))) {
  console.error('没有找到构建结果。请先在 demo 目录运行 npm install 和 npm run build。'); process.exit(1);
}
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};
const server = createServer((request, response) => {
  const host = request.headers.host || '';
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', address).pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  let filename = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
  const localPath = relative(directory, filename);
  if (localPath === '..' || localPath.startsWith(`..${sep}`) || localPath.includes('\0')) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  if (!existsSync(filename) && !extname(pathname)) filename = resolve(directory, 'index.html');
  if (!existsSync(filename) || !statSync(filename).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filename).toLowerCase()] || 'application/octet-stream',
    'Content-Length': statSync(filename).size,
    'Cache-Control': extname(filename) === '.html' ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(filename);
  stream.on('error', () => response.destroy()); stream.pipe(response);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && !configuredPort && portRetries < 10) {
    console.log(`端口 ${port} 已占用，尝试 ${port + 1}…`);
    port += 1;
    portRetries += 1;
    address = `http://127.0.0.1:${port}`;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用。如果 Demo 已经打开，可直接访问 ${address}；也可设置 PORT 后重试。` : `启动失败：${error.message}`);
  process.exit(1);
});
server.on('listening', () => {
  console.log(`\n旅迹 Demo 已启动：${address}\n关闭此窗口或按 Ctrl+C 即可停止。\n`);
  if (process.argv.includes('--open') && !process.argv.includes('--no-open')) {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', address] : [address];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`请在浏览器打开 ${address}`)); child.unref();
  }
});
server.listen(port, '127.0.0.1');
