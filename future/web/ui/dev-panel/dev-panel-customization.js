// File: web/ui/dev-panel/dev-panel-customization.js
// Phase 4: Customization System
// Manages group visibility, collapse/expand, and user preferences

import { structuredLog } from '../../utils/logging.js';

const STORAGE_KEY = 'devpanel-group-preferences';
const DEFAULT_GROUPS = [
  { id: 'testing-execution', label: 'Testing & Execution', visible: true },
  { id: 'signal-chain', label: 'Signal Chain Control', visible: true },
  { id: 'realtime-monitoring', label: 'Real-Time Monitoring', visible: true },
  { id: 'diagnostics', label: 'Diagnostics & Investigation', visible: true },
  { id: 'audio-testing', label: 'Audio Testing', visible: true },
  { id: 'logging-output', label: 'Logging & Output', visible: true },
  { id: 'system-metadata', label: 'System & Metadata', visible: false }
];

export function initializeCustomization(panel) {
  try {
    const customizeBtn = panel.querySelector('#customize-groups-btn');
    const customizeModal = panel.querySelector('#customize-groups-modal');
    const closeBtn = panel.querySelector('#customize-groups-close');
    const doneBtn = panel.querySelector('#customize-groups-done-btn');
    const resetBtn = panel.querySelector('#customize-groups-reset-btn');
    const customizeList = panel.querySelector('#customize-groups-list');

    if (!customizeBtn || !customizeModal || !customizeList) {
      return { dispose: () => {} };
    }

    // Migration: Clear old localStorage keys for removed groups
    const oldGroupIds = ['ui-settings', 'ui-system', 'audio-synthesis', 'video-motion', 'processing-controls', 'pipeline-monitoring', 'diagnostics-logs', 'advanced-config-ui'];
    oldGroupIds.forEach(id => {
      const key = `devpanel-group-collapsed-${id}`;
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        structuredLog('DEBUG', 'dev-panel-customization', { message: 'Cleared old localStorage key', key });
      }
    });

    // Load saved preferences or use defaults
    const loadPreferences = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_GROUPS;
    };

    // Save preferences
    const savePreferences = (groups) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
      structuredLog('DEBUG', 'dev-panel-customization', { message: 'Preferences saved', groups });
    };

    // Apply visibility to groups
    const applyGroupVisibility = (groups) => {
      groups.forEach(group => {
        const groupEl = panel.querySelector(`[data-group="${group.id}"]`);
        if (groupEl) {
          if (!group.visible) {
            groupEl.style.display = 'none';
          } else {
            groupEl.style.display = '';
          }
        }
      });
    };

    // Build customize modal list
    const buildCustomizeList = () => {
      const groups = loadPreferences();
      customizeList.innerHTML = '';
      groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'customize-group-item';
        item.innerHTML = `
          <label>
            <input type="checkbox" data-group-id="${group.id}" ${group.visible ? 'checked' : ''} />
            <span>${group.label}</span>
          </label>
        `;
        customizeList.appendChild(item);
      });
    };

    // Handle customize button click
    const handleCustomizeClick = () => {
      customizeModal.style.display = 'flex';
      buildCustomizeList();
      structuredLog('DEBUG', 'dev-panel-customization', { message: 'Customize modal opened' });
    };

    // Handle modal close
    const handleModalClose = () => {
      customizeModal.style.display = 'none';
    };

    // Handle done button
    const handleDone = () => {
      const groups = loadPreferences();
      const checkboxes = customizeList.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        const groupId = checkbox.dataset.groupId;
        const group = groups.find(g => g.id === groupId);
        if (group) {
          group.visible = checkbox.checked;
        }
      });
      savePreferences(groups);
      applyGroupVisibility(groups);
      handleModalClose();
      structuredLog('INFO', 'dev-panel-customization', { message: 'Group visibility updated' });
    };

    // Handle reset button
    const handleReset = () => {
      savePreferences(DEFAULT_GROUPS);
      applyGroupVisibility(DEFAULT_GROUPS);
      buildCustomizeList();
      structuredLog('INFO', 'dev-panel-customization', { message: 'Group preferences reset to default' });
    };

    // Handle group collapse buttons
    const handleGroupCollapse = (event) => {
      const btn = event.currentTarget;
      const groupId = btn.dataset.group;
      const group = panel.querySelector(`[data-group="${groupId}"]`);
      
      if (!group) return;

      const isCollapsed = group.classList.contains('collapsed');
      if (isCollapsed) {
        group.classList.remove('collapsed');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = '−';
      } else {
        group.classList.add('collapsed');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '+';
      }

      // Persist collapse state
      const collapseKey = `devpanel-group-collapsed-${groupId}`;
      localStorage.setItem(collapseKey, !isCollapsed);
      structuredLog('DEBUG', 'dev-panel-customization', { message: 'Group collapsed state updated', groupId, collapsed: !isCollapsed });
    };

    // Restore collapse states from localStorage, respecting HTML defaults
    const restoreCollapseStates = () => {
      // Query all group collapse buttons in the DOM instead of iterating DEFAULT_GROUPS
      const collapseButtons = panel.querySelectorAll('.group-collapse-btn');
      collapseButtons.forEach(btn => {
        const groupId = btn.dataset.group;
        if (!groupId) return;
        
        const collapseKey = `devpanel-group-collapsed-${groupId}`;
        const storedState = localStorage.getItem(collapseKey);
        const groupEl = panel.querySelector(`[data-group="${groupId}"]`);
        
        if (!groupEl || !btn) return;
        
        // Determine if group should be collapsed:
        // 1. If localStorage has a value, use it
        // 2. Otherwise, check HTML aria-expanded attribute
        // 3. Default to false (expanded) if neither is clear
        let isCollapsed = false;
        if (storedState !== null) {
          isCollapsed = storedState === 'true';
        } else {
          // Use HTML's aria-expanded as the default state
          const htmlExpandedAttr = btn.getAttribute('aria-expanded');
          isCollapsed = htmlExpandedAttr === 'false';
        }
        
        if (isCollapsed) {
          groupEl.classList.add('collapsed');
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = '+';
        } else {
          groupEl.classList.remove('collapsed');
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = '−';
        }
      });
    };

    // Event listeners
    customizeBtn.addEventListener('click', handleCustomizeClick);
    closeBtn.addEventListener('click', handleModalClose);
    doneBtn.addEventListener('click', handleDone);
    resetBtn.addEventListener('click', handleReset);

    // Attach collapse handlers to all group collapse buttons
    const collapseButtons = panel.querySelectorAll('.group-collapse-btn');
    collapseButtons.forEach(btn => {
      btn.addEventListener('click', handleGroupCollapse);
    });

    // Close modal on outside click
    const handleOutsideClick = (event) => {
      if (event.target === customizeModal) {
        handleModalClose();
      }
    };
    customizeModal.addEventListener('click', handleOutsideClick);

    // Initialize: apply saved preferences
    const initialGroups = loadPreferences();
    applyGroupVisibility(initialGroups);
    restoreCollapseStates();

    structuredLog('INFO', 'dev-panel-customization', { message: 'Customization system initialized' });

    // Dispose function
    return function dispose() {
      customizeBtn.removeEventListener('click', handleCustomizeClick);
      closeBtn.removeEventListener('click', handleModalClose);
      doneBtn.removeEventListener('click', handleDone);
      resetBtn.removeEventListener('click', handleReset);
      customizeModal.removeEventListener('click', handleOutsideClick);
      collapseButtons.forEach(btn => {
        btn.removeEventListener('click', handleGroupCollapse);
      });
    };
  } catch (e) {
    console.error('[dev-panel-customization] Error initializing customization system:', e);
    return { dispose: () => {} };
  }
}
