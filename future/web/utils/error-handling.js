// File: web/utils/error-handling.js
// AcoustSee-specific error handling for accessibility-critical applications
// Implements fail-fast for critical systems, graceful handling for non-critical

import { structuredLog } from './logging.js';

/**
 * Custom error class for accessibility-critical failures
 */
export class AccessibilityError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'AccessibilityError';
    this.code = code;
    this.context = context;
    this.isAccessibilityError = true;
    this.timestamp = Date.now();
  }
}

/**
 * System criticality definitions for AcoustSee
 */
export const CRITICAL_SYSTEMS = {
  'video-processing': 'Core video capture and analysis',
  'audio-synthesis': 'Core audio generation', 
  'motion-detection': 'Core spatial awareness',
  'accessibility-pipeline': 'Core visual→audio conversion',
  'media-controller': 'Camera and microphone access',
  'frame-processor': 'Video frame analysis',
  'audio-processor': 'Audio cue generation'
};

export const NON_CRITICAL_SYSTEMS = {
  'dev-panel': 'Developer diagnostics',
  'state-inspector': 'State visualization',
  'performance-analytics': 'Performance monitoring',
  'ui-enhancements': 'Visual polish',
  'logging': 'Debug logging',
  'worker-monitor': 'Worker diagnostics'
};

/**
 * Determines if a system is critical for accessibility
 */
export function isCriticalSystem(systemName) {
  return systemName in CRITICAL_SYSTEMS;
}

/**
 * Shows blocking critical error to user with clear actions
 */
export function showCriticalError(title, message, context = {}) {
  // Remove any existing critical error
  const existing = document.querySelector('.critical-error-overlay');
  if (existing) existing.remove();

  const errorPanel = document.createElement('div');
  errorPanel.className = 'critical-error-overlay';
  errorPanel.innerHTML = `
    <div class="critical-error-content">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">${title}</h2>
      <p class="error-message">${message}</p>
      
      <div class="error-actions">
        <button onclick="location.reload()" class="primary-action">
          Reload AcoustSee
        </button>
        <button onclick="this.closest('.critical-error-overlay').remove()" class="secondary-action">
          Dismiss (May Break Accessibility)
        </button>
      </div>
      
      <details class="error-help">
        <summary>Troubleshooting Help</summary>
        <ul>
          <li>Check camera/microphone permissions in browser settings</li>
          <li>Ensure you're using HTTPS</li>
          <li>Close other tabs that might be using camera/audio</li>
          <li>Try a different browser (Chrome/Firefox recommended)</li>
          <li>Check if hardware is connected and working</li>
        </ul>
      </details>
      
      ${context.technicalDetails ? `
        <details class="error-technical">
          <summary>Technical Details</summary>
          <pre>${JSON.stringify(context, null, 2)}</pre>
        </details>
      ` : ''}
    </div>
  `;
  
  // Add styles if not already present
  if (!document.querySelector('#critical-error-styles')) {
    const styles = document.createElement('style');
    styles.id = 'critical-error-styles';
    styles.textContent = `
      .critical-error-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .critical-error-content {
        background: white;
        padding: 32px;
        border-radius: 12px;
        max-width: 500px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }
      
      .error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      
      .error-title {
        color: #dc3545;
        margin: 0 0 16px 0;
        font-size: 24px;
        font-weight: 600;
      }
      
      .error-message {
        color: #333;
        margin: 0 0 24px 0;
        line-height: 1.5;
      }
      
      .error-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-bottom: 24px;
      }
      
      .primary-action {
        background: #dc3545;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
      }
      
      .primary-action:hover {
        background: #c82333;
      }
      
      .secondary-action {
        background: #6c757d;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
      }
      
      .secondary-action:hover {
        background: #5a6268;
      }
      
      .error-help,
      .error-technical {
        text-align: left;
        margin-top: 16px;
      }
      
      .error-help summary,
      .error-technical summary {
        cursor: pointer;
        font-weight: 600;
        color: #007bff;
      }
      
      .error-help ul {
        margin: 8px 0;
        padding-left: 20px;
      }
      
      .error-technical pre {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 4px;
        overflow: auto;
        font-size: 12px;
        margin: 8px 0;
      }
    `;
    document.head.appendChild(styles);
  }
  
  document.body.appendChild(errorPanel);
  
  // Log the critical error
  structuredLog('ERROR', 'critical-error', 'CRITICAL: Accessibility system failure', {
    title,
    message,
    context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Shows visual indicator for audio failures
 */
export function showAudioFailureIndicator(message = 'Audio Failed') {
  // Remove existing indicator
  const existing = document.querySelector('.audio-failure-indicator');
  if (existing) existing.remove();

  const indicator = document.createElement('div');
  indicator.className = 'audio-failure-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed; 
      top: 20px; 
      right: 20px; 
      background: #dc3545; 
      color: white; 
      padding: 12px 16px; 
      border-radius: 6px; 
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
    " onclick="this.remove()">
      🔇 ${message}
      <div style="font-size: 12px; font-weight: 400; margin-top: 4px;">
        Click to dismiss
      </div>
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.remove();
    }
  }, 10000);
}

/**
 * Wrapper for critical system operations - fail fast
 */
export async function executeCriticalOperation(systemName, operation, context = {}) {
  if (!isCriticalSystem(systemName)) {
    throw new Error(`System '${systemName}' is not defined as critical`);
  }
  
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const result = await operation();
      
      if (retryCount > 0) {
        structuredLog('INFO', systemName, 'Critical operation succeeded after retry', {
          retryCount,
          context
        });
      }
      
      return result;
    } catch (error) {
      retryCount++;
      
      structuredLog('WARN', systemName, `Critical operation failed, retry ${retryCount}/${maxRetries}`, {
        error: error.message,
        stack: error.stack,
        retryCount,
        context
      });
      
      if (retryCount >= maxRetries) {
        // Exhausted retries - this is a critical failure
        const accessibilityError = new AccessibilityError(
          `${CRITICAL_SYSTEMS[systemName]} failed permanently`,
          `${systemName.toUpperCase()}_FAILED`,
          { originalError: error.message, context, retries: maxRetries }
        );
        
        structuredLog('ERROR', systemName, 'CRITICAL: System permanently failed', {
          error: accessibilityError.message,
          code: accessibilityError.code,
          context: accessibilityError.context
        });
        
        throw accessibilityError;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
    }
  }
}

/**
 * Wrapper for non-critical system operations - graceful degradation allowed
 */
export function executeNonCriticalOperation(systemName, operation, fallback = null) {
  if (isCriticalSystem(systemName)) {
    throw new Error(`System '${systemName}' is critical and should use executeCriticalOperation`);
  }
  
  try {
    return operation();
  } catch (error) {
    structuredLog('ERROR', systemName, 'Non-critical operation failed, using fallback', {
      error: error.message,
      stack: error.stack,
      hasFallback: !!fallback
    });
    
    return fallback ? fallback(error) : null;
  }
}

/**
 * Creates minimal fallback UI for non-critical systems
 */
export function createMinimalFallback(systemName, originalError) {
  const fallback = document.createElement('div');
  fallback.className = 'system-fallback';
  fallback.innerHTML = `
    <div style="
      padding: 16px; 
      background: #fff3cd; 
      border: 1px solid #ffeaa7; 
      border-radius: 4px; 
      color: #856404;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <h4 style="margin: 0 0 8px 0;">⚠️ ${NON_CRITICAL_SYSTEMS[systemName] || systemName}</h4>
      <p style="margin: 0 0 12px 0; font-size: 14px;">
        This feature failed to load but core accessibility functions are unaffected.
      </p>
      <button onclick="location.reload()" style="
        background: #ffc107; 
        border: none; 
        padding: 6px 12px; 
        border-radius: 4px; 
        cursor: pointer;
        font-size: 12px;
      ">
        Reload to Restore
      </button>
    </div>
  `;
  
  return fallback;
}