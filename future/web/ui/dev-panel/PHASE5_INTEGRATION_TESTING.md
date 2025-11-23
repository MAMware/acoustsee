# Phase 5: Integration Testing & Validation Guide

## Overview
This document provides a comprehensive testing plan for all 5 phases of the dev panel UI overhaul. Each phase has specific acceptance criteria and test scenarios.

---

## Phase 1: Fullscreen Layout System ✅

### Acceptance Criteria
- [ ] Dev panel fills entire viewport (100% width × 100% height)
- [ ] Panel positioned at top-left (0, 0) with fixed positioning
- [ ] Panel displays as primary UI when active (z-index: 9999)
- [ ] No white backgrounds or layout glitches
- [ ] Memory leaks fixed (no event listeners needed)

### Test Scenarios

#### Fullscreen Layout (All Viewport Sizes)
**Setup:** Test at multiple viewport sizes (360px, 768px, 1280px, 1920px)
- [ ] Dev panel fills entire viewport at **all sizes**
- [ ] Panel width = 100% (fills horizontally)
- [ ] Panel height = 100% (fills vertically)
- [ ] Panel has no rounded corners (border-radius: 0)
- [ ] Panel positioned at top: 0, left: 0
- [ ] All content visible and scrollable within panel
- [ ] No horizontal scrollbars
- [ ] No white backgrounds or glitches
- [ ] Panel appears fullscreen (z-index: 9999)

#### Live Video Preview Display
**In Live Video Preview section:**
- [ ] Shows processed canvas (engine output)
- [ ] Shows **processed** motion/audio analysis, not raw video feed
- [ ] Preview updates when processing is active
- [ ] Low FPS toggle works
- [ ] Canvas dimensions scale appropriately

#### Responsive Without Breakpoints
**Scenario:** Resize browser continuously from 320px to 1920px
- [ ] Panel remains fullscreen at **all sizes**
- [ ] No layout switching or transitions at any breakpoint
- [ ] Content reflows smoothly
- [ ] All sections visible (scrollable if content exceeds height)
- [ ] Performance remains smooth (no jank)

---

## Phase 2: Design System & Density Controls ✅

### Acceptance Criteria
- [ ] Design tokens CSS variables are applied
- [ ] Density control radio buttons work
- [ ] Density preference persists to localStorage
- [ ] 100+ hardcoded px values replaced with tokens
- [ ] Typography scales with density multiplier

### Test Scenarios

#### Design Tokens
**In Browser Console:**
```javascript
// Check if CSS variables are defined
const root = getComputedStyle(document.documentElement);
console.log(root.getPropertyValue('--text-sm')); // Should show a value
console.log(root.getPropertyValue('--density')); // Should show 1 or similar
```
- [ ] All `--text-*` variables defined
- [ ] All `--space-*` variables defined
- [ ] All `--radius-*` variables defined
- [ ] All `--transition-base` defined

#### Density Controls
**In Dev Panel UI Settings section:**
- [ ] "Compact" radio button option visible
- [ ] "Comfortable" radio button option visible (default selected)
- [ ] "Spacious" radio button option visible
- [ ] Selecting "Compact" reduces spacing visibly
- [ ] Selecting "Spacious" increases spacing visibly
- [ ] Preference saved (reload page, selection persists)

#### Token Usage
**Inspect Elements:**
```javascript
// Check if dev panel uses tokens instead of hardcoded values
const header = document.querySelector('.devpanel-header');
const style = window.getComputedStyle(header);
console.log(style.paddingBottom); // Should be calc-based or use var()
```

---

## Phase 3: Feature Grouping (15 → 6 Groups) ✅

### Acceptance Criteria
- [ ] All 15 sections organized into 6 logical groups
- [ ] Group headers are visible and clearly labeled
- [ ] Each group has proper visual separation
- [ ] Sections within groups are logically related

### Test Scenarios

#### Group Structure
**Verify all 6 groups exist in order:**
1. [ ] **UI & System** (UI Settings, State Inspector, Missing Translations, Logging)
2. [ ] **Audio & Synthesis** (Synth Sandbox, Live Cues Display, Manual Control Pad)
3. [ ] **Video & Motion** (Worker Performance, Live Video Preview, Motion Detection)
4. [ ] **Processing & Controls** (Processing Controls, Performance Controls, Analytics)
5. [ ] **Pipeline Monitoring** (EventBus Viewer, Orchestration Inspector)
6. [ ] **Diagnostics & Logs** (Live Logs)

#### Visual Organization
- [ ] Group titles are uppercase and clearly visible
- [ ] Group titles have bottom border for separation
- [ ] Sections within each group are indented/nested
- [ ] No sections appear outside groups

---

## Phase 4: Customization System ✅

### Acceptance Criteria
- [ ] Customize button (⚙️) visible in header
- [ ] Modal opens/closes properly
- [ ] Group visibility can be toggled
- [ ] Collapse/expand buttons work for individual groups
- [ ] Preferences persist to localStorage
- [ ] Reset to default option available

### Test Scenarios

#### Customize Button
**In Dev Panel Header:**
- [ ] ⚙️ button visible top-right of header
- [ ] Click opens modal overlay
- [ ] Modal is centered and visible
- [ ] Modal has semi-transparent backdrop

#### Group Visibility Modal
**When modal is open:**
- [ ] All 6 group checkboxes visible
- [ ] All groups are checked by default
- [ ] Uncheck a group → group disappears from panel
- [ ] Check a group → group reappears
- [ ] "Reset to Default" button restores all groups
- [ ] "Done" button closes modal and saves preferences
- [ ] "×" button closes modal without saving

#### Collapse Buttons
**On each group header:**
- [ ] Collapse button (−) visible
- [ ] Click to collapse group → sections hidden
- [ ] Click to expand group → sections visible
- [ ] Button toggles between − and +
- [ ] Collapse state persists per group across reloads

#### Persistence
**After closing and reopening modal:**
- [ ] Checked/unchecked state is preserved
- [ ] Group collapse states are preserved
- [ ] Reload page → all preferences restored

---

## Phase 5: Integration Testing & Validation ✅

### Acceptance Criteria
- [ ] All phases work together without conflicts
- [ ] No console errors or warnings
- [ ] Performance is acceptable (no jank/lag)
- [ ] Accessibility features work (ARIA labels, keyboard nav)
- [ ] Cross-browser compatibility (Chrome, Firefox, Safari)

### Test Scenarios

#### No Conflicts Between Phases
**Scenario:** Use panel at different viewport sizes
1. [ ] Resize to 360px width
2. [ ] Open customize modal
3. [ ] Toggle group visibility
4. [ ] Close modal
5. [ ] Resize to 1920px width
6. [ ] Verify customization preferences still apply
7. [ ] Verify panel remains fullscreen at all sizes

#### Performance
**Monitor Console:**
- [ ] No repeated errors/warnings during setup
- [ ] Initialization completes in < 500ms
- [ ] Scrolling is smooth (no frame drops)
- [ ] Modal opens instantly
- [ ] Group collapse is instant

**Browser DevTools Performance Tab:**
```javascript
// In console, measure initialization time
console.time('devpanel-init');
// ... panel initializes ...
console.timeEnd('devpanel-init');
```

#### Accessibility
- [ ] All buttons have `title` attributes
- [ ] All buttons have `aria-*` attributes
- [ ] Group collapse buttons have `aria-expanded` state
- [ ] Modal can be closed with Escape key
- [ ] Radio buttons (density) are keyboard accessible
- [ ] Tab order is logical

#### Browser Testing
**Test on:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest, if available)
- [ ] Mobile Chrome
- [ ] Mobile Safari

**Check for:**
- [ ] Layout renders correctly
- [ ] Interactions work smoothly
- [ ] No layout shifts or jank

---

## Automated Testing

### Run Integration Tests
```javascript
// In browser console after dev panel loads
window.__devPanelIntegrationTests.runAllTests(panel, DOM, engine);

// View results
console.table(window.__devPanelIntegrationTests.getResults());

// Export results
console.log(window.__devPanelIntegrationTests.exportResults());
```

### Expected Output
```
{
  "allPassed": true,
  "totalTests": 25,
  "passedTests": 25,
  "failedTests": 0,
  "timestamp": "2025-11-22T22:30:00.000Z"
}
```

---

## Common Issues & Fixes

### Issue: White background appearing in panel
**Fix:** Verify `#ui-panel-root` has transparent background
```css
#ui-panel-root {
  background-color: transparent !important;
}
```

### Issue: Panel not fullscreen
**Fix:** Check layout in `dev-panel-layout.js`
```javascript
Object.assign(panel.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  zIndex: '9999'
});
```

### Issue: Density changes not persisting
**Fix:** Clear localStorage and reload
```javascript
localStorage.removeItem('devpanel-density');
location.reload();
```

### Issue: Groups not hiding when unchecked
**Fix:** Verify customization JS is loaded
```javascript
// In console
console.log(window.__devPanelIntegrationTests); // Should exist
```

### Issue: Live Video Preview blank
**Fix:** Verify processing canvas is available
```javascript
const previewCanvas = document.querySelector('#devpanel-preview-canvas');
console.log('Canvas size:', previewCanvas.width, previewCanvas.height);
// Should show non-zero dimensions if processing is active
```

### Issue: Collapse buttons not working
**Fix:** Check that group collapse event listeners are attached
```javascript
// In console
const btns = document.querySelectorAll('.group-collapse-btn');
console.log(btns.length); // Should be 6
```

---

## Sign-Off Checklist

### Developer
- [ ] All phases implemented
- [ ] No console errors
- [ ] Automated tests pass
- [ ] Memory leaks fixed
- [ ] Panel fullscreen at all viewport sizes

### QA
- [ ] Manual testing completed
- [ ] All 6 groups visible and functional
- [ ] Customization works correctly
- [ ] Panel fullscreen (100% × 100%)
- [ ] Live Video Preview shows engine output
- [ ] Density controls work
- [ ] No visual glitches

### Product
- [ ] User experience is intuitive
- [ ] Feature grouping makes sense
- [ ] Customization is discoverable
- [ ] Performance is acceptable
- [ ] Ready for release

---

## Next Steps

Once Phase 5 is complete:
1. **Code Review** - All code reviewed and approved
2. **Merge to `developing`** - Merge from `v0.9.5-eDPLayout`
3. **Release** - Include in next product release
4. **Documentation** - Update user guides
5. **Training** - Brief team on new features

---

**Status:** Complete (Phase 5)  
**Last Updated:** 2025-11-23  
**Architecture:** Fullscreen primary UI (100% × 100%)
**Owner:** Development Team
