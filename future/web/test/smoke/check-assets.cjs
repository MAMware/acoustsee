#!/usr/bin/env node
// Smoke test (CommonJS): serve the future/web directory and fetch key assets
// ensuring they are present and not served as HTML.

const http = require('http');
const { spawn } = require('child_process');
const { join } = require('path');
let fetch;
try { fetch = globalThis.fetch || require('node-fetch'); } catch (e) { fetch = null; }

const WEB_DIR = join(__dirname, '..', '..'); // future/web
const PORT = process.env.PORT || 9000;
const BASE_PATH = process.env.BASE_PATH || ''; // e.g. '/acoustsee/future/web'
const ASSETS = [
  `${BASE_PATH}/boot.js`,
  `${BASE_PATH}/ui/dev-panel/dev-panel.css`,
  `${BASE_PATH}/video/workers/frame-worker.js`,
  `${BASE_PATH}/video/workers/motion-worker.js`
];

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-m', 'http.server', PORT], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let started = false;
    // Some environments (or Python versions) may not emit stdout immediately.
    // Probe the server endpoint after a short delay; if it responds, consider
    // the python server started. Otherwise fall back to the node server.
    const probe = () => {
      const http = require('http');
      const req = http.request({ hostname: 'localhost', port: PORT, path: '/', method: 'GET', timeout: 400 }, (res) => {
        if (!started) { started = true; resolve({ proc: py, method: 'python' }); }
        res.resume();
      });
      req.on('error', () => { /* ignore; we'll fallback later if needed */ });
      req.on('timeout', () => { req.destroy(); });
      req.end();
    };
    // attempt immediate probe and then once more after a short delay
    setTimeout(probe, 200);
    setTimeout(probe, 700);
    py.on('error', (err) => {
      // fallback to tiny node server
      const server = http.createServer((req, res) => {
        const fs = require('fs');
        const p = require('path').join(WEB_DIR, req.url.split('?')[0]);
        fs.readFile(p, (err, data) => {
          if (err) { res.statusCode = 404; res.end('Not Found'); return; }
          const ext = p.split('.').pop();
          const map = { js: 'application/javascript', css: 'text/css' };
          res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
          res.end(data);
        });
      });
      server.listen(PORT, () => resolve({ proc: server, method: 'node' }));
    });
    // If python exits without the probe marking it started, fallback to node server.
    py.on('exit', (code) => {
      if (!started) {
        const server = http.createServer((req, res) => {
          const fs = require('fs');
          const p = require('path').join(WEB_DIR, req.url.split('?')[0]);
          fs.readFile(p, (err, data) => {
            if (err) { res.statusCode = 404; res.end('Not Found'); return; }
            const ext = p.split('.').pop();
            const map = { js: 'application/javascript', css: 'text/css' };
            res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
            res.end(data);
          });
        });
        server.listen(PORT, () => resolve({ proc: server, method: 'node' }));
      }
    });
  });
}

async function runCheck() {
  if (!fetch) {
    try { fetch = require('node-fetch'); } catch (e) { console.error('fetch not available; please install node-fetch or run under Node 18+ with global fetch.'); process.exit(1); }
  }
  console.log('Starting smoke check for assets against', `http://localhost:${PORT}`);
  const server = await startStaticServer();
  const base = `http://localhost:${PORT}`;
  let failed = false;
  for (const asset of ASSETS) {
    const url = base + asset;
    process.stdout.write(`Checking ${asset} ... `);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.status !== 200) { console.log(`FAIL status=${res.status}`); failed = true; continue; }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('text/plain')) { console.log(`FAIL content-type=${ct}`); failed = true; continue; }
      console.log(`OK content-type=${ct}`);
    } catch (e) { console.log('ERR', e && e.message ? e.message : e); failed = true; }
  }
  try { if (server.method === 'python') server.proc.kill(); else server.proc.close(); } catch (_) {}
  if (failed) process.exit(2);
  console.log('All assets OK');
}

runCheck().catch((e) => { console.error('Smoke check failed', e); process.exit(1); });
