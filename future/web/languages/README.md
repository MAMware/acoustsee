2025-11-24: DISREGARD THE CONTENT OF THIS FILE, IT IS OUTDATED //REMOVE THIS LINE ONCE UPDATED


## i18n / Language Subsystem

**Initialization (REQUIRED):**
- `initializeLanguage(state)` must be called and awaited during startup (in `main.js` init sequence)
- Sets `state.i18n.ready = true` when translations are loaded (or bundled fallback is available)
- Pre-bundled `en-US` ensures offline availability for core UI strings

**Fail-Fast Behavior:**
- `getText(key, params, state)` returns `[missing:key]` if called before `state.i18n.ready === true`
- Logs `I18N_NOT_INITIALIZED` once per session to enforce initialization order
- Missing keys are recorded in `state.missingTranslations` for Dev Panel visibility

**Analytics & Deduplication:**
- Only the first occurrence of each missing key is logged and sent to analytics
- Subsequent occurrences are logged at DEBUG level to avoid spam
- Session-level deduplication in both `getText` and analytics mapping

**Base Path:**
Language files are loaded relative to the global base path (`window.__ACOUSTSEE_BASE_PATH__`).

**Testing:**
See `future/web/test/unit/i18n-init.test.js` for initialization tests and `future/web/test/unit/analytics-i18n.test.js` for analytics deduplication tests.

---

# Languages (Internationalization - i18n)

This directory contains the language files and internationalization utilities for the application.

---

## Structure

```
languages/
├── available-languages.js          # Registry of supported languages
├── en-US.json                       # English (USA) - source language
├── es-ES.json                       # Spanish (Spain)
├── fr-FR.json                       # French
└── [other locales].json            # Additional languages
```

---

## How It Works

### Core Components:

1. **Language Files** - JSON files per locale (e.g., `en-US.json`)
   - Keys: Semantic identifiers (e.g., `ui.buttons.start`)
   - Values: Translated strings
   - **Bundled Fallback:** `en-US.js` is pre-bundled as an ES module for offline availability

2. **Available Languages** - `available-languages.js`
   - Exports supported language metadata
   - Each entry: `{ id: 'en-US', name: 'English (USA)' }`

3. **Core Utilities** - `utils/utils.js` implements:
  - `initializeLanguage(state, { persist })` - **Must be called and awaited during startup**. Chooses language, preloads translations, sets `state.i18n.ready = true`. Optional `persist(partial)` callback (e.g. `engine.setState`) is invoked with `{ language, i18n, missingTranslations }` as they change to avoid losing mutations when working on shallow copies.
   - `getText(key, params, state)` - Get translated string; **fails fast** if `state.i18n.ready !== true`, returns `[missing:key]` for missing translations
   - `setLanguage(locale, state)` - Switch active language and preload translations
   - `translatePage(document, state)` - Translate DOM elements
   - **Base Path Resolution:** Language files loaded relative to `window.__ACOUSTSEE_BASE_PATH__`

4. **DOM Translation** - Elements with `data-i18n` attribute
   - `<button data-i18n="ui.buttons.start">Start</button>`
   - Automatically translated by `translatePage()`

### Initialization Pattern (REQUIRED)

**The language system MUST be initialized before any UI text is rendered:**

```javascript
// In main.js startup sequence:
await initializeLanguage(state);  // Sets state.i18n.ready = true
translatePage(document, state);   // Safe to call after init
```

**Fail-Fast Behavior:**
- If `getText()` is called before `initializeLanguage()` completes, it logs `I18N_NOT_INITIALIZED` (once) and returns `[missing:key]`
- This enforces the initialization barrier and prevents race conditions

### Resilient Fallback Strategy

The language subsystem uses a pre-bundled `en-US` fallback to ensure core UI strings are always available:
- If the selected language file fails to fetch, the system automatically falls back to bundled `en-US`
- Missing translation keys are recorded in `state.missingTranslations` for Dev Panel visibility
- Only the first occurrence of each missing key is logged/sent to analytics (session-level deduplication)
- Audio and core functionality remain unaffected by i18n errors

---

## Translation File Structure

### Organizing Translation Keys

Keys are organized hierarchically by feature and component:

```javascript
// en-US.json
{
  "ui": {
    "buttons": {
      "start": "Start",
      "stop": "Stop",
      "settings": "Settings",
      "cancel": "Cancel",
      "submit": "Submit"
    },
    "labels": {
      "gridType": "Grid Type",
      "motionThreshold": "Motion Sensitivity",
      "maxNotes": "Maximum Notes"
    },
    "messages": {
      "statusRunning": "Navigation running",
      "statusStopped": "Navigation stopped",
      "settingsMode": "Settings mode active"
    }
  },
  "audio": {
    "feedback": {
      "initialized": "Audio initialized",
      "unlocked": "Audio ready",
      "error": "Audio error occurred"
    },
    "synthesis": {
      "sineWave": "Sine Wave",
      "karplus": "Plucked String",
      "noise": "White Noise"
    }
  },
  "errors": {
    "gridLoadFailed": "Failed to load grid",
    "audioContextRequired": "Audio context is required",
    "cameraAccessDenied": "Camera access was denied"
  }
}
```

### Key Organization Rules

✅ **DO:**
- Use semantic keys: `"statusRunning"` not `"message1"`
- Group by component: `"ui.buttons"`, `"audio.synthesis"`
- Use lowercase with camelCase: `"motionThreshold"`
- Be specific about context: `"ui.settings.gridType"` not just `"gridType"`
- Use short, descriptive values

❌ **DON'T:**
- Use generic keys: `"text1"`, `"label2"`, `"message_x"`
- Mix context levels: `"startButton"` should be `"ui.buttons.start"`
- Use ALL_CAPS: `"MOTION_THRESHOLD"` (use camelCase)
- Use very long keys: Prefer hierarchy over length
- Have duplicate translations under different keys

---

## Adding a New Language

### Step 1: Create Language File

Copy `en-US.json` to your new locale:

```bash
cp future/web/languages/en-US.json future/web/languages/fr-FR.json
```

### Step 2: Translate Strings

Edit the new file and translate all values:

```javascript
// fr-FR.json
{
  "ui": {
    "buttons": {
      "start": "Démarrer",
      "stop": "Arrêter",
      "settings": "Paramètres",
      "cancel": "Annuler",
      "submit": "Soumettre"
    },
    "labels": {
      "gridType": "Type de grille",
      "motionThreshold": "Sensibilité du mouvement",
      "maxNotes": "Nombre maximum de notes"
    },
    // ... continue for all keys
  }
}
```

### Step 3: Update Registry

Edit `available-languages.js`:

```javascript
// available-languages.js
export const availableLanguages = [
  { id: 'en-US', name: 'English (USA)' },
  { id: 'es-ES', name: 'Español (España)' },
  { id: 'fr-FR', name: 'Français' },  // ← Add this
];
```

### Step 4: Test

```javascript
// In browser console:
await setLanguage('fr-FR');
translatePage(document);  // Should show French text
```

Verify:
- [ ] All text displays correctly
- [ ] Special characters render (é, ñ, ü, etc.)
- [ ] No keys appear untranslated (e.g., `ui.buttons.start`)
- [ ] Layout doesn't break (French/German often longer)

---

## Translation Guidelines

### String Quality

#### Context & Tone
- ✅ **Clear context:** "Start Navigation" instead of just "Start"
- ✅ **Consistent terminology:** Use same term throughout (e.g., always "Motion" not "Movement")
- ✅ **Active voice:** "Start" instead of "Begin" (shorter, more direct)
- ❌ **Ambiguous:** "Do this" without context
- ❌ **Inconsistent:** "Motion" in one place, "Movement" in another

#### Accessibility
- ✅ **Spell out abbreviations:** "Grid Type" not "Grid Typ"
- ✅ **Use clear language:** Avoid jargon users won't understand
- ✅ **Be descriptive:** "Switch to circle of fifths" not just "Circle of Fifths"
- ❌ **Acronyms:** "FFT", "GUI", "DSP" (unexplained)
- ❌ **Technical jargon:** "Sonification" needs explanation

#### Translation Quality

```javascript
// ❌ BAD - incomplete or poor translations
"ui.buttons.start" → "Démarrer" (OK)
"ui.buttons.stop"  → "Arrêt" (Should be verb: "Arrêter")
"audio.error"      → "Erreur audio" (Should be more specific)

// ✅ GOOD - consistent and context-aware
"ui.buttons.start" → "Démarrer la navigation"
"ui.buttons.stop"  → "Arrêter la navigation"
"audio.error"      → "Erreur d'initialisation audio"
```

### Common Pitfalls

#### Untranslated Keys
**Problem:** Some keys left in English
```javascript
// ❌ WRONG - mixing languages
{
  "ui.buttons.start": "Démarrer",
  "ui.buttons.stop": "Stop",  // Left in English!
  "ui.buttons.settings": "Paramètres"
}
```

**Solution:** Use a validation script to find incomplete translations
```bash
# Check for any null/undefined values
jq 'paths(select(. == null or . == ""))' fr-FR.json
```

#### Inconsistent Terminology
**Problem:** Same concept translated different ways
```javascript
// ❌ WRONG - inconsistent
"motion.detected": "Mouvement détecté"
"motion.region": "Région de Motion"  // Should be "Mouvement"
"flow.moving": "En cours de déplacement"  // Should be "Mouvement"

// ✅ RIGHT - consistent
"motion.detected": "Mouvement détecté"
"motion.region": "Région de mouvement"
"flow.moving": "Mouvement détecté"
```

#### Length Mismatch
**Problem:** Translation too long, breaks UI layout
```javascript
// ❌ WRONG - too long
"en-US": "Maximum number of simultaneous notes"
"fr-FR": "Nombre maximum de notes simultanées pouvant être jouées"

// ✅ RIGHT - concise
"en-US": "Max Notes"
"fr-FR": "Notes Max"
```

#### Special Characters
**Problem:** Characters not rendering correctly
```javascript
// ❌ WRONG - escaped incorrectly
"ui.labels.cite": "Cit\u00E9"  // Will display as literal "Cit\u00E9"

// ✅ RIGHT - proper UTF-8
"ui.labels.cite": "Cité"  // Renders correctly
```

---

## Internationalization Testing Checklist

Before committing a new language:

### Completeness
- [ ] All keys translated (no null/undefined values)
- [ ] No English text left in non-English files
- [ ] All values are strings (not objects)
- [ ] File is valid JSON (use `jq` to validate)

### Rendering
- [ ] Special characters display correctly (é, ñ, ü, etc.)
- [ ] Diacritics and accents render properly
- [ ] Right-to-left languages supported (if applicable)
- [ ] No font substitution issues

### Layout
- [ ] Text doesn't overflow UI containers
- [ ] Buttons/forms don't break with longer text
- [ ] Number formatting matches locale (1,000 vs 1.000 vs 1 000)
- [ ] Date formatting matches locale preferences

### Consistency
- [ ] Same English term always translates to same word
- [ ] No mixing of formal/informal (tu vs vous in French)
- [ ] Terminology matches existing glossary
- [ ] Brand names/proper nouns not translated

### Functionality
- [ ] Language switcher works
- [ ] All UI updates when language changes
- [ ] Persists language selection (localStorage)
- [ ] Default language loads on first visit

### Performance
- [ ] Language file not too large (< 50KB)
- [ ] Page translation doesn't cause noticeable lag
- [ ] No memory leaks when switching languages

---

## Debugging Translation Issues

### Issue: Keys appearing in UI (e.g., "ui.buttons.start")

**Diagnosis:**
```javascript
// Check if key exists in language file
const text = getText('ui.buttons.start');
console.log('Got:', text);  // Logs "ui.buttons.start" if missing

// Check file is valid JSON
cat future/web/languages/en-US.json | jq empty  // Errors if invalid
```

**Solutions:**
1. Verify key exists in language file (check spelling)
2. Verify language file is valid JSON
3. Verify key path is correct in HTML: `data-i18n="ui.buttons.start"`

### Issue: Translation not updating when language changes

**Diagnosis:**
```javascript
// Check if setLanguage was called
console.log('Current language:', getCurrentLanguage());

// Check if translatePage() was called
const el = document.querySelector('[data-i18n]');
console.log('Element:', el?.textContent);  // Should be translated
```

**Solutions:**
1. Ensure `await setLanguage('locale')` completes
2. Call `translatePage(document)` after language change
3. Check browser console for errors loading language file

### Issue: Character encoding issues (mojibake, garbled text)

**Diagnosis:**
```javascript
// Check file encoding
file future/web/languages/fr-FR.json  # Should say "UTF-8"

// Check JSON for invalid escapes
jq . future/web/languages/fr-FR.json | head -20
```

**Solutions:**
1. Save file as UTF-8 (not ASCII or ISO-8859-1)
2. Don't manually escape Unicode (use raw UTF-8 characters)
3. Check HTTP Content-Type header includes `charset=utf-8`

### Issue: Language switcher not working

**Diagnosis:**
```javascript
// Check if language is in registry
const available = availableLanguages.map(l => l.id);
console.log('Available:', available);

// Check if setLanguage rejects invalid language
await setLanguage('invalid-LANG');  // Should error or no-op
```

**Solutions:**
1. Verify language ID is in `available-languages.js`
2. Verify language file exists and is named correctly
3. Check browser Network tab - is file loading?

---

## File Reference

| File | Purpose |
|------|---------|
| `en-US.json` | English (USA) - source language, reference for all others |
| `es-ES.json` | Spanish (Spain) |
| `fr-FR.json` | French |
| `available-languages.js` | Registry mapping locale IDs to display names |

---

## Best Practices for AI Agents

When adding a language:

1. **Copy from source** - Always copy from `en-US.json` to ensure all keys present
2. **Validate JSON** - Use `jq` to check validity
3. **Verify completeness** - Every key in source must exist in translation
4. **Test rendering** - Open app with new language, verify no garbled text
5. **Document changes** - Update this README if new conventions added

---

**Last Updated:** October 23, 2025 - Added comprehensive translation guidelines and testing checklist
