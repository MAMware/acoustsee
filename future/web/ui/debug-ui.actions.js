import { createButton } from './debug-ui.controls.js';
import { getWorkerStats } from '../debug/worker-monitor.js';

// Create action buttons and wire up their event handlers. Keeps debug-ui.js smaller.
export function createAndWireActions(actionsContainer, deps) {
  const { engine, DOM, getAudioDiagnostics, debugLog, settings, skipDiagnostics = false } = deps;

  const startStopBtn = createButton('Start/Stop Processing');
  const emitTestNoteBtn = createButton('Emit Test Note');
  const resumeAudioBtn = createButton('Resume Audio');
  const logAudioDiagsBtn = createButton('Log Audio Diags');
  const deviceDiagsBtn = createButton('Run Device Diags');
  const audioTestBtn = createButton('Audio Output Test');
  const workerExplorerBtn = createButton('Worker Explorer');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');

  actionsContainer.append(startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, deviceDiagsBtn, audioTestBtn, workerExplorerBtn, saveBtn, loadBtn);

  // Start/Stop Processing
  startStopBtn.querySelector('button').addEventListener('click', async () => {
    try {
      await engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
    } catch (e) {
      console.warn('toggleProcessing failed, falling back to start/stop', e);
      const isProcessing = engine.getState ? engine.getState().isProcessing : false;
      if (isProcessing) {
        await engine.dispatch('stopProcessing', { videoEl: DOM.videoFeed });
      } else {
        await engine.dispatch('startProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
      }
    }
  });

  // Emit test note
  emitTestNoteBtn.querySelector('button').addEventListener('click', async () => {
    try {
      await engine.dispatch('playTestNote', { pitch: 440 });
    } catch (err) {
      console.error('playTestNote failed', err);
    }
  });

  // Resume audio and update badge
  resumeAudioBtn.querySelector('button').addEventListener('click', async () => {
    try {
      const res = await engine.dispatch('resumeAudio');
      const msg = res?.ok ? `Audio resumed: ${res.state}` : `Resume failed: ${res?.error || 'unknown'}`;
      debugLog('INFO', msg);
      try {
        const diags = getAudioDiagnostics();
        const badge = document.getElementById('audio-state-badge');
        if (badge) {
          badge.textContent = diags.audioContextState;
          badge.style.background = diags.audioContextState === 'running' ? '#2ecc71' : '#e74c3c';
        }
      } catch (e) { /* ignore */ }
    } catch (e) { console.error('resumeAudio dispatch failed', e); }
  });

  // Log audio diagnostics
  logAudioDiagsBtn.querySelector('button').addEventListener('click', () => {
    try {
      const diags = getAudioDiagnostics();
      console.log('Audio diagnostics:', diags);
      debugLog('INFO', `Audio diags: ${JSON.stringify(diags)}`);
    } catch (e) { console.error('Failed to get audio diags', e); }
  });

  // Device diagnostics (enumerateDevices, permission, resumeAudio, getUserMedia)
  deviceDiagsBtn.querySelector('button').addEventListener('click', async () => {
    const ts = new Date().toISOString();
    if (skipDiagnostics) {
      debugLog('INFO', `Device Diags: skipped (passive debug mode) at ${ts}`);
      return;
    }
    debugLog('INFO', `Device Diags: starting at ${ts}`);
    const report = { timestamp: ts, enumerateDevices: null, resumeAudio: null, micRequest: null, permissionState: null };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        report.enumerateDevices = devices.map(d => ({ kind: d.kind, label: d.label || '(hidden)', deviceId: d.deviceId }));
        debugLog('DEBUG', `Enumerated ${report.enumerateDevices.length} devices`);
        debugLog('DEBUG', `Devices: ${JSON.stringify(report.enumerateDevices)}`);
      } catch (e) {
        report.enumerateDevices = { error: e?.message || String(e) };
        debugLog('WARN', `enumerateDevices failed: ${report.enumerateDevices.error}`);
      }
    } else {
      report.enumerateDevices = { error: 'enumerateDevices not available' };
      debugLog('WARN', 'navigator.mediaDevices.enumerateDevices not available');
    }

    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const p = await navigator.permissions.query({ name: 'microphone' });
          report.permissionState = p.state || null;
          debugLog('DEBUG', `Microphone permission state: ${report.permissionState}`);
        } catch (e) {
          report.permissionState = { error: e?.message || String(e) };
        }
      }
    } catch (e) { /* best-effort */ }

    try {
      const res = await engine.dispatch('resumeAudio');
      report.resumeAudio = res || { ok: false, error: 'no-response' };
      debugLog(res?.ok ? 'INFO' : 'WARN', `resumeAudio result: ${JSON.stringify(report.resumeAudio)}`);
    } catch (e) {
      report.resumeAudio = { ok: false, error: e?.message || String(e) };
      debugLog('ERROR', `resumeAudio dispatch failed: ${report.resumeAudio.error}`);
    }

    if (skipDiagnostics) {
      report.micRequest = { skipped: true };
      debugLog('INFO', 'getUserMedia: skipped (passive debug mode)');
    } else if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        try {
          const tracks = stream.getAudioTracks ? stream.getAudioTracks().map(t => ({ label: t.label || '(hidden)', kind: t.kind })) : [];
          report.micRequest = { success: true, trackCount: tracks.length, tracks };
          debugLog('INFO', `getUserMedia succeeded, tracks: ${tracks.length}`);
          debugLog('DEBUG', `Mic tracks: ${JSON.stringify(tracks)}`);
        } finally {
          try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        }
      } catch (e) {
        report.micRequest = { success: false, error: e?.message || String(e) };
        debugLog('WARN', `getUserMedia (mic) failed: ${report.micRequest.error}`);
      }
    } else {
      report.micRequest = { error: 'getUserMedia not available' };
      debugLog('WARN', 'navigator.mediaDevices.getUserMedia not available');
    }

    try {
      const summary = {
        timestamp: report.timestamp,
        devices: Array.isArray(report.enumerateDevices) ? report.enumerateDevices.length : report.enumerateDevices,
        permissionState: report.permissionState,
        resumeOk: !!(report.resumeAudio && report.resumeAudio.ok),
        micSuccess: !!(report.micRequest && report.micRequest.success)
      };
      debugLog('INFO', `Device Diags Summary: ${JSON.stringify(summary)}`);
      debugLog('DEBUG', `Device Diags Full: ${JSON.stringify(report)}`);
    } catch (e) {
      debugLog('ERROR', `Failed to stringify device diags: ${e?.message || String(e)}`);
    }
  });

  // Audio output test
  audioTestBtn.querySelector('button').addEventListener('click', async () => {
    try {
      const ok = window.confirm('Play a short test tone now? Please lower your volume or wear headphones. Continue?');
      if (!ok) { debugLog('INFO', 'Audio test cancelled by user'); return; }
      debugLog('INFO', 'Audio test: user confirmed, attempting to resume audio');
      if (!skipDiagnostics) {
        try {
          const res = await engine.dispatch('resumeAudio');
          debugLog(res?.ok ? 'INFO' : 'WARN', `resumeAudio result: ${JSON.stringify(res)}`);
        } catch (e) {
          debugLog('WARN', `resumeAudio dispatch threw: ${e?.message || String(e)}`);
        }
        try {
          const playRes = await engine.dispatch('playTestNote', { pitch: 880 });
          debugLog('INFO', `playTestNote dispatched: ${JSON.stringify(playRes)}`);
        } catch (e) {
          debugLog('ERROR', `playTestNote failed: ${e?.message || String(e)}`);
        }
      } else {
        debugLog('INFO', 'Audio test skipped in passive debug mode');
      }
    } catch (e) {
      debugLog('ERROR', `Audio test failed: ${e?.message || String(e)}`);
    }
  });

  // Save / Load
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));

  // --- Video Preview framed panel (styled to match other debug sections) ---
  try {
    const vp = document.createElement('div');
    vp.style.cssText = 'border:1px solid #333;padding:8px;margin-top:10px;background:#0b0b0b;color:#ddd;border-radius:6px;';
    vp.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;">Video Preview</div>`;
    const videoWrap = document.createElement('div');
    videoWrap.style.cssText = 'background:#000;border:1px solid #222;padding:6px;border-radius:4px;display:flex;align-items:center;justify-content:center;height:140px;overflow:hidden;';
    const preview = document.createElement('video');
    preview.autoplay = true; preview.muted = true; preview.playsInline = true;
    preview.style.cssText = 'max-width:100%;max-height:100%;border-radius:4px;object-fit:cover;';
    try {
      if (DOM && DOM.videoFeed && DOM.videoFeed.srcObject) {
        preview.srcObject = DOM.videoFeed.srcObject;
      } else if (DOM && DOM.videoFeed && DOM.videoFeed.currentSrc) {
        preview.src = DOM.videoFeed.currentSrc;
      }
    } catch (e) {}
    videoWrap.appendChild(preview);
    vp.appendChild(videoWrap);
    actionsContainer.appendChild(vp);
    vp.__previewEl = preview;
  } catch (e) {}

  // --- Worker Explorer UI ---
  (function workerExplorer() {
    const panel = document.createElement('div');
    panel.id = 'worker-explorer-panel';
    panel.style.cssText = 'margin-top:8px;padding:8px;border:1px solid #333;background:#070707;color:#ddd;max-height:260px;overflow:auto;font-size:12px;display:none;border-radius:6px;';
    actionsContainer.append(panel);

    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    infoRow.innerHTML = `<div style="opacity:0.8;font-size:12px">Shows worker-reported CPU (busy %) and optional heap info.</div>`;
    panel.appendChild(infoRow);

    const content = document.createElement('div');
    panel.appendChild(content);

    const history = new Map();
    function ensureHist(id) { if (!history.has(id)) history.set(id, { util: [], memory: [] }); return history.get(id); }

    function renderCharts() {
      const stats = (typeof getWorkerStats === 'function') ? getWorkerStats() : (window.__acoustseeGetWorkerStats ? window.__acoustseeGetWorkerStats() : []);
      content.innerHTML = '';
      if (!stats || stats.length === 0) { content.innerHTML = '<div style="opacity:0.7">No registered workers</div>'; return; }
      stats.forEach(s => {
        const last = s.last;
        const h = ensureHist(s.id);
        if (last) { h.util.push(last.util ?? 0); if (h.util.length > 60) h.util.shift(); if (last.memory && typeof last.memory.usedJSHeapSize === 'number') { h.memory.push(last.memory.usedJSHeapSize); if (h.memory.length > 60) h.memory.shift(); } } else { h.util.push(0); if (h.util.length > 60) h.util.shift(); }

        const row = document.createElement('div'); row.style.cssText = 'padding:6px;border-bottom:1px solid #111;margin-bottom:6px;';
        const title = document.createElement('div'); title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
        title.innerHTML = `<div style="font-weight:600">${s.name}</div><div style="font-size:11px;opacity:0.8">${last ? (last.util ?? '-') + '%' : 'no data'}</div>`;
        row.appendChild(title);

        const c = document.createElement('canvas'); c.width = 320; c.height = 48; c.style.cssText = 'display:block;background:#020202;border:1px solid #111;border-radius:4px;margin-bottom:6px;width:100%;height:48px;';
        try {
          const ctx = c.getContext('2d'); ctx.fillStyle='#020202'; ctx.fillRect(0,0,c.width,c.height);
          ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.beginPath(); for (let i=1;i<=3;i++){ const y=(c.height/4)*i; ctx.moveTo(0,y); ctx.lineTo(c.width,y);} ctx.stroke();
          ctx.strokeStyle='#29b573'; ctx.lineWidth=2; ctx.beginPath(); const arr=h.util.slice(-60); for (let i=0;i<arr.length;i++){ const x=(i/(Math.max(1,arr.length-1)))*(c.width-6)+3; const v=arr[i]/100; const y=c.height-(v*(c.height-6))-3; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.fillStyle='rgba(41,181,115,0.08)'; ctx.lineTo(c.width-3,c.height-3); ctx.lineTo(3,c.height-3); ctx.closePath(); ctx.fill(); if (last && typeof last.util==='number'){ ctx.fillStyle='#bfead6'; ctx.font='12px system-ui, sans-serif'; ctx.fillText(`${last.util}%`,6,14); }
        } catch (e) {}
        row.appendChild(c);

        if (h.memory && h.memory.length > 0) {
          const cm = document.createElement('canvas'); cm.width=320; cm.height=28; cm.style.cssText='display:block;background:#020202;border:1px solid #111;border-radius:4px;margin-bottom:6px;width:100%;height:28px;';
          try {
            const mctx = cm.getContext('2d'); mctx.fillStyle='#020202'; mctx.fillRect(0,0,cm.width,cm.height); const max = Math.max(...h.memory,1); mctx.fillStyle='#4aa3ff'; const arrm=h.memory.slice(-60); for (let i=0;i<arrm.length;i++){ const x=(i/(Math.max(1,arrm.length-1)))*(cm.width-4)+2; const v=arrm[i]/max; const hgt=Math.max(1,Math.round(v*(cm.height-6))); mctx.fillRect(x,cm.height-3,2,-hgt); }
          } catch (e) {}
          row.appendChild(cm);
        }
        content.appendChild(row);
      });
    }

    let explorerInterval = null;
    function startExplorerPolling(){ if (explorerInterval) return; renderCharts(); explorerInterval=setInterval(renderCharts,1000); }
    function stopExplorerPolling(){ if (!explorerInterval) return; clearInterval(explorerInterval); explorerInterval=null; }

    workerExplorerBtn.querySelector('button').addEventListener('click', () => {
      if (panel.style.display === 'none') { panel.style.display = 'block'; startExplorerPolling(); } else { panel.style.display = 'none'; stopExplorerPolling(); }
    });
  })();

  return { startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, deviceDiagsBtn, audioTestBtn, saveBtn, loadBtn };
}
