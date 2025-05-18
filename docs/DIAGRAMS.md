## Analysis
(5/18/2024, first two graphs are not updated to last main.js)

**Main Components:**
-  Audio Initialization: initializeAudio sets up the audio context and oscillators.
-  Tonnetz Grid: A 16x16 grid maps frequencies based on a circle of fifths for musical notes.
-  Frame Processing: mapFrameToTonnetz and playAudio process video frames to detect motion and map it to musical notes.
-  User Interactions: Touch events on topLeft, topRight, bottomLeft, and bottomRight adjust settings (FPS, note mode, amplitude) or start/stop navigation.
-  Frame Loop: processFrame captures video frames, converts them to grayscale, and triggers audio playback.

**Flow:**
 - The program starts with initialization (audio and grid setup).
 - User interactions (touch events) trigger settings changes or start/stop the video/audio loop.
 - The main loop (processFrame) processes video frames and generates audio based on motion.
 - Debug overlay toggles visibility and displays performance metrics.

**Key Functions:**
 - initializeAudio: Sets up oscillators for sound generation.
 - mapFrameToTonnetz: Maps video frame motion to musical notes.
 - playAudio: Processes frames and updates oscillators.
 - processFrame: Drives the main video-to-audio loop.

```mermaid  
graph TD
    A[Start] --> B[Initialize Variables and Settings]
    B --> C[Setup Tonnetz Grid]
    C --> D{User Interaction}

    D -->|Touch bottomRight| E{Stream Active?}
    E -->|No| F[Initialize Audio]
    F --> G[Start Camera Stream]
    G --> H[Start processFrame Interval]
    E -->|Yes| I[Stop Stream and Clear Interval]

    D -->|Touch topLeft| J[Cycle Update Interval]
    D -->|Touch topRight| K[Cycle Note Mode]
    D -->|Touch bottomLeft| L[Cycle Max Amplitude]
    D -->|Double-click topLeft| M[Toggle Debug Overlay]

    H --> N[processFrame]
    N --> O[Capture Video Frame]
    O --> P[Convert to Grayscale]
    P --> Q[playAudio]
    Q --> R[Split Frame: Left/Right]
    R --> S[mapFrameToTonnetz]
    S -->|Left Frame| T[Detect Motion, Map to Notes]
    S -->|Right Frame| U[Detect Motion, Map to Notes]
    T --> V[Update Oscillators]
    U --> V
    V --> W[Update Performance Metrics]
    W -->|Debug Visible| X[Update Debug Text]
    W --> Y{Continue Loop}
    Y -->|Interval Active| N

    I --> D
    J --> D
    K --> D
    L --> D
    M --> D
```
**The mapFrameToTonnetz function:**

  Takes parameters: 
  - frameData (grayscale pixel data), width, height,
  - prevFrameData (previous frame for motion detection),
  - panValue (stereo panning, -1 for left, 1 for right).0
 - Calculates grid dimensions (gridWidth, gridHeight) by dividing the frame into a 16x16 grid.
 - Creates a new newFrameData array to store the current frame.
 - Detects motion by comparing the current frame (frameData) with the previous frame (prevFrameData):
   - Iterates over each pixel in the frame.
   - Computes the absolute difference (delta) between corresponding pixels.
   - If delta > 30 (motion threshold), records the grid coordinates (gridX, gridY), intensity, and delta in movingRegions.
 - Sorts movingRegions by delta (motion strength) in descending order.
 - Selects up to 4 regions with the strongest motion.
  For each selected region:
   - Retrieves the frequency from the tonnetzGrid using gridX and gridY.
   - Calculates amplitude based on delta (scaled between 0.02 and settings.maxAmplitude).
   - Assigns harmonics based on settings.noteMode:
     - Major: Adds major third and fifth (freq * 2^(4/12), freq * 2^(7/12)).
     - Minor: Adds minor third and fifth (freq * 2^(3/12), freq * 2^(7/12)).
     - Dissonant: Adds tritone (freq * 2^(6/12)).
   - Stores the note data (freq, amplitude, harmonics, pan) in the notes array.
 - Returns an object containing notes and newFrameData.

```mermaid  
graph TD
    A[Start: mapFrameToTonnetz] --> B[Receive input parameters]
    B --> C[Calculate grid width]
    C --> D[Calculate grid height]
    D --> E[Create newFrameData array]
    E --> F{Previous frame data exists?}
    
    F -->|Yes| G[Initialize movingRegions array]
    G --> H[Start loop over height]
    H --> I[Start loop over width]
    I --> J[Calculate pixel index]
    J --> K[Calculate pixel difference]
    K --> L{Pixel difference > 30?}
    L -->|Yes| M[Calculate grid X coordinate]
    M --> N[Calculate grid Y coordinate]
    N --> O[Add region to movingRegions]
    O --> P{Next width iteration?}
    P -->|Yes| I
    P -->|No| Q{Next height iteration?}
    Q -->|Yes| H
    Q -->|No| R[Sort movingRegions by strength]
    F -->|No| R

    R --> S[Initialize notes array]
    S --> T[Start loop over top 4 regions]
    T --> U[Get region data]
    U --> V[Get frequency from tonnetzGrid]
    V --> W[Calculate note amplitude]
    W --> X{Note mode setting?}
    
    X -->|major| Y[Set major chord harmonics]
    X -->|minor| Z[Set minor chord harmonics]
    X -->|dissonant| AA[Set dissonant chord harmonics]
    
    Y --> AB[Add note to notes]
    Z --> AB
    AA --> AB
    
    AB --> AC{Next region iteration?}
    AC -->|Yes| T
    AC -->|No| AD[Return notes and newFrameData]
    AD --> AE[End]
```

**The oscillator update logic in playAudio:**

 - Takes the allNotes array (combining notes from left and right frames) and iterates over the oscillators array.
  For each oscillator (up to 8, indexed by oscIndex):
   - If the oscillator index is within the allNotes length:
     - Assigns the note's freq, amplitude, harmonics, and pan to the oscillator.
     - Sets the oscillator type based on frequency (square for < 400 Hz, triangle for < 1000 Hz, sine otherwise).
     - Uses setTargetAtTime to smoothly transition frequency, gain, and panning over 0.015 seconds.
     - If harmonics exist and there are enough oscillators, updates additional oscillators with harmonic frequencies and reduced amplitude (0.5x).
     - Marks the oscillator as active.
   - Otherwise, sets the gain to 0 and marks it as inactive.
 - Increments oscIndex to track the next available oscillator, accounting for harmonics.


```mermaid
graph TD
    A[Start Oscillator Updates] --> B[Set oscIndex to 0]
    B --> C[Loop through oscillators]
    C --> D{oscIndex less than allNotes length?}
    
    D -->|Yes| E[Retrieve note data]
    E --> F[Extract note properties]
    F --> G[Determine oscillator type]
    G --> H{frequency less than 400?}
    H -->|Yes| I[Set type to square]
    H -->|No| J{frequency less than 1000?}
    J -->|Yes| K[Set type to triangle]
    J -->|No| L[Set type to sine]
    
    I --> M[Set frequency target]
    K --> M
    L --> M
    M --> N[Set gain target]
    N --> O[Set panner target]
    O --> P[Mark oscillator active]
    P --> Q{harmonics exist and enough oscillators?}
    
    Q -->|Yes| R[Loop through harmonics]
    R --> S[Get harmonic frequency]
    S --> T[Get next oscillator]
    T --> U[Set harmonic frequency target]
    U --> V[Set harmonic gain target]
    V --> W[Set harmonic panner target]
    W --> X[Mark harmonic oscillator active]
    X --> Y{Next harmonic?}
    Y -->|Yes| R
    Y -->|No| Z[Increase oscIndex by harmonic count]
    
    Q -->|No| AA[Increase oscIndex]
    Z --> AA
    
    D -->|No| BB[Set gain target to 0]
    BB --> CC[Mark oscillator inactive]
    CC --> DD{Next oscillator?}
    
    AA --> DD
    DD -->|Yes| C
    DD -->|No| EE[End Oscillator Updates]
```
Original: 
- Located in playAudio, starting around line 152.
- allNotes is created by combining leftResult.notes and rightResult.notes.
- Oscillator type is dynamically set based on frequency:
square if freq < 400 Hz.
triangle if freq < 1000 Hz.
sine otherwise.
- Up to 8 oscillators, with harmonics assigned to additional oscillators (amplitude * 0.5).
- Loop structure: Iterates over oscillators, assigning notes and harmonics, or silencing unused oscillators.

Updated:
- Located in playAudio, starting around line 152.
Key differences:
- allNotes is now sorted by amplitude in descending order: const allNotes = [...leftResult.notes, ...rightResult.notes].sort((a, b) => b.amplitude - a.amplitude);.
- Oscillator count increased to 32 (from 8).
- Oscillator type is fixed to 'sine' (no frequency-based type selection).
- Harmonic assignment logic remains the same (amplitude * 0.5 for harmonics).
- Core loop structure is unchanged: iterates over oscillators, assigns notes and harmonics, or silences unused oscillators.

```mermaid
graph TD
    A[Start Oscillator Updates] --> B[Set oscIndex to 0]
    B --> C[Combine left and right notes]
    C --> D[Sort notes by amplitude descending]
    D --> E[Loop through oscillators]
    E --> F{oscIndex less than allNotes length?}
    
    F -->|Yes| G[Retrieve note data]
    G --> H[Extract note properties]
    H --> I[Set type to sine]
    I --> J[Set frequency target]
    J --> K[Set gain target]
    K --> L[Set panner target]
    L --> M[Mark oscillator active]
    M --> N{harmonics exist and enough oscillators?}
    
    N -->|Yes| O[Loop through harmonics]
    O --> P[Get harmonic frequency]
    P --> Q[Get next oscillator]
    Q --> R[Set harmonic type to sine]
    R --> S[Set harmonic frequency target]
    S --> T[Set harmonic gain target]
    T --> U[Set harmonic panner target]
    U --> V[Mark harmonic oscillator active]
    V --> W{Next harmonic?}
    W -->|Yes| O
    W -->|No| X[Increase oscIndex by harmonic count]
    
    N -->|No| Y[Increase oscIndex]
    X --> Y
    
    F -->|No| Z[Set gain target to 0]
    Z --> AA[Mark oscillator inactive]
    AA --> BB{Next oscillator?}
    
    Y --> BB
    BB -->|Yes| E
    BB -->|No| CC[End Oscillator Updates]
```
