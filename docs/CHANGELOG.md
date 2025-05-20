## Initial Refactoring Effort

Splitting the File main.js from main branch for:

  - Modularity
  - Maintainability
  - Collaboration
  - Testability
  - Readability and Onboarding
  - Scalability

Modular File Structure

web/audio-processor.js: Audio initialization and playback.
web/tonnetz-grid.js: Tonnetz grid generation and frame mapping.
web/ui-handlers.js: UI event listeners and frame processing.
web/main.js: Entry point to initialize modules.
