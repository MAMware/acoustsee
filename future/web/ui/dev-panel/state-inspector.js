// File: web/ui/dev-panel/state-inspector.js
// Dynamic State Inspector - Creates visual UI elements based on state structure
// Following AcoustSee's event-driven, modular architecture

import { structuredLog } from '../../utils/logging.js';

export class StateInspector {
  constructor(container, engine) {
    this.container = container;
    this.engine = engine;
    this.stateElements = new Map(); // Cache DOM elements for performance
    this.lastStateHash = '';
    
    // Performance optimization - limit updates
    this.updateThrottleMs = 200;
    this.lastUpdate = 0;
    this.pendingUpdate = null;
    
    this.initialize();
  }
  
  initialize() {
    // Clear container and add base structure
    this.container.innerHTML = `
      <div class="state-inspector-root">
        <div class="state-search">
          <input type="text" placeholder="Filter state properties..." id="state-filter">
        </div>
        <div class="state-groups" id="state-content"></div>
      </div>
    `;
    
    // Wire up search filter
    const filterInput = this.container.querySelector('#state-filter');
    filterInput.addEventListener('input', (e) => {
      this.filterState(e.target.value.toLowerCase());
    });
    
    // Listen to state changes with throttling
    this.engine.onStateChange(state => this.scheduleUpdate(state));
    
    // Initial render
    this.scheduleUpdate(this.engine.getState());
  }
  
  scheduleUpdate(state) {
    const now = performance.now();
    
    // Throttle updates for performance
    if (now - this.lastUpdate < this.updateThrottleMs) {
      if (this.pendingUpdate) {
        clearTimeout(this.pendingUpdate);
      }
      this.pendingUpdate = setTimeout(() => {
        this.updateStateView(state);
        this.lastUpdate = performance.now();
        this.pendingUpdate = null;
      }, this.updateThrottleMs);
      return;
    }
    
    this.updateStateView(state);
    this.lastUpdate = now;
  }
  
  updateStateView(state) {
    try {
      // Quick hash check to avoid unnecessary re-renders
      const stateHash = this.createStateHash(state);
      if (stateHash === this.lastStateHash) return;
      this.lastStateHash = stateHash;
      
      const contentContainer = this.container.querySelector('#state-content');
      if (!contentContainer) return;
      
      // Group state properties logically
      const stateGroups = this.groupStateProperties(state);
      
      // Clear and rebuild
      contentContainer.innerHTML = '';
      
      // Create visual groups
      Object.entries(stateGroups).forEach(([groupName, properties]) => {
        const groupElement = this.createStateGroup(groupName, properties);
        contentContainer.appendChild(groupElement);
      });
      
    } catch (error) {
      structuredLog('ERROR', 'state-inspector', 'Failed to update state view', { error: error.message });
    }
  }
  
  createStateHash(state) {
    // Create a lightweight hash for change detection
    const keys = Object.keys(state).sort();
    const values = keys.map(key => `${key}:${typeof state[key]}:${state[key]}`);
    return values.join('|').substring(0, 100); // Truncate for performance
  }
  
  groupStateProperties(state) {
    const groups = {
      'Core System': {},
      'Processing': {},
      'Performance': {},
      'User Interface': {},
      'Audio Settings': {},
      'Video Settings': {},
      'Analytics': {},
      'Other': {}
    };
    
    // Categorize properties based on naming patterns and types
    Object.entries(state).forEach(([key, value]) => {
      if (this.isCoreProperty(key)) {
        groups['Core System'][key] = value;
      } else if (this.isProcessingProperty(key)) {
        groups['Processing'][key] = value;
      } else if (this.isPerformanceProperty(key)) {
        groups['Performance'][key] = value;
      } else if (this.isUIProperty(key)) {
        groups['User Interface'][key] = value;
      } else if (this.isAudioProperty(key)) {
        groups['Audio Settings'][key] = value;
      } else if (this.isVideoProperty(key)) {
        groups['Video Settings'][key] = value;
      } else if (this.isAnalyticsProperty(key)) {
        groups['Analytics'][key] = value;
      } else {
        groups['Other'][key] = value;
      }
    });
    
    // Remove empty groups
    Object.keys(groups).forEach(groupName => {
      if (Object.keys(groups[groupName]).length === 0) {
        delete groups[groupName];
      }
    });
    
    return groups;
  }
  
  isCoreProperty(key) {
    const coreProps = ['currentMode', 'isProcessing', 'gridType', 'synthesisEngine', 'environment', 'language'];
    return coreProps.includes(key);
  }
  
  isProcessingProperty(key) {
    return key.includes('Processing') || key.includes('Worker') || key.includes('Frame') || 
           key.includes('pipeline') || key.includes('stream') || key.includes('Stream');
  }
  
  isPerformanceProperty(key) {
    return key.includes('fps') || key.includes('FPS') || key.includes('throttle') || key.includes('Performance') || 
           key.includes('benchmark') || key.includes('interval') || key.includes('Threshold');
  }
  
  isUIProperty(key) {
    return key.includes('ui') || key.includes('UI') || key.includes('panel') || key.includes('Panel') ||
           key.includes('debug') || key.includes('Debug') || key.includes('Settings') || key.includes('Mode');
  }
  
  isAudioProperty(key) {
    return key.includes('audio') || key.includes('Audio') || key.includes('synth') || key.includes('Notes') ||
           key.includes('cue') || key.includes('Cue') || key.includes('sound') || key.includes('volume') ||
           key.includes('maxNotes') || key.includes('tts');
  }
  
  isVideoProperty(key) {
    return key.includes('video') || key.includes('Video') || key.includes('camera') || key.includes('motion') ||
           key.includes('resolution') || key.includes('canvas') || key.includes('Camera');
  }
  
  isAnalyticsProperty(key) {
    return key.includes('ingest') || key.includes('analytics') || key.includes('telemetry') || 
           key.includes('log') || key.includes('tracking');
  }
  
  createStateGroup(groupName, properties) {
    const groupEl = document.createElement('div');
    groupEl.className = 'state-group';
    groupEl.dataset.group = groupName.toLowerCase().replace(/\s+/g, '-');
    
    // Group header with collapse functionality
    const headerEl = document.createElement('div');
    headerEl.className = 'state-group-header';
    headerEl.innerHTML = `
      <span class="group-title">${groupName}</span>
      <span class="group-count">(${Object.keys(properties).length})</span>
      <button class="group-toggle" aria-expanded="true">−</button>
    `;
    
    // Properties container
    const contentEl = document.createElement('div');
    contentEl.className = 'state-group-content';
    
    // Create property elements
    Object.entries(properties).forEach(([key, value]) => {
      const propertyEl = this.createPropertyElement(key, value);
      contentEl.appendChild(propertyEl);
    });
    
    // Wire collapse functionality
    const toggleBtn = headerEl.querySelector('.group-toggle');
    headerEl.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', !isExpanded);
      toggleBtn.textContent = isExpanded ? '+' : '−';
      groupEl.classList.toggle('collapsed', isExpanded);
    });
    
    groupEl.appendChild(headerEl);
    groupEl.appendChild(contentEl);
    
    return groupEl;
  }
  
  createPropertyElement(key, value) {
    const propertyEl = document.createElement('div');
    propertyEl.className = 'state-property';
    propertyEl.dataset.key = key;
    propertyEl.dataset.type = typeof value;
    
    const keyEl = document.createElement('span');
    keyEl.className = 'property-key';
    keyEl.textContent = key;
    
    const valueEl = this.createValueElement(value);
    
    propertyEl.appendChild(keyEl);
    propertyEl.appendChild(valueEl);
    
    return propertyEl;
  }
  
  createValueElement(value) {
    const valueEl = document.createElement('span');
    valueEl.className = 'property-value';
    
    if (value === null) {
      valueEl.className += ' value-null';
      valueEl.textContent = 'null';
    } else if (value === undefined) {
      valueEl.className += ' value-undefined';
      valueEl.textContent = 'undefined';
    } else if (typeof value === 'boolean') {
      valueEl.className += value ? ' value-boolean-true' : ' value-boolean-false';
      valueEl.innerHTML = `<span class="boolean-indicator">${value ? '●' : '●'}</span> ${value}`;
    } else if (typeof value === 'number') {
      valueEl.className += ' value-number';
      // Format numbers based on their magnitude
      if (Number.isInteger(value)) {
        valueEl.textContent = value.toLocaleString();
      } else {
        valueEl.textContent = value.toFixed(3);
      }
    } else if (typeof value === 'string') {
      valueEl.className += ' value-string';
      // Truncate long strings
      const displayValue = value.length > 50 ? value.substring(0, 47) + '...' : value;
      valueEl.textContent = `"${displayValue}"`;
      if (value.length > 50) {
        valueEl.title = value; // Show full value on hover
      }
    } else if (Array.isArray(value)) {
      valueEl.className += ' value-array';
      valueEl.innerHTML = `<span class="array-indicator">[</span> ${value.length} items <span class="array-indicator">]</span>`;
      valueEl.title = `Array with ${value.length} items`;
    } else if (typeof value === 'object') {
      valueEl.className += ' value-object';
      const keys = Object.keys(value);
      valueEl.innerHTML = `<span class="object-indicator">{</span> ${keys.length} keys <span class="object-indicator">}</span>`;
      valueEl.title = `Object with keys: ${keys.join(', ')}`;
    } else {
      valueEl.className += ' value-other';
      valueEl.textContent = String(value);
    }
    
    return valueEl;
  }
  
  filterState(filterText) {
    if (!filterText) {
      // Show all elements
      this.container.querySelectorAll('.state-property').forEach(el => {
        el.style.display = '';
      });
      this.container.querySelectorAll('.state-group').forEach(el => {
        el.style.display = '';
      });
      return;
    }
    
    // Hide/show based on filter
    this.container.querySelectorAll('.state-property').forEach(el => {
      const key = el.dataset.key.toLowerCase();
      const matches = key.includes(filterText);
      el.style.display = matches ? '' : 'none';
    });
    
    // Hide groups with no visible properties
    this.container.querySelectorAll('.state-group').forEach(groupEl => {
      const visibleProps = groupEl.querySelectorAll('.state-property:not([style*="display: none"])');
      groupEl.style.display = visibleProps.length > 0 ? '' : 'none';
    });
  }
  
  dispose() {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
    }
    this.stateElements.clear();
  }
}