# Architecture Rules - Cross-Cutting Concerns

**Purpose:** Rules that apply across ALL subsystems. For domain-specific rules, see `docs/rules/`.

---

## Rule 1: Import Dependencies Explicitly


**❌ INCORRECT (DON'T):** Missing import causes ReferenceError

```javascript
import { structuredLog } from './logging.js';
if (shouldSample('x')) { }  // ReferenceError!
```

**✅ CORRECT (DO):** Import everything you use

```javascript
import { structuredLog, shouldSample } from './logging.js';
```

Avoid the overuse or misuse of `try` `catch` blocks since it:
Obscures Program Control Flow
Can Mask Bugs ("Swallowing" Errors)
Encourages Poor Error Handling Design
Performance Overhead 
If you must, the variables used in `catch` blocks must be declared before `try`

---

## Rule 2: State Mutations Preserve Object Identity

**❌ INCORRECT (DON'T):** Breaks references — other code sees stale object
```javascript
return { ...existingState, newField: value };
```

**✅ CORRECT (DO):** Mutate in-place
```javascript
existingState.newField = value;
return existingState;
```

---

## Rule 3: Dependency Flow

```
ui/ ──imports──▶ utils/ (injected)
                 ╳ core/, audio/, video/

core/ ──imports──▶ state.js, utils/
                   ╳ audio/, video/, ui/

audio/, video/ ──imports──▶ utils/, core/state.js
                            ╳ each other, ui/
```

**UI receives `engine` via parameter injection, never imports it.**

---

## Rule 4: Register Handlers Before Dispatch

```javascript
registerAllCommands(engine);  // First
engine.dispatch('myCommand'); // After — handler exists
```

---

## Rule 5: State Must Be JSON-Serializable

**Allowed:** primitives, plain objects, arrays  
**Forbidden:** functions, class instances, DOM elements, circular refs

---

## Rule 6: UI Disposal Contract

Every UI init returns `{ dispose() }` that cleans up DOM, listeners, timers.

---

## Rule 7: Sample High-Frequency Logs

**❌ INCORRECT (DON'T):** 60fps = 3600 logs/min
```javascript
structuredLog('DEBUG', 'frame', data);
```

**✅ CORRECT (DO):** Sampled
```javascript
if (shouldSample('frameProcessing')) {
  structuredLog('DEBUG', 'frame', data);
}
```

---

## Rule 7: Transform Data for External APIs

Never send raw internal objects. Transform field names, validate size, check serializability.

---

## Rule 8: Async Init Has Fallbacks DO NOT SILENTLY FALLBACK, AVOID FALLBACKS

```javascript
try {
  settings.availableGrids = await loadAvailableGrids();
} catch (e) {
  structuredLog('ERROR', 'Grid loading failed', { error: e.message });
  settings.availableGrids = DEFAULT_GRIDS;
}
```

---

## Rule 9: Critical Systems Fail Loudly

Audio/Language are required. If not ready, commands log ERROR and fail. No silent fallback.

---


## Quick Checklist

- [ ] All imports explicit (no missing utilities)
- [ ] State mutations preserve object identity
- [ ] UI modules return `{ dispose() }`
- [ ] Handlers registered before dispatch
- [ ] High-frequency code uses sampling
- [ ] Async init has try/catch + defaults
- [ ] No DOM access in core layer

---

## Full Documentation

For detailed examples, real bug histories, and comprehensive rules:
- `docs/rules/AUDIO_RULES.md` - 10 rules (A1-A10)
- `docs/rules/VIDEO_RULES.md` - 10 rules (V1-V10)  
- `docs/rules/CORE_RULES.md` - 12 rules (C1-C12)

**For AI Agents:** When uncertain, read the domain-specific file first.
