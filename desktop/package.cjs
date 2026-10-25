'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const meta = require('./package.json');
const runtime = require('./runtime-lock.json');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'artifacts', `desktop-build-${stamp}`);
const stage = path.join(output, 'shell');
fs.mkdirSync(stage, { recursive: true });
for (const file of ['main.cjs', 'service.cjs', 'waiting.html']) fs.copyFileSync(path.join(__dirname, file), path.join(stage, file));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ ...meta, scripts: undefined, devDependencies: undefined }));

(async () => {
  const { packager } = await import('@electron/packager');
  const [bundle] = await packager({ dir: stage, out: output, name: '旅迹', executableName: '旅迹',
    icon: path.join(__dirname, 'icon.ico'),
    platform: 'win32', arch: 'x64', electronVersion: runtime.electron.version, electronZipDir: path.join(root, '.tools'),
    asar: true, prune: false, appVersion: meta.version, buildVersion: meta.version,
    win32metadata: { CompanyName: 'Travel Recording', FileDescription: meta.description, ProductName: '旅迹', InternalName: 'TravelRecording' } });
  // Explicit file copies also let us fail on any incomplete runtime assembly.
  function copyRuntime(source, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name), to = path.join(target, entry.name);
      if (entry.isDirectory()) copyRuntime(from, to);
      else fs.copyFileSync(from, to);
    }
  }
  copyRuntime(path.join(root, '.tools', 'desktop-jre', 'jdk-21.0.12.1+1-jre'), path.join(bundle, 'resources', 'java'));
  for (const required of ['bin/java.exe', 'bin/server/jvm.dll', 'lib/modules', 'legal/java.base/LICENSE', 'NOTICE', 'release']) {
    const file = path.join(bundle, 'resources', 'java', required);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`Incomplete bundled Java: ${required}`);
  }
  fs.mkdirSync(path.join(bundle, 'resources', 'server'));
  fs.copyFileSync(path.join(root, 'backend', 'target', 'travel-recording-0.1.0.jar'), path.join(bundle, 'resources', 'server', 'travel-recording.jar'));
  fs.copyFileSync(path.join(__dirname, '使用说明.txt'), path.join(bundle, '使用说明.txt'));
  const licenses = path.join(bundle, 'licenses');
  fs.mkdirSync(licenses);
  fs.copyFileSync(path.join(__dirname, 'runtime-lock.json'), path.join(licenses, 'runtimes.json'));
  for (const file of ['cities-LICENSE.txt', 'assets-sources.json']) fs.copyFileSync(path.join(root, 'frontend', 'public', 'assets', file), path.join(licenses, file));
  fs.writeFileSync(path.join(licenses, '地图来源.txt'), '省市底图：cn-atlas / CTAmap 2023，固定提交 6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f。作者 Amll / BarbarossaWang；底层 ruiduobao/shengshixian.com。ISC / MIT，许可见 cities-LICENSE.txt。\n道路：Natural Earth contributors，公共领域 https://www.naturalearthdata.com/about/terms-of-use/ ，源及哈希见 assets-sources.json。\n仅供旅行记录，不用于导航，不是经审定的标准地图。\n');
  // Runtime JS dependencies only; copy their original license/notice text and exact source metadata.
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'package-lock.json')));
  const inventory = [];
  for (const [relative, item] of Object.entries(lock.packages)) {
    if (!relative || item.dev) continue;
    const dir = path.join(root, 'frontend', relative);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
    const dest = path.join(licenses, 'frontend', pkg.name.replaceAll('/', '__'));
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(dir)) if (/^(licen[cs]e|notice|copying)/i.test(file) && fs.statSync(path.join(dir, file)).isFile()) fs.copyFileSync(path.join(dir, file), path.join(dest, file));
    inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository, archive: item.resolved, integrity: item.integrity });
  }
  fs.writeFileSync(path.join(licenses, 'frontend-dependencies.json'), JSON.stringify(inventory, null, 2));
  fs.writeFileSync(path.join(licenses, '运行时来源.txt'), 'Electron: LICENSE / LICENSES.chromium.html in program root.\nJava: resources/java/legal and NOTICE retained without pruning; exact source and binary URLs / SHA256 in runtimes.json. Temurin licensing: https://adoptium.net/docs/faq\nBackend dependencies remain original nested JARs with META-INF notices. Their license inventory is in backend-dependencies.txt.\n');
  fs.copyFileSync(path.join(root, 'backend', 'target', 'generated-resources', 'licenses', 'THIRD-PARTY.txt'), path.join(licenses, 'backend-dependencies.txt'));
  const manifest = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else manifest.push({ file: path.relative(bundle, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
    }
  }
  walk(bundle);
  fs.writeFileSync(path.join(bundle, 'package-manifest.json'), JSON.stringify({ version: meta.version, platform: 'win32-x64', runtime, files: manifest }, null, 2));
  fs.writeFileSync(path.join(root, '.tools', 'desktop-bundle-path.txt'), bundle);
  console.log(bundle);
})().catch(error => { console.error(error); process.exitCode = 1; });
