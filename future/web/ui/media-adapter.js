/**
 * media-adapter.js
 * 
 * UI Adapter for Media Resources (ADR-0011: Headless Core)
 * 
 * Purpose: Provides DOM elements (video, audio) to the Core layer on request.
 * The Core layer should never create DOM elements directly - it should emit
 * resource requests, and this adapter fulfills them.
 * 
 * This enforces hexagonal architecture: Core is headless, UI manages DOM.
 */

import { structuredLog } from '../utils/logging.js';

/**
 * Initializes the media adapter to handle resource requests from Core
 * 
 * @param {Object} engine - Command bus with resource request API
 * @param {Object} DOM - DOM cache (videoFeed, etc.)
 * @returns {Object} { dispose() } - cleanup function
 */
export function initializeMediaAdapter(engine, DOM) {
  structuredLog('INFO', 'Media adapter initializing');
  
  // Track created elements for cleanup
  const createdElements = new Set();
  
  /**
   * Handle VIDEO_ELEMENT resource requests
   * Core layer needs a video element for MediaStream
   */
  const unsubscribeVideo = engine.onResourceRequest?.('VIDEO_ELEMENT', (request) => {
    structuredLog('DEBUG', 'Media adapter: VIDEO_ELEMENT requested', {
      reason: request?.reason || 'unknown'
    });
    
    // Check if DOM cache has a video element
    if (DOM?.videoFeed) {
      structuredLog('DEBUG', 'Media adapter: Using DOM.videoFeed');
      return DOM.videoFeed;
    }
    
    // Create a new video element
    const videoEl = document.createElement('video');
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('muted', 'true');
    videoEl.setAttribute('autoplay', 'true');
    videoEl.style.display = 'none'; // Hidden by default
    
    // Append to body for iOS/Safari compatibility
    document.body.appendChild(videoEl);
    createdElements.add(videoEl);
    
    structuredLog('DEBUG', 'Media adapter: Created video element', {
      id: videoEl.id || '(no id)',
      appended: true
    });
    
    return videoEl;
  });
  
  /**
   * Handle AUDIO_ELEMENT resource requests (future use)
   */
  const unsubscribeAudio = engine.onResourceRequest?.('AUDIO_ELEMENT', (request) => {
    structuredLog('DEBUG', 'Media adapter: AUDIO_ELEMENT requested', {
      reason: request?.reason || 'unknown'
    });
    
    const audioEl = document.createElement('audio');
    audioEl.setAttribute('autoplay', 'true');
    audioEl.style.display = 'none';
    
    document.body.appendChild(audioEl);
    createdElements.add(audioEl);
    
    return audioEl;
  });
  
  structuredLog('INFO', 'Media adapter initialized', {
    videoHandler: !!unsubscribeVideo,
    audioHandler: !!unsubscribeAudio
  });
  
  /**
   * Cleanup function
   */
  return {
    dispose: () => {
      // Remove created elements
      for (const el of createdElements) {
        try {
          el.remove();
        } catch (e) {
          // Best effort
        }
      }
      createdElements.clear();
      
      // Unsubscribe handlers
      if (unsubscribeVideo) unsubscribeVideo();
      if (unsubscribeAudio) unsubscribeAudio();
      
      structuredLog('DEBUG', 'Media adapter disposed');
    }
  };
}
