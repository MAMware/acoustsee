/**
 * Telemetry Dashboard - Workflow 3 Implementation
 * 
 * Real-time metrics display with canvas-based line charts for:
 * - Video latency and jitter
 * - Dropped frames and per-worker breakdown
 * - Audio cue routing duration
 * - Audio/video sync delta
 * - System resources (CPU, memory, GPU)
 * 
 * Architecture:
 * - Canvas-based rendering (no external deps like Chart.js)
 * - 300-frame history (5 seconds at 60fps)
 * - 3fps update frequency for efficiency
 * - Subscribes to all telemetry events from Tasks 3-4
 */

export class TelemetryDashboard {
  constructor(engine, containerElement = null) {
    this.engine = engine;
    this.container = containerElement || document.getElementById('dev-panel-main-content');
    this.metrics = {
      frameLatencies: [],        // Last 300 frames
      jitterValues: [],          // Rolling jitter calculation
      droppedFrameCount: 0,
      cueReceptions: [],         // Last 300 cues
      syncDeltas: [],            // Last 300 measurements
      lastFrameTime: 0,
      workerTimings: {}
    };

    this.charts = {};
    this.updateInterval = null;
    this.lastUpdateTime = 0;

    if (!this.container) {
      console.warn('TelemetryDashboard: container element not found');
      return;
    }

    this.initializeDashboard();
    this.subscribeToTelemetry();
    this.startUpdateLoop();
  }

  initializeDashboard() {
    // Create dashboard HTML structure if not already present
    let dashboardSection = this.container.querySelector('.telemetry-dashboard-section');
    if (!dashboardSection) {
      dashboardSection = this.createDashboardHTML();
      this.container.appendChild(dashboardSection);
    }

    this.dashboardElement = dashboardSection;
    this.initializeCharts();
  }

  createDashboardHTML() {
    const section = document.createElement('div');
    section.className = 'devpanel-section telemetry-dashboard-section';
    section.innerHTML = `
      <h2 class="section-header">
        <span>Real-Time Telemetry</span>
        <span class="section-header-spacer"></span>
        <button class="collapse-btn" data-target="telemetry-dashboard-content" aria-expanded="true" title="Collapse Telemetry">-</button>
      </h2>
      <div id="telemetry-dashboard-content" class="section-content">
        <!-- Tab Navigation -->
        <div class="telemetry-tabs">
          <button class="telemetry-tab-btn active" data-tab="video">Video</button>
          <button class="telemetry-tab-btn" data-tab="audio">Audio</button>
          <button class="telemetry-tab-btn" data-tab="sync">Sync</button>
          <button class="telemetry-tab-btn" data-tab="resources">Resources</button>
        </div>

        <!-- Video Tab -->
        <div id="telemetry-tab-video" class="telemetry-tab-content active">
          <div class="metrics-container">
            <!-- Frame Latency -->
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-name">Frame Latency</span>
                <span class="metric-value" id="frame-latency-value">—</span>
                <span class="metric-status" id="frame-latency-status">🟡</span>
              </div>
              <canvas id="frame-latency-chart" class="metric-chart" width="400" height="100"></canvas>
              <div class="metric-stats">
                <span>Target: 45ms</span>
                <span id="frame-latency-avg">Avg: —</span>
                <span id="frame-latency-jitter">Jitter: —</span>
              </div>
            </div>

            <!-- Jitter -->
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-name">Frame Jitter</span>
                <span class="metric-value" id="jitter-value">—</span>
                <span class="metric-status" id="jitter-status">🟡</span>
              </div>
              <canvas id="jitter-chart" class="metric-chart" width="400" height="100"></canvas>
              <div class="metric-stats">
                <span>Target: <5ms</span>
                <span id="jitter-min">Min: —</span>
                <span id="jitter-max">Max: —</span>
              </div>
            </div>

            <!-- Dropped Frames -->
            <div class="metric-card metric-counter">
              <div class="metric-header">
                <span class="metric-name">Dropped Frames</span>
                <span class="metric-value" id="dropped-frames-count">0</span>
              </div>
              <div class="counter-text">0% loss (target)</div>
            </div>

            <!-- Per-Worker Breakdown -->
            <div class="metric-card metric-worker-breakdown">
              <div class="metric-header">
                <span class="metric-name">Per-Worker Latency</span>
              </div>
              <div id="worker-breakdown-list" class="worker-list"></div>
            </div>
          </div>
        </div>

        <!-- Audio Tab -->
        <div id="telemetry-tab-audio" class="telemetry-tab-content">
          <div class="metrics-container">
            <!-- Cue Reception -->
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-name">Cue Reception</span>
                <span class="metric-value" id="cue-reception-value">—</span>
                <span class="metric-status" id="cue-reception-status">🟡</span>
              </div>
              <canvas id="cue-reception-chart" class="metric-chart" width="400" height="100"></canvas>
              <div class="metric-stats">
                <span>Target: <5ms</span>
                <span id="cue-reception-avg">Avg: —</span>
              </div>
            </div>

            <!-- Audio Clipping -->
            <div class="metric-card metric-counter">
              <div class="metric-header">
                <span class="metric-name">Audio Clipping</span>
                <span class="metric-value">0</span>
              </div>
              <div class="counter-text">0 events (target)</div>
            </div>

            <!-- Buffer Health -->
            <div class="metric-card metric-gauge">
              <div class="metric-header">
                <span class="metric-name">Buffer Health</span>
                <span class="metric-value" id="buffer-health-value">—</span>
              </div>
              <div class="gauge-bar">
                <div class="gauge-fill" id="buffer-health-bar" style="width: 0%"></div>
              </div>
              <div class="metric-stats">
                <span>Target: >90%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sync Tab -->
        <div id="telemetry-tab-sync" class="telemetry-tab-content">
          <div class="metrics-container">
            <!-- Audio/Video Sync Delta -->
            <div class="metric-card">
              <div class="metric-header">
                <span class="metric-name">A/V Sync Delta</span>
                <span class="metric-value" id="sync-delta-value">—</span>
                <span class="metric-status" id="sync-delta-status">🟡</span>
              </div>
              <canvas id="sync-delta-chart" class="metric-chart" width="400" height="100"></canvas>
              <div class="metric-stats">
                <span>Target: ±2ms</span>
                <span id="sync-delta-avg">Avg: —</span>
              </div>
            </div>

            <!-- Sync Drift Status -->
            <div class="metric-card metric-status-display">
              <div class="metric-header">
                <span class="metric-name">Sync Status</span>
              </div>
              <div id="sync-status-text" class="status-display">Calibrating...</div>
            </div>
          </div>
        </div>

        <!-- Resources Tab -->
        <div id="telemetry-tab-resources" class="telemetry-tab-content">
          <div class="metrics-container">
            <!-- CPU Usage -->
            <div class="metric-card metric-gauge">
              <div class="metric-header">
                <span class="metric-name">CPU Usage</span>
                <span class="metric-value" id="cpu-usage-value">—</span>
              </div>
              <div class="gauge-bar">
                <div class="gauge-fill" id="cpu-usage-bar" style="width: 0%"></div>
              </div>
              <div class="metric-stats">
                <span>Target: <30%</span>
              </div>
            </div>

            <!-- Memory Usage -->
            <div class="metric-card metric-gauge">
              <div class="metric-header">
                <span class="metric-name">Memory Usage</span>
                <span class="metric-value" id="memory-usage-value">—</span>
              </div>
              <div class="gauge-bar">
                <div class="gauge-fill" id="memory-usage-bar" style="width: 0%"></div>
              </div>
              <div class="metric-stats">
                <span>Target: <100MB</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="telemetry-controls">
          <button id="telemetry-pause-btn" class="btn-secondary">⏸ Pause</button>
          <button id="telemetry-export-btn" class="btn-secondary">⬇ Export</button>
          <button id="telemetry-clear-btn" class="btn-tertiary">🗑 Clear</button>
        </div>
      </div>
    `;

    return section;
  }

  initializeCharts() {
    // Canvas-based line charts (no external deps)
    this.charts.frameLatency = new CanvasLineChart(
      this.dashboardElement.querySelector('#frame-latency-chart'),
      { minValue: 0, maxValue: 100, targetLine: 45 }
    );

    this.charts.jitter = new CanvasLineChart(
      this.dashboardElement.querySelector('#jitter-chart'),
      { minValue: 0, maxValue: 20, targetLine: 5 }
    );

    this.charts.cueReception = new CanvasLineChart(
      this.dashboardElement.querySelector('#cue-reception-chart'),
      { minValue: 0, maxValue: 10, targetLine: 5 }
    );

    this.charts.syncDelta = new CanvasLineChart(
      this.dashboardElement.querySelector('#sync-delta-chart'),
      { minValue: -5, maxValue: 5, targetLine: 0 }
    );

    // Wire up tab buttons
    this.dashboardElement.querySelectorAll('.telemetry-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Wire up control buttons
    this.dashboardElement.querySelector('#telemetry-pause-btn')?.addEventListener('click', () => {
      this.togglePause();
    });

    this.dashboardElement.querySelector('#telemetry-export-btn')?.addEventListener('click', () => {
      this.exportSession();
    });

    this.dashboardElement.querySelector('#telemetry-clear-btn')?.addEventListener('click', () => {
      this.clearMetrics();
    });
  }

  subscribeToTelemetry() {
    if (!this.engine) return;

    // Frame latency (Task 3)
    this.engine.on?.('video_frame_processed', (payload) => {
      this.recordFrameMetric(payload);
    });

    // Dropped frames (Task 3)
    this.engine.on?.('video_frame_dropped', () => {
      this.metrics.droppedFrameCount += 1;
    });

    // Audio cues (Task 4)
    this.engine.on?.('audio_cues_received', (payload) => {
      this.recordAudioMetric(payload);
    });

    // Sync delta (Task 4)
    this.engine.on?.('audio_video_latency_delta_measured', (payload) => {
      this.recordSyncMetric(payload);
    });
  }

  recordFrameMetric(payload) {
    if (!payload?.latencyMs) return;

    this.metrics.frameLatencies.push(payload.latencyMs);
    if (this.metrics.frameLatencies.length > 300) {
      this.metrics.frameLatencies.shift();
    }

    // Track per-worker timings
    if (payload.workerBreakdown) {
      this.metrics.workerTimings = payload.workerBreakdown;
    }

    this.metrics.lastFrameTime = Date.now();
  }

  recordAudioMetric(payload) {
    if (!payload?.routingDurationMs) return;

    this.metrics.cueReceptions.push(payload.routingDurationMs);
    if (this.metrics.cueReceptions.length > 300) {
      this.metrics.cueReceptions.shift();
    }
  }

  recordSyncMetric(payload) {
    if (payload?.audioVideoLatencyDeltaMs === undefined) return;

    const deltaMagnitude = Math.abs(payload.audioVideoLatencyDeltaMs);
    this.metrics.syncDeltas.push(deltaMagnitude);
    if (this.metrics.syncDeltas.length > 300) {
      this.metrics.syncDeltas.shift();
    }
  }

  startUpdateLoop() {
    // Update charts 3 times per second (333ms interval) for efficiency
    this.updateInterval = setInterval(() => {
      this.updateDashboard();
    }, 333);
  }

  updateDashboard() {
    // Calculate aggregates
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const stdDev = (arr) => {
      if (arr.length < 2) return 0;
      const mean = avg(arr);
      const variance = avg(arr.map(x => Math.pow(x - mean, 2)));
      return Math.sqrt(variance);
    };

    // Update video metrics
    const frameAvg = avg(this.metrics.frameLatencies);
    const frameJitter = stdDev(this.metrics.frameLatencies);
    this.updateMetricDisplay('frame-latency', frameAvg, 45);
    this.updateMetricDisplay('jitter', frameJitter, 5);
    this.charts.frameLatency?.update(this.metrics.frameLatencies);
    this.charts.jitter?.update(this.metrics.frameLatencies.map((v, i) => {
      const window = this.metrics.frameLatencies.slice(Math.max(0, i - 5), i + 1);
      return stdDev(window);
    }));

    // Update audio metrics
    const cueAvg = avg(this.metrics.cueReceptions);
    this.updateMetricDisplay('cue-reception', cueAvg, 5);
    this.charts.cueReception?.update(this.metrics.cueReceptions);

    // Update sync metrics
    const syncAvg = avg(this.metrics.syncDeltas);
    this.updateMetricDisplay('sync-delta', syncAvg, 2);
    this.charts.syncDelta?.update(this.metrics.syncDeltas);

    // Update per-worker breakdown
    this.updateWorkerBreakdown();

    // Update dropped frames counter
    const droppedEl = this.dashboardElement?.querySelector('#dropped-frames-count');
    if (droppedEl) {
      droppedEl.textContent = this.metrics.droppedFrameCount;
    }
  }

  updateMetricDisplay(metricName, value, target) {
    const valueEl = this.dashboardElement?.querySelector(`#${metricName}-value`);
    const statusEl = this.dashboardElement?.querySelector(`#${metricName}-status`);
    const avgEl = this.dashboardElement?.querySelector(`#${metricName}-avg`);

    if (valueEl) {
      valueEl.textContent = value.toFixed(2) + (metricName.includes('jitter') ? 'ms' : 'ms');
    }

    // Status color coding
    if (statusEl) {
      const diff = Math.abs(value - target) / target;
      if (diff < 0.1) {
        statusEl.textContent = '🟢';
      } else if (diff < 0.2) {
        statusEl.textContent = '🟡';
      } else {
        statusEl.textContent = '🔴';
      }
    }

    if (avgEl) {
      avgEl.textContent = `Avg: ${value.toFixed(2)}ms`;
    }
  }

  updateWorkerBreakdown() {
    const breakdownList = this.dashboardElement?.querySelector('#worker-breakdown-list');
    if (!breakdownList) return;

    const timings = this.metrics.workerTimings || {};
    let html = '';

    for (const [workerName, duration] of Object.entries(timings)) {
      html += `
        <div class="worker-item">
          <span class="worker-name">${workerName}</span>
          <span class="worker-duration">${duration.toFixed(2)}ms</span>
        </div>
      `;
    }

    breakdownList.innerHTML = html || '<div style="color: #95a5a6; font-size: 12px;">No worker data</div>';
  }

  switchTab(tabName) {
    // Hide all tabs
    this.dashboardElement?.querySelectorAll('.telemetry-tab-content').forEach(tab => {
      tab.classList.remove('active');
    });

    // Deactivate all buttons
    this.dashboardElement?.querySelectorAll('.telemetry-tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Show selected tab
    const tabEl = this.dashboardElement?.querySelector(`#telemetry-tab-${tabName}`);
    if (tabEl) {
      tabEl.classList.add('active');
    }

    // Activate button
    const btnEl = this.dashboardElement?.querySelector(`[data-tab="${tabName}"]`);
    if (btnEl) {
      btnEl.classList.add('active');
    }
  }

  togglePause() {
    const btn = this.dashboardElement?.querySelector('#telemetry-pause-btn');
    if (!btn) return;

    const isPaused = btn.textContent.includes('Resume');
    if (isPaused) {
      this.startUpdateLoop();
      btn.textContent = '⏸ Pause';
    } else {
      clearInterval(this.updateInterval);
      btn.textContent = '▶ Resume';
    }
  }

  exportSession() {
    const collector = this.engine?._devPanelComponents?.telemetryCollector;
    if (collector && collector.exportSession) {
      const sessionData = collector.exportSession();
      const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acoustsee-telemetry-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  clearMetrics() {
    this.metrics = {
      frameLatencies: [],
      jitterValues: [],
      droppedFrameCount: 0,
      cueReceptions: [],
      syncDeltas: [],
      lastFrameTime: 0,
      workerTimings: {}
    };
  }

  dispose() {
    clearInterval(this.updateInterval);
    this.updateInterval = null;
  }
}

/**
 * Canvas-based line chart renderer (no external dependencies)
 */
export class CanvasLineChart {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas?.getContext('2d');
    this.data = [];
    this.options = {
      minValue: options.minValue || 0,
      maxValue: options.maxValue || 100,
      targetLine: options.targetLine || null,
      ...options
    };
  }

  update(newData) {
    if (!this.ctx) return;

    this.data = newData || [];
    this.draw();
  }

  draw() {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 10;

    // Clear canvas
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, width, height);

    if (this.data.length === 0) return;

    // Draw target line if specified
    if (this.options.targetLine !== null) {
      const y = this.valueToY(this.options.targetLine, height, padding);
      this.ctx.strokeStyle = 'rgba(52, 152, 219, 0.3)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([2, 2]);
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw data line
    this.ctx.strokeStyle = '#3498db';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    const xScale = (width - 2 * padding) / Math.max(1, this.data.length - 1);

    for (let i = 0; i < this.data.length; i++) {
      const x = padding + i * xScale;
      const y = this.valueToY(this.data[i], height, padding);

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  valueToY(value, height, padding) {
    const range = this.options.maxValue - this.options.minValue;
    const normalized = (value - this.options.minValue) / range;
    return height - padding - (normalized * (height - 2 * padding));
  }
}

/**
 * Initialize telemetry dashboard when dev panel loads
 */
export function initializeTelemetryDashboard(engine) {
  if (!engine) {
    console.warn('TelemetryDashboard: engine not available');
    return null;
  }

  const dashboard = new TelemetryDashboard(engine);

  // Store reference on engine for external access
  if (engine._devPanelComponents) {
    engine._devPanelComponents.telemetryDashboard = dashboard;
  } else {
    engine._devPanelComponents = { telemetryDashboard: dashboard };
  }

  return dashboard;
}
