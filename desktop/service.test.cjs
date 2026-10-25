'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchService, identity } = require('./service.cjs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const java = process.env.TRAVEL_TEST_JAVA || path.join(root, '.tools', 'jdk-21.0.12.1+1', 'bin', 'java.exe');
const jar = path.join(root, 'backend', 'target', 'travel-recording-0.1.0.jar');

test('real child: challenge, shared-library rejection, graceful pipe exit and parent EOF', { timeout: 150000 }, async () => {
  const fixture = fs.mkdtempSync(path.join(root, 'artifacts', 'desktop-service-'));
  const config = path.join(fixture, 'application.properties');
  fs.writeFileSync(config, 'app.geography.offline=true\n');
  const options = { java, jar, config, dataDir: path.join(fixture, '中文 数据') };
  const service = launchService(options);
  try {
    const origin = await service.ready;
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.notEqual(new URL(origin).port, '8080');
    await assert.rejects(identity(origin, 'wrong'), /身份/);
    assert.equal((await fetch(`${origin}/api/overview`)).status, 200);
    assert.equal((await fetch(`${origin}/api/scans`, { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(`${origin}/api/overview`, { headers: { Origin: 'http://other.invalid' } })).status, 403);
    // Ordinary script-style Java entry on another port cannot open a desktop-owned library.
    const other = spawn(java, ['-jar', jar, '--server.port=0', `--app.data-dir=${service.dataDir}`, `--spring.config.import=optional:${require('node:url').pathToFileURL(config).href}`], { windowsHide: true, stdio: 'ignore' });
    const exitCode = await new Promise((resolve, reject) => { other.once('exit', resolve); other.once('error', reject); });
    assert.notEqual(exitCode, 0);
    assert.equal((await fetch(`${origin}/api/overview`)).status, 200);
  } finally { assert.equal((await service.stop()).code, 0); }
  const reopened = launchService(options);
  await reopened.ready;
  // Closing the parent's private pipe without a shutdown command represents parent death.
  reopened.child.stdin.destroy();
  assert.equal((await reopened.closed).code, 0);
  const third = launchService(options);
  await third.ready;
  assert.equal((await third.stop()).code, 0);
});
