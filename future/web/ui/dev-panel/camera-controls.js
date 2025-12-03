/**
 * Camera Controls UI - Workflow 1 Implementation
 * 
 * Manages camera start/stop, source selection (GPU/CPU fallback),
 * and displays real-time stream status and telemetry.
 * 
 * Integration:
 * - Subscribes to video_capture_started/stopped events (Task 2)
 * - Subscribes to video_source_gpu_selected/cpu_fallback events (Task 2)
 * - Dispatches startCamera/stopCamera commands to engine
 */

export class CameraControls {
  // Private WeakRef to engine - breaks circular reference chain for JSON serialization
  #engineRef = null;

  constructor(containerElement = null) {
    // PRIORITY 2 FIX: Use WeakRef to avoid circular refs when stored on engine._devPanelComponents
    // WeakRef allows garbage collection and doesn't serialize in JSON.stringify
    this.container = containerElement || document.getElementById('camera-controls-content');
    this.isRunning = false;
    this.currentSource = 'gpu';
    this.errorTimeout = null;
    
    if (!this.container) {
      console.warn('CameraControls: container element not found');
      return;
    }
    
    this.initializeElements();
  }

  initializeElements() {
    // Get references to all camera control elements
    this.statusIndicator = document.getElementById('camera-status-indicator');
    this.statusText = document.getElementById('camera-status-text');
    this.sourceSelector = document.getElementById('source-selector');
    this.timingBadge = document.getElementById('timing-badge');
    this.startBtn = document.getElementById('start-camera-btn');
    this.stopBtn = document.getElementById('stop-camera-btn');
    this.testFallbackBtn = document.getElementById('test-fallback-btn');
    this.streamResolution = document.getElementById('stream-resolution');
    this.streamFps = document.getElementById('stream-fps');
    this.errorContainer = document.getElementById('error-messages');

    console.log('CameraControls: Elements initialized', {
      hasStartBtn: !!this.startBtn,
      hasStopBtn: !!this.stopBtn,
      hasContainer: !!this.container
    });
  }

  /**
   * Get engine reference from WeakRef (returns null if engine was garbage collected)
   * @returns {Object|null} Engine instance or null
   */
  get engine() {
    return this.#engineRef?.deref() ?? null;
  }

  /**
   * Set engine reference using WeakRef to avoid circular references
   * @param {Object} engine - Engine instance
   */
  set engine(engine) {
    this.#engineRef = engine ? new WeakRef(engine) : null;
  }

  /**
   * Register event listeners and bind engine reference via dependency injection
   * PRIORITY 2: Accept engine as parameter, not constructor argument
   * @param {Object} engine - Engine instance for command dispatch
   */
  registerEventListeners(engine = null) {
    this.engine = engine;  // Uses WeakRef setter to avoid circular refs
    
    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => this.startCamera());
    }
    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopCamera());
    }
    if (this.testFallbackBtn) {
      this.testFallbackBtn.addEventListener('click', () => this.testFallback());
    }
    if (this.sourceSelector) {
      this.sourceSelector.addEventListener('change', (e) => {
        this.selectSource(e.target.value);
      });
    }
  }

  /**
   * Subscribe to telemetry events via dependency injection
   * PRIORITY 2: Accept engine as parameter
   * @param {Object} engine - Engine instance for event subscription
   */
  subscribeToTelemetry(engine = null) {
    if (!engine) return;
    
    this.engine = engine;  // Uses WeakRef setter - safe from circular refs

    // Listen to camera lifecycle events (Task 2 telemetry)
    engine.on?.('video_capture_started', (payload) => {
      this.onCameraStarted(payload);
    });

    engine.on?.('video_capture_stopped', (payload) => {
      this.onCameraStopped(payload);
    });

    // Listen to source selection events (Task 2 telemetry)
    engine.on?.('video_source_gpu_selected', (payload) => {
      this.onSourceSelected('gpu', payload);
    });

    engine.on?.('video_source_cpu_fallback', (payload) => {
      this.onSourceFallback(payload);
    });
  }

  startCamera() {
    if (this.isRunning) return;

    console.log('CameraControls: startCamera() called');
    this.setStatus('starting');
    this.showStatus('🔄 Initializing camera...');
    this.disableControls();

    const source = this.sourceSelector?.value || 'gpu';

    // Dispatch startCamera command to engine
    try {
      console.log('CameraControls: dispatching startCamera command', { source });
      this.engine?.dispatch?.('startCamera', {
        sourcePreference: source,
        timeout: 5000
      });
    } catch (error) {
      this.showError(`❌ Failed to start camera: ${error.message}`);
      this.setStatus('error');
      this.enableControls();
      return;
    }

    // Timeout if no response in 5 seconds
    setTimeout(() => {
      if (!this.isRunning) {
        this.showError('❌ Camera initialization failed after 5 seconds');
        this.setStatus('error');
        this.enableControls();
      }
    }, 5000);
  }

  stopCamera() {
    if (!this.isRunning) return;

    this.setStatus('stopping');
    this.showStatus('⏸ Stopping camera...');
    this.disableControls();

    try {
      this.engine?.dispatch?.('stopCamera', {});
    } catch (error) {
      this.showError(`❌ Failed to stop camera: ${error.message}`);
      this.setStatus('error');
      this.enableControls();
    }
  }

  selectSource(source) {
    this.currentSource = source;

    // Restart camera with new source if running
    if (this.isRunning) {
      try {
        this.engine?.dispatch?.('selectVideoSource', {
          source,
          restart: true
        });
      } catch (error) {
        this.showError(`⚠ Failed to switch source: ${error.message}`);
      }
    }
  }

  testFallback() {
    // Test CPU fallback while running on GPU
    if (!this.isRunning) {
      this.showError('⚠ Camera must be running to test fallback');
      return;
    }

    this.showStatus('🔄 Testing CPU fallback...');
    try {
      this.engine?.dispatch?.('selectVideoSource', {
        source: 'cpu',
        restart: true
      });
    } catch (error) {
      this.showError(`❌ Fallback test failed: ${error.message}`);
    }
  }

  onCameraStarted(payload) {
    this.isRunning = true;
    this.setStatus('active');
    const source = payload?.source || this.currentSource;
    this.showStatus(`▶ Camera active (${source.toUpperCase()})`);
    this.updateStreamInfo(payload);
    this.enableControls(false); // Disable START, enable STOP
  }

  onCameraStopped(_payload) { // eslint-disable-line no-unused-vars
    this.isRunning = false;
    this.setStatus('ready');
    this.showStatus('✅ Ready');
    this.resetStreamInfo();
    this.enableControls(true); // Enable START, disable STOP
  }

  onSourceSelected(source, payload) {
    const timingMs = payload?.negotiationTime || payload?.fallbackTime || 0;
    const timingText = timingMs > 0 ? `${source.toUpperCase()}: ${Math.round(timingMs)}ms` : '—';
    
    if (this.timingBadge) {
      this.timingBadge.textContent = timingText;
    }

    if (this.sourceSelector) {
      this.sourceSelector.value = source;
    }
    this.currentSource = source;
  }

  onSourceFallback(payload) {
    const timingMs = payload?.fallbackTime || 0;
    const timingText = timingMs > 0 ? `${Math.round(timingMs)}ms` : '';
    this.showError(
      `⚠ GPU unavailable, using CPU fallback${timingText ? ` (${timingText})` : ''}`,
      'warning'
    );
    
    if (this.sourceSelector) {
      this.sourceSelector.value = 'cpu';
    }
    this.currentSource = 'cpu';
  }

  setStatus(state) {
    if (!this.statusIndicator) return;

    this.statusIndicator.className = `status-indicator ${state}`;
  }

  showStatus(message) {
    if (this.statusText) {
      this.statusText.textContent = message;
    }
  }

  updateStreamInfo(payload) {
    if (this.streamResolution && payload?.resolution) {
      const [width, height] = payload.resolution;
      this.streamResolution.textContent = `Resolution: ${width}×${height}`;
    }

    if (this.streamFps && payload?.frameRate) {
      this.streamFps.textContent = `@ ${payload.frameRate}fps`;
    }
  }

  resetStreamInfo() {
    if (this.streamResolution) {
      this.streamResolution.textContent = 'Resolution: —';
    }
    if (this.streamFps) {
      this.streamFps.textContent = '@ —fps';
    }
  }

  showError(message, type = 'error') {
    if (!this.errorContainer) return;

    const errorEl = document.createElement('div');
    errorEl.className = `error-message ${type}`;
    errorEl.innerHTML = `
      <span>${message}</span>
      <button class="close" aria-label="Close error message">×</button>
    `;

    errorEl.querySelector('.close').addEventListener('click', () => {
      errorEl.remove();
    });

    this.errorContainer.appendChild(errorEl);

    // Auto-dismiss transient errors after 5 seconds
    if (type === 'warning' || type === 'info') {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = setTimeout(() => {
        errorEl.remove();
      }, 5000);
    }
  }

  disableControls() {
    if (this.startBtn) this.startBtn.disabled = true;
    if (this.stopBtn) this.stopBtn.disabled = true;
    if (this.testFallbackBtn) this.testFallbackBtn.disabled = true;
    if (this.sourceSelector) this.sourceSelector.disabled = true;
  }

  enableControls(enableStart = true) {
    if (this.startBtn) this.startBtn.disabled = !enableStart;
    if (this.stopBtn) this.stopBtn.disabled = enableStart;
    if (this.testFallbackBtn) this.testFallbackBtn.disabled = enableStart;
    if (this.sourceSelector) this.sourceSelector.disabled = false;
  }

  dispose() {
    clearTimeout(this.errorTimeout);
    // Event listeners are managed by DOM cleanup
  }
}

/**
 * Initialize camera controls when dev panel loads
 */
export function initializeCameraControls(engine) {
  if (!engine) {
    console.warn('CameraControls: engine not available');
    return null;
  }

  // PRIORITY 2 FIX: Create without engine in constructor
  const cameraControls = new CameraControls();
  
  // Inject engine via dependency injection methods instead
  cameraControls.registerEventListeners(engine);
  cameraControls.subscribeToTelemetry(engine);
  
  // Store reference on engine for external access
  if (engine._devPanelComponents) {
    engine._devPanelComponents.cameraControls = cameraControls;
  } else {
    engine._devPanelComponents = { cameraControls };
  }

  return cameraControls;
}
