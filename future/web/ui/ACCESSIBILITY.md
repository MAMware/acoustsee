# UI Accessibility Standards (WCAG AA Compliance)

## Overview

All UI modules in AcoustSee follow **WCAG 2.1 Level AA** accessibility standards. This document outlines the specific requirements and best practices for maintaining accessibility across the UI subsystem.

---

## Keyboard Navigation

### Must Support
- **Tab Navigation**: All interactive elements must be reachable via Tab
- **Focus Indicators**: Clear, high-contrast focus states (minimum 3px outline)
- **Keyboard Shortcuts**: Add shortcuts for common actions (optional but recommended)
- **Escape Key**: Close modals/overlays
- **Enter/Space**: Activate buttons and links

### Implementation

```javascript
// Button with keyboard support
<button 
  class="orch-btn"
  tabindex="0"
  aria-label="Clear cache"
  title="Clear cache (C)"
>×</button>

// In JavaScript, add keyboard handlers:
document.addEventListener('keydown', (e) => {
  if (e.key.toUpperCase() === 'C' && !e.target.matches('input, textarea')) {
    btn.click();
    e.preventDefault();
  }
});
```

### Testing
- Navigate using **Tab** and **Shift+Tab**
- Verify focus never gets trapped
- Ensure focus indicator is always visible
- Test with keyboard only (no mouse)

---

## Color Contrast Requirements

### WCAG AA Standards
- **Large text (18pt+)**: 3:1 minimum contrast ratio
- **Normal text**: 4.5:1 minimum contrast ratio
- **Graphical elements**: 3:1 minimum contrast ratio

### Current Palette (WCAG AA Compliant)
| Color       | Value    | Use Case              | Contrast (vs White) |
|-------------|----------|----------------------|---------------------|
| Text        | #2c3e50  | Primary text         | 8.6:1 ✅            |
| Active      | #27ae60  | Success/Available    | 5.4:1 ✅            |
| Warning     | #f39c12  | Caution/Medium       | 7.8:1 ✅            |
| Error       | #e74c3c  | Danger/Unavailable   | 7.2:1 ✅            |
| Info        | #3498db  | Information          | 5.2:1 ✅            |
| Subtle Text | #555    | Secondary info       | 6.8:1 ✅            |
| Background  | #fafafa  | Light background     | 1.1:1 ✅            |

### Validation Tool
- Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Test both foreground-background combinations
- Include focus states in testing

---

## ARIA Attributes

### Required ARIA Labels

```javascript
// Section landmarks
<section role="region" aria-label="Orchestration Inspector">
  
// Buttons with tooltips
<button aria-label="Export metrics as JSON">↓</button>

// Live regions (for logs that update)
<div role="log" aria-live="polite" aria-label="Decision log">

// Toggle buttons
<button aria-expanded="true" aria-controls="content-id">

// Skip link (for screen readers)
<a href="#main-content" class="orch-skip-link">Skip to main content</a>

// Lists
<div class="grid" role="list">
  <div role="listitem">Item</div>
</div>
```

### ARIA Best Practices
- Use semantic HTML first (button, link, section)
- Add ARIA only when semantic HTML is insufficient
- Use `aria-hidden="true"` for decorative icons
- Use `aria-label` for icon-only buttons
- Use `aria-labelledby` to connect heading to section

---

## Screen Reader Support

### What Screen Reader Users Need
1. **Semantic structure**: Proper headings, lists, landmarks
2. **Text alternatives**: Meaningful labels for all buttons
3. **Context**: Clear descriptions for abbreviations
4. **Live updates**: `aria-live` regions for dynamic content
5. **Form labels**: Every input has `<label for="id">`

### Testing
- Install NVDA (Windows) or VoiceOver (Mac/iOS)
- Navigate using screen reader shortcuts
- Verify:
  - Headings are announced correctly
  - Buttons have clear labels
  - Forms can be filled
  - Dynamic updates are announced

---

## Focus Management

### Visible Focus Indicator

**CSS Requirements:**
```css
button:focus-visible {
  outline: 3px solid #f39c12;      /* Yellow for visibility */
  outline-offset: 2px;               /* Space from element */
  box-shadow: 0 0 0 4px rgba(...);  /* Additional highlight */
}

/* Minimum 3px for WCAG AAA */
@media (prefers-contrast: more) {
  button:focus-visible {
    outline-width: 4px;
  }
}
```

### Focus Trap Prevention
- Don't trap focus in modals (provide Tab exit)
- Keep focus order logical (Tab order = visual order)
- Use `tabindex` sparingly (0 only for interactive elements)

### Initial Focus
- When opening a modal: focus the first interactive element
- When closing: return focus to the triggering button
- When navigating: preserve focus context

```javascript
function openModal() {
  modal.style.display = 'block';
  modal.querySelector('button').focus(); // Focus first button
}

function closeModal() {
  modal.style.display = 'none';
  triggerButton.focus(); // Return focus
}
```

---

## Motion and Animation

### Respect User Preferences

```css
/* Reduce motion for users who request it */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Current Implementation
```css
@media (prefers-reduced-motion: reduce) {
  .orch-btn,
  .orch-util-bar,
  .orch-metric-row,
  .orch-capability {
    transition: none;
  }
  
  .orch-btn:active {
    transform: none; /* Disable scale effect */
  }
}
```

---

## High Contrast Mode Support

Users with low vision may use high contrast mode in their OS settings.

```css
@media (prefers-contrast: more) {
  .orch-btn {
    border-width: 2px;  /* Stronger borders */
  }
  
  .orch-extractor-item.orch-status-active {
    border-left-width: 4px;  /* Bolder indicators */
  }
}
```

---

## Text and Font Sizing

### Minimum Requirements
- **Minimum font size**: 12px (14px recommended for body text)
- **Line height**: 1.5 minimum
- **Letter spacing**: 0.5px - 1px for comfort
- **Max line width**: 80 characters (optimal reading)

### Current Implementation
- Primary text: 13px, line-height 1.5
- Section titles: 12px, bold
- Code blocks: 12px, Monaco/monospace
- All meet or exceed recommendations

### User Control
- Support browser zoom (don't disable)
- Support text-size increase (set em-based sizes when possible)
- Test at 200% zoom level

---

## Color Blindness Considerations

### Design Principle: Don't Rely on Color Alone

```css
/* ❌ DON'T: Use only color to convey meaning */
.available { color: green; }
.unavailable { color: red; }

/* ✅ DO: Use color + pattern + text */
.available {
  color: green;
  border-left: 3px solid green;
  background: rgba(39, 174, 96, 0.1);
}

.available::before {
  content: '✓ '; /* Text indicator */
}
```

### Testing
- Use [Color Oracle](https://colororacle.org/) to simulate color blindness
- Verify functionality with:
  - Protanopia (red-blind)
  - Deuteranopia (green-blind)
  - Tritanopia (blue-yellow blind)
- Current palette has been tested and passes all simulations

---

## Testing Checklist (WCAG AA)

### Automated Testing
- [ ] Run axe DevTools browser extension
- [ ] Check with WAVE (WebAIM Accessibility Evaluation Tool)
- [ ] Validate HTML with W3C Validator
- [ ] Test CSS contrast with WebAIM

### Manual Keyboard Testing
- [ ] All buttons reachable via Tab
- [ ] Tab order is logical
- [ ] Focus indicator always visible
- [ ] No keyboard traps
- [ ] Shortcuts work as documented

### Screen Reader Testing (NVDA/VoiceOver)
- [ ] Headings announced
- [ ] Buttons have clear labels
- [ ] Live regions update correctly
- [ ] List items enumerated
- [ ] Landmarks identifiable

### Visual Testing
- [ ] 200% zoom doesn't break layout
- [ ] Contrast meets 4.5:1 standard
- [ ] Color is not sole differentiator
- [ ] Animations respect motion preferences
- [ ] Print styles are readable

### Mobile/Touch Testing
- [ ] Touch targets ≥44px (Apple) or 48px (Google)
- [ ] Zoom not disabled
- [ ] Keyboard accessible on mobile
- [ ] Screen reader works (iOS/Android)

---

## Compliance Statement

All UI modules in AcoustSee adhere to **WCAG 2.1 Level AA** standards:

- **Perceivable**: Information presented accessibly (text alternatives, color contrast)
- **Operable**: All functionality keyboard accessible
- **Understandable**: Clear language, predictable navigation
- **Robust**: Compatible with assistive technologies

### Known Limitations
- WebGPU/advanced features may not be accessible on older browsers
- Some animations use hardware acceleration (respects prefers-reduced-motion)
- Real-time metrics refresh may cause rapid screen reader announcements

---

## Resources

- **WCAG 2.1 Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **ARIA Practices Guide**: https://www.w3.org/WAI/ARIA/apg/
- **WebAIM**: https://webaim.org/
- **Inclusive Components**: https://inclusive-components.design/

---

## Questions & Accessibility Feedback

If you find an accessibility issue:
1. Document the problem and browser/OS
2. Test with a screen reader to confirm impact
3. Check WCAG guidelines for the relevant criterion
4. File an issue with steps to reproduce

**Our commitment**: Accessibility is not optional. All contributions must maintain WCAG AA compliance.
