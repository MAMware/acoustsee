# Contributing to AcoustSee 

Thank you for helping improve AcoustSee. This document contains a short, practical guide to contributing code, tests, and documentation.

## Quick Start
- Fork the repository and create a feature branch off `developing`:

```bash
git checkout -b feature/your-feature-name developing
```

- Run tests locally before opening a PR:

```bash
npm ci
npm test
```

- When ready, push your branch and open a pull request into `developing`.

## Code style and reviews
- Follow existing code style. Add or update JSDoc comments for public functions.
- Run linters (if enabled) and ensure ESLint/Prettier pass.
- PRs should include a short description, motivation, and any testing instructions.

## Tests

### Test Organization

Tests are organized by scope and type:

**Unit & Integration Tests** (`future/web/test/`):
- **`future/web/test/unit/`** — Jest unit tests for specific modules
  - Place new unit tests in appropriate subdirectory (e.g., `audio/`, `video/`, `core/`)
  - Name tests as `*.test.js` (e.g., `audio-manager.test.js`)
- **`future/web/test/integration/`** — Multi-module integration tests
- **`future/web/test/node-scripts/`** — Node.js test scripts (not Jest)
- **`future/web/test/fixtures/`** — Test helpers and artifacts

**E2E Tests** (`test/`):
- Playwright-based end-to-end tests

For detailed test organization, see [`future/web/test/TESTING.md`](../../future/web/test/TESTING.md).

### Running Tests

Run all unit tests:

```bash
npm test
```

End-to-end tests use Playwright:

```bash
npm ci
npm run playwright:install
npm run test:e2e:http
```

## E2E failures & artifacts
- Local runs:
  - Playwright writes test artifacts (screenshots, traces, videos) to the `test-results/` directory by default. Inspect this directory after a failing run.
  - Re-run a failing test locally with increased verbosity: 

```bash
npx playwright test --config=playwright.config.cjs -g "test name" --project=chromium --debug
```

- CI runs (GitHub Actions):
  - The workflow uploads the `test-results` directory as an artifact when a job fails. Download the artifact from the workflow run page to inspect traces, screenshots and logs.
  - The badge in the README links to the workflow and run history.

## Build & Validation Tools

All utility scripts are located in `scripts/` organized by purpose:

**Validation:**
```bash
node scripts/validation/validate-bootstrap-imports.js      # Validate module imports
```

**Development:**
```bash
npm run start:static              # Start dev server (port 3000)
```

**Testing & Diagnostics:**
```bash
node scripts/diagnostics/inspect-debug-ui.mjs              # Inspect debug panel
node scripts/diagnostics/inspect-click-logs.mjs            # Check debug logging
```

**Artifacts & Packaging:**
```bash
npm run collect:artifacts         # Archive test results
node scripts/packaging/package_for_llm_multi.cjs all      # Generate LLM packages
```

- Common failure signals:
  - `ERR_CONNECTION_REFUSED` — server failed to start. Check Playwright `webServer` logs in the run output.
  - `getUserMedia` errors — browser could not access fake media; ensure Playwright browsers are installed and the CI environment supports fake media flags.
  - Selector timeouts — UI changed or initialization took longer; increasing timeouts or adding `await page.waitForSelector()` can help.

- Collecting artifacts manually in CI:
  - On the failed workflow run page, expand the job, find the `Download artifact` link for `playwright-test-results*` and download the ZIP for local inspection.

## Code of Conduct
Please be kind, inclusive, and collaborative. Let’s make accessibility tech awesome!

## Questions?
Reach out via [Issues](https://github.com/MAMware/acoustsee/issues).

Happy contributing!
