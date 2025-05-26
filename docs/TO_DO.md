# Future Features

Sorted by priority

- Mermaid diagrams to reflect current Modular Single Responsability Principle
- Further Modularity: e.g., modularize audio-processor.js
- New languajes for the speech sinthetizer
- Haptic feedback via Vibration API
- Console log on device screen for debuggin.
- Optimizations aiming the use less resources and achieve better performance, ie: implementing Web Workers and using WebAssembly.
- Reintroducing Hilbert curves.
- Gabor filters for motion detection.
- New grid types and synth engines
- Voting system for grid and synth engines.
- Consider making User selectable synth engine version.
- Consider adding support for VST like plugins.
- Testing true HRTF, loading CIPIC HRIR data.
- New capabilities like screen/video capture to sound engine.
- Android/iOS app developtment if considerable performance gain can be achieved.


Example of UI Templates:

- Bezel type template: The top trapezoid is (should be) where the setting toggle is, this toggle shifts the function of the lateral trapezoid a the left (dayNight toggle without shift) and right (languaje selectror for speech synthesis) for a cursor for options navigation such as grid and synth engine both versioned selector.

The confirmation is done by pressing the center vertical rectagunlar square, that also works as webcam feed preview/canvas

The start and stop of the navigation is donde by pressing the buttom trapezoid.

- A reintroduction of a frames per seconds (FPS) toggle that is usefull if your device stutters or generates artifacts due to processing issues, likely by a cpu processor limitation will be reconsidered as a configuration option, among the grid and synth engine selector.

A console log live view and a copy feature is being considered too.
