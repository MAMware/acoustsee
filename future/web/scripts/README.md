# Build Scripts

## inject-build-info.js

**Purpose:** Automatically inject git commit hash, branch, and build timestamp into `core/constants.js` for version tracking.

**Usage:**

```bash
# Run manually
node scripts/inject-build-info.js

# Or use npm script (if package.json configured)
npm run inject-build

# Integrate into serve workflow
npm run serve  # Runs inject-build + python http.server
```

**What it does:**

1. Retrieves current git commit hash (short): `git rev-parse --short HEAD`
2. Retrieves current git branch: `git rev-parse --abbrev-ref HEAD`
3. Generates ISO timestamp: `new Date().toISOString()`
4. Updates/injects these values into `core/constants.js`:
   - `export const BUILD_COMMIT = 'abc1234';`
   - `export const BUILD_BRANCH = 'feature-branch';`
   - `export const BUILD_TIMESTAMP = '2025-11-15T13:40:46.587Z';`

**Why this matters:**

- **Verify latest code:** Console logs and dev panel now show exact commit being tested
- **Debug faster:** Know immediately if you're testing stale cached code
- **Session correlation:** Logs include commit hash for reproducibility

**Where build info appears:**

1. **Browser console** (on page load): Styled banner with commit/branch/timestamp
2. **Dev panel header**: Below version info, includes commit hash and build time
3. **State inspector**: `constants` export includes all build values

**Integration points:**

- `boot.js`: Logs build info banner on startup
- `dev-panel.js`: Displays build info in header with tooltip
- `constants.js`: Source of truth for build metadata (auto-updated by this script)

**Pre-commit hook (optional):**

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
cd future/web
node scripts/inject-build-info.js
git add core/constants.js
```

This ensures constants.js always reflects the commit being pushed.
