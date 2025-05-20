## Initial Refactoring Effort

Splitting the File main.js from main branch for:

  - Modularity
  - Maintainability
  - Collaboration
  - Testability
  - Readability and Onboarding
  - Scalability

Modular File Structure (work in progress)

´´´
acoustsee/
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml
│   │   ├── test.yml
│   ├── CONTRIBUTING.md
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
├── tests/
│   ├── tonnetz-grid.test.js
│   ├── audio-processor.test.js
├── web/
│   ├── index.html
│   ├── main.js #Entry point to initialize modules.
│   ├── audio-processor.js #Audio initialization and playback.
│   ├── tonnetz-grid.js #Tonnetz grid generation and frame mapping.
│   ├── ui-handlers.js #UI event listeners and frame processing.
│   ├── state.js
├── package.json
├── README.md
├── LICENSE
´´´
