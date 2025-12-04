# Contributing to AcoustSee
Welcome to `acoustsee`! We’re building spatial audio navigation for the visually impaired, and we’d love your help and have fun with us.

## How to contribute

Hi there! just a quick update, on branch v0.5 we are introducing an automatic file loader for grids, engines and languages.
If you contribute one or several of such, you can run the file-indexer.js from /scripts that automatically generates a file listing the affected folders files.  

1. The `developing` branch is our zone that rapid deploys to GitHub Pages for easy and broad testing.
2. At `developing` branch, you can create new artifacts in `future` folder, meant as placeholder to play around new ideas and radical changes, where you could create a folder name of your liking and do as you like inside it.
4. You can compare your new artifacts among the consolidated files from the `past` or `present` folder.
5. You could add unit tests in `tests/` and run `npm test`.
6. Submit a PR to `developing` with a clear description.

Q: Wich is the content and purpuse of the other folders?

A:
  `past` #Historical files, usefull to have them at hand for easy comparsion to vibe a new develop.
  `future`  #Our playground, a place holder for your new features or to make radical changes. 
  `present` #Here you can PR the integration resulted from your `future`. // (Considering removing it for simplicity and moving this folder as the staging branch)
 

## Branches 

### Purpose of the Staging branch

- Testing and validation: The staging branch serves as a pre-production environment where changes are tested to ensure they work as expected and do not introduce bugs or regressions.
- Integration testing: It allows for integration testing of multiple features or bug fixes that are developed in parallel.
- User Acceptance Testing (UAT): Stakeholders or beta testers can review the changes in the staging environment to provide feedback before the final release.

### Example workflow with a Staging branch

- **Main branch:**
This is the production-ready code. It should always be in a deployable state.

- **Developing branch:**
This is the main development branch where new features and bug fixes are integrated. It is the equivalent of the `develop` branch in GitFlow.

- **Feature branches:**
Developers create `feature` branches from the `developing` branch to work on new features or bug fixes.
Once the `feature` is complete, a `pull request` is created to merge the `feature` branch back into the `developing` branch.

- **Staging branch:**
Periodically, the `developing` branch is merged into the `staging` branch to prepare for testing.
The `staging` branch is deployed to a staging environment where automated and manual testing can be performed.
Any issues found during testing are addressed by creating new feature branches from the develop branch and merging them back into develop.

- **Pull Requests to Staging:**
Once the changes in the `staging` branch pass all tests and reviews, a `pull request` is created to merge the `staging` branch back into the `main` branch.

- **Release:**
The `main` branch is then deployed to production.

## Contribution Types

When debugLogging is `false` (default) at `state.js` , browser console only shows errors (critical stuff), and internal logs only collect errors.
Toggle to `true` for full verbosity during dev.

### Adding a New Language
- Create a new file in `web/languages/` (e.g., `fr-FR.json`) based on `en-US.json`.
- Update `web/ui/rectangle-handlers.js` to include the language in the `languages` array.
- Example:
  ```json
  // web/languages/fr-FR.json
  {
      "settingsToggle": "Paramètres {state}",
      "modeBtn": "Mode {mode}",
      ...
  }
  ```
  ```javascript
  // web/ui/rectangle-handlers.js
  const languages = ['en-US', 'es-ES', 'fr-FR'];
  ```

### Adding a New Grid or Synthesis Engine
- Add a new file in `web/synthesis-methods/grids/` (e.g., `new-grid.js`) or `web/synthesis-methods/engines/` (e.g., `new-engine.js`).
- Update `web/ui/rectangle-handlers.js` to include the new grid/engine in `settings.gridType` or `settings.synthesisEngine` logic.
- Example:
  ```javascript
  // web/synthesis-methods/grids/new-grid.js
  export function mapFrame(data, width, height) {
      // Your mapping logic
      return data;
  }
  ```

### Fixing Bugs
- Check [Issues](https://github.com/MAMware/acoustsee/issues) for open bugs.
- Use the issue template to describe your fix.

## Submitting Changes

1. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit Changes**:
   ```bash
   git add .
   git commit -m "Add feature: describe your change"
   ```
3. **Push and Create a PR**:
   ```bash
   git push origin feature/your-feature-name
   ```
   Open a Pull Request on GitHub, referencing the related issue.

## Code Style
- Use JSDoc comments for functions (see `web/ui/event-dispatcher.js`).
- Follow ESLint rules (run `npm run lint`).
- Keep code modular.

## Testing
- Add tests in `tests/` for new features (see `tests/rectangle-handlers.test.js`).
- Run tests:
  ```bash
  npm test
  ```

## Code of Conduct
Please be kind, inclusive, and collaborative. Let’s make accessibility tech awesome!

## Questions?
Reach out via [Issues](https://github.com/MAMware/acoustsee/issues).

Happy contributing!
