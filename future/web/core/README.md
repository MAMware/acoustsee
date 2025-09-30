# Core Subsystem

This directory contains the central architectural components that form the "brain" of the AcoustSee application. It manages the application's state, orchestrates all actions via a command bus, and provides the context for all other subsystems to communicate.

## Core Architectural Pattern: A Centralized, Event-Driven Engine

The application is built around a single, headless **Engine** (`engine.js`). This engine is **not** a monolithic controller; rather, it is a lightweight coordinator that enforces a clean, one-way data flow and decouples all major subsystems.

### Key Files & Concepts

1.  **`engine.js` (The Engine):**
    *   **Responsibilities:**
        *   Holds the single, authoritative application `state` object.
        *   Provides the central `dispatch` method for queueing all actions.
        *   Manages a registry of `command handlers` that contain the actual business logic.
        *   Notifies all subsystems of state changes via the `onStateChange` listener.
    *   **Pattern:** This implements a standard **Redux-like, unidirectional data flow.**

2.  **`state.js` (The State Object):**
    *   **Responsibilities:**
        *   Defines the default shape of the application's entire state.
        *   This state object must be **fully JSON serializable**. It contains settings, flags, and data, but **no functions, class instances, or live browser objects** (like `MediaStream`). This "state hygiene" is critical for stability and debugging.

3.  **`commands/` (The Command Handlers):**
    *   **Responsibilities:**
        *   This directory contains all the application's business logic, organized into modular files (e.g., `media-commands.js`, `settings-commands.js`).
        *   Each file exports a `register...Commands(engine)` function, which is called at startup in `main.js`.
        *   Inside, individual command handlers are registered with the engine (e.g., `engine.registerCommandHandler('startProcessing', ...)`).
    *   **Pattern:** This is an implementation of the **Command Pattern**. It cleanly separates the "what to do" (the dispatched command) from the "how to do it" (the handler logic).

4.  **`context.js` (Dependency Injection and Legacy Bridge):**
    *   **Responsibilities:**
        *   Provides a simple mechanism for **Dependency Injection** (DI). For example, it holds a reference to the global `DOM` object.
    *   **Legacy Note:** This file contains older patterns like `getDispatchEvent()`. New code should **not** use these. Instead, the `engine` instance should be passed directly to any function that needs it during initialization.

## The Unidirectional Data Flow

Understanding this flow is the key to understanding the entire application.

1.  **Action:** The **UI** (or another subsystem) calls `engine.dispatch('someCommand', { payload })`. This is the *only* way to initiate a change in the application.

2.  **Command Handling:** The **Engine** finds the registered `command handler` for `'someCommand'` and executes it.

3.  **State Mutation:** The **Command Handler** contains the logic to perform the action. If necessary, it calls `engine.setState({ ... })` to update the application state. This is the *only* place where the state is ever modified.

4.  **Notification:** After the state is updated, the **Engine** notifies all registered listeners (via `onStateChange`) that a new state is available.

5.  **Reaction:** The **UI** and other subsystems receive the new state and re-render or react to the changes accordingly.

This clean, predictable cycle makes the application easy to debug, reason about, and extend.