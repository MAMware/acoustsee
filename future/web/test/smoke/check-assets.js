#!/usr/bin/env node
// Smoke test: serve the future/web directory and fetch key assets to validate
// that they exist and are served with appropriate content-type (not text/html)

const http = require('http');
const { spawn } = require('child_process');
const { join } = require('path');
const fetch = require('node-fetch');

const WEB_DIR = join(__dirname, '..', '..'); // future/web
const PORT = process.env.PORT || 9000;
const ASSETS = [
  '/boot.js',
  '/ui/dev-panel/dev-panel.css',
  '/video/workers/frame-worker.js',
  '/video/workers/motion-worker.js'
];

function startStaticServer() {
  // Prefer python http.server if available (simple and reliable), else use a tiny node static server.
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-m', 'http.server', PORT], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let started = false;
    py.stdout.on('data', (d) => {
      if (!started) {
        started = true;
        resolve({ proc: py, method: 'python' });
      }
    });
    py.on('error', (err) => {
      // fallback to node server
      const server = http.createServer((req, res) => {
        const fs = require('fs');
        const p = require('path').join(WEB_DIR, req.url.split('?')[0]);
        fs.readFile(p, (err, data) => {
          if (err) {
            res.statusCode = 404; res.end('Not Found');
            return;
          }
          // minimal content-type based on extension
          const ext = p.split('.').pop();
          const map = { js: 'application/javascript', css: 'text/css' };
          res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
          res.end(data);
        });
      });
      server.listen(PORT, () => resolve({ proc: server, method: 'node' }));
    });
    // safety: if python exits quickly, fallback
    py.on('exit', (code) => {
      if (!started) {
        // spawn node server
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
  console.log('Starting smoke check for assets against', `http://localhost:${PORT}`);
  const server = await startStaticServer();
  const base = `http://localhost:${PORT}`;
  let failed = false;
  for (const asset of ASSETS) {
    const url = base + asset;
    process.stdout.write(`Checking ${asset} ... `);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.status !== 200) {
        console.log(`FAIL status=${res.status}`);
        failed = true;
        continue;
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      // We consider text/html or text/plain as suspicious for JS/CSS/worker assets
      if (ct.includes('text/html') || ct.includes('text/plain')) {
        console.log(`FAIL content-type=${ct}`);
        failed = true;
        continue;
      }
      console.log(`OK content-type=${ct}`);
    } catch (e) {
      console.log('ERR', e && e.message ? e.message : e);
      failed = true;
    }
  }
  // Teardown
  try {
    if (server.method === 'python') server.proc.kill(); else server.proc.close();
  } catch (_) {}
  if (failed) process.exit(2);
  console.log('All assets OK');
}

runCheck().catch((e) => { console.error('Smoke check failed', e); process.exit(1); });
