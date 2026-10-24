// End-to-end offline check in headless Chrome (temporary profile, your own Chrome is untouched).
// 1. load the app and let the service worker install
// 2. stop the web server and cold-start the app: it must still load and save a set
// 3. serve a changed sw.js: the "Update available" banner must appear and reload into the new version
// Run: node tools/browser-check.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8091;
const DBG = 9333;
const root = fileURLToPath(new URL('..', import.meta.url));
const swPath = join(root, 'sw.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
const startServer = async () => {
  server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://localhost:${PORT}/sw.js`); return; } catch { await sleep(150); }
  }
};
const stopServer = async () => { server.kill(); await sleep(300); };

const originalSw = readFileSync(swPath, 'utf8');
const profile = mkdtempSync(join(tmpdir(), 'gym-check-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };

try {
  await startServer();
  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); break; } catch { await sleep(250); }
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
    return r.result.result.value;
  };
  const go = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 896, deviceScaleFactor: 2, mobile: true });

  // 1. first visit
  await go(`http://localhost:${PORT}/`);
  await evaluate('navigator.serviceWorker.ready.then(() => true)');
  await go(`http://localhost:${PORT}/`);
  check('service worker controls the page', await evaluate('!!navigator.serviceWorker.controller'));
  const cacheCount = await evaluate("caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys())))).then(a => a.flat().length)");
  check('app files precached', cacheCount >= 20, `(${cacheCount} files)`);
  check('home screen renders', (await evaluate('document.body.innerText')).includes('Sample Block'));

  // 2. offline cold start: server stopped, new navigation
  await stopServer();
  await go(`http://localhost:${PORT}/#/day/6/2`);
  const text = await evaluate('document.body.innerText');
  check('cold start with server stopped shows the workout', text.includes('Incline DB press'));
  await evaluate(`(() => { const i = document.querySelector('#ex-1 .set-row[data-set="0"] [data-field="weight"]'); i.value = '31'; i.dispatchEvent(new Event('input', {bubbles: true}));
    document.querySelector('#ex-1 .set-row[data-set="0"] .tick').click(); return true; })()`);
  await sleep(300);
  await go(`http://localhost:${PORT}/#/day/6/2`);
  const saved = await evaluate(`document.querySelector('#ex-1 .set-row[data-set="0"] [data-field="weight"]').value + '|' + document.querySelector('#ex-1 .set-row[data-set="0"] .tick').getAttribute('aria-pressed')`);
  check('set logged offline survives a reload', saved === '31|true', `(${saved})`);
  check('offline indicator code present', await evaluate("!!document.querySelector('.offline')"));

  // 3. update flow
  writeFileSync(swPath, originalSw.replace(/const VERSION = '[^']*';/, "const VERSION = 'check-update';"));
  await startServer();
  await evaluate('navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => true)');
  await sleep(1500);
  check('"Update available" banner appears', await evaluate("!document.getElementById('update-banner').hidden"));
  await evaluate("document.getElementById('update-banner').click(); true");
  await sleep(2000);
  const keys = await evaluate('caches.keys()');
  check('tapping the banner activates the new version', keys.includes('gym-tracker-check-update') && keys.length === 1, JSON.stringify(keys));
  const still = await evaluate(`location.hash = '#/day/6/2'; new Promise(r => setTimeout(() => r(document.querySelector('#ex-1 .set-row[data-set="0"] [data-field="weight"]').value), 600))`);
  check('logged data kept after update', still === '31');
  ws.close();
} catch (e) {
  console.error(e);
  failures++;
} finally {
  writeFileSync(swPath, originalSw);
  if (server) server.kill();
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
