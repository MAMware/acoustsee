import { createButton } from './debug-ui.controls.js';

// Create action buttons and wire up their event handlers. Keeps debug-ui.js smaller.
export function createAndWireActions(actionsContainer, deps) {
  const { engine, DOM, getAudioDiagnostics, debugLog, settings } = deps;

  const startStopBtn = createButton('Start/Stop Processing');
  const emitTestNoteBtn = createButton('Emit Test Note');
  const resumeAudioBtn = createButton('Resume Audio');
  const logAudioDiagsBtn = createButton('Log Audio Diags');
  const deviceDiagsBtn = createButton('Run Device Diags');
  const audioTestBtn = createButton('Audio Output Test');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');

  actionsContainer.append(startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, deviceDiagsBtn, audioTestBtn, saveBtn, loadBtn);

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

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
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
    } catch (e) {
      debugLog('ERROR', `Audio test failed: ${e?.message || String(e)}`);
    }
  });

  // Save / Load
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));

  return { startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, deviceDiagsBtn, audioTestBtn, saveBtn, loadBtn };
}
