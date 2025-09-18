# UI Subsystem

This directory contains all user interface modules. The project uses a pluggable UI architecture, allowing different UIs to be loaded based on the application's mode.

## Key Files & Concepts

- `ui-registry.js`: Central registry where UI modules register their initializer functions.
- UI Module Contract:
  1. Export `initialize...UI(engine, DOM)`.
  2. Call `registerComponent('name', initialize...UI)`.
  3. Interact with core only via `engine.dispatch()`.

## Current UIs

- `touch-gestures/`: Primary accessible UI for non-visual interaction.
- `dev-panel/`: Debugging dashboard, loaded with `?debug=true`.
