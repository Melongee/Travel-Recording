'use strict';
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createInterface } = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function identity(origin, token) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${origin}/api/desktop/identity`, { headers: { 'X-Travel-Desktop': token }, timeout: 3000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', data => { body += data; if (body.length > 8192) req.destroy(new Error('身份响应过大')); });
      res.on('end', () => {
        try { if (res.statusCode !== 200) throw new Error('服务身份校验失败'); resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('服务身份校验超时')));
    req.on('error', reject);
  });
}

function launchService({ java, jar, dataDir, config, onExit = () => {}, timeout = 90000 }) {
  fs.mkdirSync(dataDir, { recursive: true });
  dataDir = fs.realpathSync.native(dataDir);
  const logs = path.join(dataDir, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const env = { ...process.env, TRAVEL_DESKTOP_TOKEN: token };
  // Runtime/configuration is explicit; inherited development options must not inject agents or secrets.
  for (const key of Object.keys(env)) {
    if (/^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH|SPRING_.*|TRAVEL_(?!DESKTOP_TOKEN).*|TIANDITU_KEY)$/i.test(key)) delete env[key];
  }
  const fd = fs.openSync(path.join(logs, 'desktop-service.log'), 'a');
  const child = spawn(java, ['-Xmx1024m', '-Djava.net.useSystemProxies=true', '-jar', jar,
    '--server.address=127.0.0.1', '--server.port=0', `--app.data-dir=${dataDir}`,
    `--spring.config.import=optional:${require('node:url').pathToFileURL(config).href}`],
  { cwd: path.dirname(config), env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let exited = false;
  let stopping = false;
  child.stdin.on('error', () => {}); // Exit may race with a window close.
  child.stdout.on('data', data => fs.writeSync(fd, data));
  child.stderr.on('data', data => fs.writeSync(fd, data));
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    exited = true; fs.closeSync(fd); resolve({ code, signal }); onExit({ code, signal, stopping });
  }));
  const stop = () => {
    stopping = true;
    if (!exited && !child.stdin.destroyed) child.stdin.end('shutdown\n');
    return closed;
  };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error('启动超过 90 秒，请查看日志；程序正在安全退出。')); }, timeout);
    const fail = error => { clearTimeout(timer); reject(error); };
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`服务在就绪前退出（${code}）。图库可能正在使用，详情见日志。`)));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', async line => {
      const match = /^TRAVEL_DESKTOP_READY=(\d+)$/.exec(line);
      if (!match) return;
      lines.close();
      try {
        const origin = `http://127.0.0.1:${Number(match[1])}`;
        const result = await identity(origin, token);
        if (result.app !== 'travel-recording' || result.pid !== child.pid ||
            result.dataDir.toLowerCase() !== dataDir.toLowerCase()) throw new Error('服务进程或图库身份不匹配');
        clearTimeout(timer);
        if (!stopping && !exited) resolve(origin);
      } catch (error) { stop(); fail(error); }
    });
  });
  return { child, ready, stop, closed, dataDir };
}
module.exports = { launchService, identity };
