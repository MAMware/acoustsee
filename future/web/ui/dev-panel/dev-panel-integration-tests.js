// File: web/ui/dev-panel/dev-panel-integration-tests.js
// Phase 5: Integration Testing & Validation
// Comprehensive test suite for all dev panel features

import { structuredLog } from '../../utils/logging.js';

const TEST_RESULTS = [];

// Helper: Log test result
function logTest(name, passed, details = {}) {
  const result = { name, passed, timestamp: new Date().toISOString(), details };
  TEST_RESULTS.push(result);
  structuredLog(passed ? 'INFO' : 'ERROR', 'dev-panel-integration-tests', {
    test: name,
    status: passed ? 'PASS' : 'FAIL',
    ...details
  });
  return result;
}

// Phase 1: Responsive Layout Tests
export function testResponsiveLayout(panel, DOM) {
  try {
    const devPanel = panel.querySelector('#acoustsee-dev-panel');
    if (!devPanel) throw new Error('Dev panel element not found');

    const rect = devPanel.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    
    logTest('Phase1-Layout-Visibility', isVisible, {
      width: rect.width,
      height: rect.height
    });

    // Check z-index
    const zIndex = window.getComputedStyle(devPanel).zIndex;
    logTest('Phase1-Layout-ZIndex', zIndex === '1000', { zIndex });

    // Check position
    const position = window.getComputedStyle(devPanel).position;
    logTest('Phase1-Layout-Position', position === 'fixed', { position });

    return { passed: true, tests: TEST_RESULTS.slice(-3) };
  } catch (e) {
    logTest('Phase1-Layout-Error', false, { error: e.message });
    return { passed: false, error: e.message };
  }
}

// Phase 2: Design Tokens & Density Tests
export function testDesignTokens(panel) {
  try {
    const root = document.documentElement;
    const computedStyle = window.getComputedStyle(root);

    // Check if design token CSS variables are defined
    const textSmVar = computedStyle.getPropertyValue('--text-sm').trim();
    const spaceVar = computedStyle.getPropertyValue('--space-4').trim();
    const radiusVar = computedStyle.getPropertyValue('--radius-md').trim();
    const densityVar = computedStyle.getPropertyValue('--density').trim();

    logTest('Phase2-DesignTokens-TextSmDefined', !!textSmVar, { value: textSmVar });
    logTest('Phase2-DesignTokens-SpaceDefined', !!spaceVar, { value: spaceVar });
    logTest('Phase2-DesignTokens-RadiusDefined', !!radiusVar, { value: radiusVar });
    logTest('Phase2-DesignTokens-DensityDefined', !!densityVar, { value: densityVar });

    // Test density control radio buttons
    const densityRadios = panel.querySelectorAll('input[name="density"]');
    const hasDensityControls = densityRadios.length === 3;
    logTest('Phase2-DensityControls-Present', hasDensityControls, { 
      count: densityRadios.length 
    });

    // Check if comfortable density is default
    const comfortableChecked = panel.querySelector('#density-comfortable')?.checked;
    logTest('Phase2-DensityControls-Default', comfortableChecked, { 
      checked: comfortableChecked 
    });

    return { passed: true, tests: TEST_RESULTS.slice(-5) };
  } catch (e) {
    logTest('Phase2-DesignTokens-Error', false, { error: e.message });
    return { passed: false, error: e.message };
  }
}

// Phase 3: Feature Grouping Tests
export function testFeatureGrouping(panel) {
  try {
    const expectedGroups = [
      'ui-system',
      'audio-synthesis',
      'video-motion',
      'processing-controls',
      'pipeline-monitoring',
      'diagnostics-logs'
    ];

    const groupElements = panel.querySelectorAll('[data-group]');
    const foundGroups = Array.from(groupElements).map(g => g.dataset.group);

    // Check all groups exist
    const allGroupsPresent = expectedGroups.every(g => foundGroups.includes(g));
    logTest('Phase3-Grouping-AllGroupsPresent', allGroupsPresent, {
      expected: expectedGroups.length,
      found: foundGroups.length
    });

    // Check group headers with collapse buttons
    const groupHeaders = panel.querySelectorAll('.group-header');
    const hasGroupHeaders = groupHeaders.length === expectedGroups.length;
    logTest('Phase3-Grouping-GroupHeaders', hasGroupHeaders, {
      count: groupHeaders.length
    });

    // Check collapse buttons exist for each group
    const collapseButtons = panel.querySelectorAll('.group-collapse-btn');
    const hasCollapseButtons = collapseButtons.length === expectedGroups.length;
    logTest('Phase3-Grouping-CollapseButtons', hasCollapseButtons, {
      count: collapseButtons.length
    });

    // Verify each group has sections
    expectedGroups.forEach(groupId => {
      const groupEl = panel.querySelector(`[data-group="${groupId}"]`);
      const sections = groupEl?.querySelectorAll('.devpanel-section');
      logTest(`Phase3-Grouping-${groupId}-HasSections`, sections && sections.length > 0, {
        groupId,
        sectionCount: sections?.length || 0
      });
    });

    return { passed: true, tests: TEST_RESULTS.slice(-10) };
  } catch (e) {
    logTest('Phase3-Grouping-Error', false, { error: e.message });
    return { passed: false, error: e.message };
  }
}

// Phase 4: Customization System Tests
export function testCustomizationSystem(panel) {
  try {
    // Check customize button
    const customizeBtn = panel.querySelector('#customize-groups-btn');
    logTest('Phase4-Customization-Button', !!customizeBtn, {
      found: !!customizeBtn
    });

    // Check customize modal
    const customizeModal = panel.querySelector('#customize-groups-modal');
    logTest('Phase4-Customization-Modal', !!customizeModal, {
      found: !!customizeModal
    });

    // Check modal elements
    const modalHeader = panel.querySelector('.customize-modal-header');
    const modalBody = panel.querySelector('.customize-modal-body');
    const modalFooter = panel.querySelector('.customize-modal-footer');
    
    logTest('Phase4-Customization-ModalHeader', !!modalHeader, { found: !!modalHeader });
    logTest('Phase4-Customization-ModalBody', !!modalBody, { found: !!modalBody });
    logTest('Phase4-Customization-ModalFooter', !!modalFooter, { found: !!modalFooter });

    // Check modal buttons
    const closeBtn = panel.querySelector('#customize-groups-close');
    const doneBtn = panel.querySelector('#customize-groups-done-btn');
    const resetBtn = panel.querySelector('#customize-groups-reset-btn');
    
    logTest('Phase4-Customization-CloseButton', !!closeBtn, { found: !!closeBtn });
    logTest('Phase4-Customization-DoneButton', !!doneBtn, { found: !!doneBtn });
    logTest('Phase4-Customization-ResetButton', !!resetBtn, { found: !!resetBtn });

    return { passed: true, tests: TEST_RESULTS.slice(-10) };
  } catch (e) {
    logTest('Phase4-Customization-Error', false, { error: e.message });
    return { passed: false, error: e.message };
  }
}

// Phase 5: Responsive Viewport Tests
export function testResponsiveViewports(panel) {
  try {
    const devPanel = panel.querySelector('#acoustsee-dev-panel');
    if (!devPanel) throw new Error('Dev panel not found');

    // Test portrait viewport (narrow)
    const narrowWidth = window.innerWidth;
    const narrowHeight = window.innerHeight;
    const narrowDevPanelStyle = window.getComputedStyle(devPanel);
    
    logTest('Phase5-Viewport-Narrow-Visible', narrowDevPanelStyle.display !== 'none', {
      viewport: `${narrowWidth}x${narrowHeight}`,
      display: narrowDevPanelStyle.display
    });

    // Check that dev panel doesn't overflow viewport
    const rect = devPanel.getBoundingClientRect();
    const fitsInViewport = rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    
    logTest('Phase5-Viewport-NoOverflow', fitsInViewport, {
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });

    // Test main container is hidden when dev panel is active
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
      const mainVisible = window.getComputedStyle(mainContainer).display !== 'none';
      logTest('Phase5-Viewport-MainContainerHidden', !mainVisible, {
        display: window.getComputedStyle(mainContainer).display
      });
    }

    return { passed: true, tests: TEST_RESULTS.slice(-3) };
  } catch (e) {
    logTest('Phase5-Viewport-Error', false, { error: e.message });
    return { passed: false, error: e.message };
  }
}

// Overall Integration Test
export function runAllTests(panel, DOM, engine) {
  try {
    structuredLog('INFO', 'dev-panel-integration-tests', { 
      message: 'Starting Phase 5 integration tests' 
    });

    const results = {
      phase1_layout: testResponsiveLayout(panel, DOM),
      phase2_tokens: testDesignTokens(panel),
      phase3_grouping: testFeatureGrouping(panel),
      phase4_customization: testCustomizationSystem(panel),
      phase5_viewports: testResponsiveViewports(panel)
    };

    const allPassed = Object.values(results).every(r => r.passed);
    const summary = {
      allPassed,
      totalTests: TEST_RESULTS.length,
      passedTests: TEST_RESULTS.filter(r => r.passed).length,
      failedTests: TEST_RESULTS.filter(r => !r.passed).length,
      timestamp: new Date().toISOString()
    };

    structuredLog('INFO', 'dev-panel-integration-tests', {
      message: 'Phase 5 integration tests complete',
      ...summary
    });

    return { results, summary, allTests: TEST_RESULTS };
  } catch (e) {
    structuredLog('ERROR', 'dev-panel-integration-tests', {
      message: 'Integration tests failed',
      error: e.message
    });
    return { error: e.message, results: {} };
  }
}

// Export for external access (e.g., console debugging)
if (typeof window !== 'undefined') {
  window.__devPanelIntegrationTests = {
    runAllTests,
    getResults: () => TEST_RESULTS,
    exportResults: () => JSON.stringify(TEST_RESULTS, null, 2)
  };
}
