# Contributing to AcoustSee
Welcome to `acoustsee`! We’re building spatial audio navigation for the visually impaired, and we’d love your help.

## How to contribute

1. Fork the repo and create a feature branch from `developing`.
2. Work in the `web/` directory for frontend changes.
3. Test locally with `npm start` and verify on Chrome/Safari.
4. Write unit tests in `tests/` and ensure `npm test` passes.
5. Submit a PR to `developing` with a clear description.
6. **Join the discussion**: Share ideas on GitHub or X (@MAMware).

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

### Example Commands

 Create the developing branch from main
```sh
git checkout -b developing main
git push origin developing
```
 Work on a feature branch
```
git checkout -b feature/new-feature developing
```

 Push the feature branch to the remote repository
```
git push origin feature/new-feature
```

 Create a pull request to merge feature/new-feature into developing
 - (This is done via the GitHub UI)

 Once the feature is merged into developing
```
git checkout developing
git merge feature/new-feature
git push origin developing
```

 Periodically merge developing into staging for testing
```
git checkout -b staging developing
git push origin staging
```

 Provide the staging URL to end users for testing
 Once testing is complete, merge developing into main

```
git checkout main
git merge developing
git push origin main
```

## Setup
- **Web**: Run `cd web; python3 -m http.server 8000`.
- **Python**: See `INSTALL.md` for virtual environment setup.
- **Docs**: Check `docs/` for future features.

## Code of Conduct
Please be kind, inclusive, and collaborative. Let’s make accessibility tech awesome!
