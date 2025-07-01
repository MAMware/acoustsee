import { processFrame } from "./frame-processor.js";
import {
  initializeAudio,
  isAudioInitialized,
  setAudioContext,
  audioContext,
} from "../audio-processor.js";
import {
  settings,
  setStream,
  setAudioInterval,
  setSkipFrame,
} from "../state.js";
import { speak } from "./utils.js";

export function setupRectangleHandlers({ dispatchEvent, DOM }) {
  let touchCount = 0;
  let lastFrameTime = performance.now();
  let audioEnabled = false;
  let rafId;
  let audioContextInitialized = false; // New flag for power-on state

  console.log("setupRectangleHandlers: Starting setup");

  if (!DOM) {
    console.error("DOM is undefined in setupRectangleHandlers");
    return;
  }

  if (DOM.debug) {
    DOM.debug.style.display = "none";
    console.log("Debug panel hidden on load");
  } else {
    console.error("Debug panel not found");
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate && isAudioInitialized) {
      try {
        navigator.vibrate(50);
      } catch (err) {
        console.warn("Vibration blocked:", err.message);
      }
    }
  }

  // Power On function to initialize AudioContext
  function powerOnAudio(event) {
    if (event.cancelable) event.preventDefault();
    console.log("Power On touched");
    tryVibrate(event);
    if (audioContextInitialized) return;
    try {
      const newContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      if (newContext.state === "suspended") {
        newContext.resume(); // Synchronous resume
        if (newContext.state !== "running")
          throw new Error("AudioContext failed to resume");
      } else if (newContext.state !== "running") {
        throw new Error(`Unexpected state: ${newContext.state}`);
      }
      setAudioContext(newContext);
      audioContextInitialized = true; // Mark as initialized
      console.log("AudioContext powered on successfully");
      speak("powerOn", { message: "Audio system ready. Tap Start to begin." });
    } catch (err) {
      console.error("Power On failed:", err.message);
      dispatchEvent("logError", { message: err.message });
      speak("audioError", { message: "Power on failed. Try again." });
    }
  }

  async function ensureAudioContext() {
    if (!isAudioInitialized && audioContext) {
      try {
        const initSuccess = await initializeAudio(audioContext);
        if (initSuccess) {
          audioEnabled = true;
          if (DOM.audioToggle) DOM.audioToggle.textContent = "Audio On";
          await speak("audioOn");
          return true;
        }
      } catch (err) {
        console.error("Audio initialization failed:", err.message);
        dispatchEvent("logError", {
          message: `Audio init failed: ${err.message}`,
        });
        await speak("audioError");
        audioEnabled = false;
        return false;
      }
    }
    return isAudioInitialized;
  }

  function processFrameLoop(timestamp) {
    if (!settings.stream || !audioEnabled) {
      console.log("processFrameLoop skipped: stream or audio not enabled", {
        stream: !!settings.stream,
        audioEnabled,
      });
      return;
    }
    const deltaTime = timestamp - lastFrameTime;
    if (deltaTime < settings.updateInterval) {
      rafId = requestAnimationFrame(processFrameLoop);
      setSkipFrame(true);
      return;
    }
    setSkipFrame(false);
    lastFrameTime = timestamp;
    processFrame(DOM.videoFeed, DOM.imageCanvas, DOM);
    rafId = requestAnimationFrame(processFrameLoop);
  }

  if (DOM.audioToggle) {
    DOM.audioToggle.addEventListener("touchstart", powerOnAudio); // Use powerOnAudio here
  } else console.error("audioToggle not found");

  if (DOM.startStopBtn) {
    DOM.startStopBtn.addEventListener("touchstart", async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log("startStopBtn touched");
      tryVibrate(event);
      try {
        if (!audioContextInitialized) {
          await speak("audioNotReady", {
            message: "Please power on audio first.",
          });
          return;
        }
        if (!audioEnabled) {
          const success = await ensureAudioContext();
          if (!success) return;
        }
        if (settings.stream) {
          settings.stream.getTracks().forEach((track) => track.stop());
          setStream(null);
          if (DOM.videoFeed) {
            DOM.videoFeed.srcObject = null;
            DOM.videoFeed.style.display = "none";
          }
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
            setAudioInterval(null);
          }
          if (audioContext) await audioContext.suspend();
          await speak("startStop", { state: "stopped" });
          dispatchEvent("updateUI", {
            settingsMode: false,
            streamActive: false,
          });
        } else {
          if (DOM.loadingIndicator)
            DOM.loadingIndicator.style.display = "block";
          const isLowEndDevice = navigator.hardwareConcurrency < 4;
          settings.updateInterval = isLowEndDevice ? 100 : 50;
          if (DOM.imageCanvas) {
            DOM.imageCanvas.width = isLowEndDevice ? 24 : 48;
            DOM.imageCanvas.height = isLowEndDevice ? 18 : 36;
          }
          const constraints = {
            video: {
              facingMode: "user",
              width: { ideal: 320 },
              height: { ideal: 240 },
            },
          };
          const newStream =
            await navigator.mediaDevices.getUserMedia(constraints);
          setStream(newStream);
          if (DOM.videoFeed) {
            DOM.videoFeed.srcObject = newStream;
            await DOM.videoFeed.play();
            DOM.videoFeed.style.display = "block";
            await speak("startStop", { state: "started" });
            setAudioInterval("raf");
            lastFrameTime = performance.now();
            processFrameLoop(lastFrameTime);
            dispatchEvent("updateUI", {
              settingsMode: false,
              streamActive: true,
            });
          }
          if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = "none";
        }
      } catch (err) {
        console.error("startStopBtn error:", err.message);
        dispatchEvent("logError", { message: err.message });
        await speak("cameraError");
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = "none";
      }
    });
  } else console.error("startStopBtn not found");

  // ... (rest of the handlers remain similar, e.g., languageBtn, closeDebug, emailDebug)

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && settings.stream && audioContext) {
      audioContext.suspend();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
        setAudioInterval(null);
      }
    } else if (!document.hidden && settings.stream && audioContext) {
      audioContext.resume();
      processFrameLoop(performance.now());
    }
  });

  setTimeout(() => {
    Object.entries(DOM).forEach(([key, value]) => {
      console.log(`DOM Element - ${key}:`, value);
    });
  }, 100);

  console.log("setupRectangleHandlers: Setup complete");
}
