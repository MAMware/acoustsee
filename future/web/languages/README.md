# Languages (Internationalization - i18n)

This directory contains the language files for the application.

## How It Works

- Language Files: JSON files per locale (e.g., `en-US.json`).
- Available Languages: `available-languages.js` exports supported language metadata.
- Core Utilities: `utils/utils.js` implements `getText`, `setLanguage`, and `translatePage`.
- DOM Translation: Elements with `data-i18n` are translated by `translatePage()`.

## Adding a Language

1. Copy an existing locale JSON to `fr-FR.json`.
2. Translate strings.
3. Add an entry to `available-languages.js`.
