# 0001: Consolidate Media Stream Controllers

*   **Status:** Accepted
*   **Date:** 2025-09-13
*   **Task ID:** ARCH-1

## Context

The project currently contains two separate modules for handling media input: `future/web/core/media-controller.js` for camera streams and `future/web/core/microphone-controller.js` for audio streams. This separation has led to some duplicated logic (e.g., stream handling, error reporting) and forces command modules to import from multiple sources, increasing coupling and reducing clarity.

## Decision

We will merge all media stream acquisition and lifecycle management functionality into a single module: `future/web/core/media-controller.js`. The `future/web/core/microphone-controller.js` module will be deprecated and its functionality migrated, after which the file will be deleted.

## Consequences

### Positive:
*   **Single Responsibility:** Creates a single, authoritative module for all media input, adhering to the Single Responsibility Principle.
*   **Reduced Coupling:** Modules that require media streams (like `media-commands.js`) will only need to depend on one controller.
*   **Improved Maintainability:** Eliminates code duplication and provides a clear place for all future media-related enhancements.

### Negative:
*   The `media-controller.js` file will increase in size, but this is a reasonable trade-off for the architectural simplification.
