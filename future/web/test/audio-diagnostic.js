// Diagnostic test for audio system
// Usage: node audio-diagnostic.js or run in browser console

import { structuredLog } from '../utils/logging.js';

export async function runAudioDiagnostic() {
  console.log('=== AcoustSee Audio Diagnostic ===\n');

  const results = {
    audioApiAvailable: !!window.AudioContext || !!window.webkitAudioContext,
    mediaDevicesAvailable: !!navigator.mediaDevices,
    getUserMediaAvailable: !!navigator.mediaDevices?.getUserMedia,
    webWorkerAvailable: !!window.Worker,
    symptoms: [],
    recommendations: []
  };

  // Test 1: Audio API availability
  console.log('[TEST 1] Web Audio API availability');
  if (!results.audioApiAvailable) {
    console.error('❌ Web Audio API not available');
    results.symptoms.push('Web Audio API not supported');
    results.recommendations.push('Use a modern browser that supports Web Audio API');
    return results;
  }
  console.log('✓ Web Audio API available');

  // Test 2: Check if AudioContext can be created
  console.log('\n[TEST 2] AudioContext creation');
  let audioContext = null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    console.log(`✓ AudioContext created, state: ${audioContext.state}`);
    console.log(`  Sample Rate: ${audioContext.sampleRate} Hz`);
    console.log(`  Current Time: ${audioContext.currentTime} s`);
  } catch (e) {
    console.error(`❌ Failed to create AudioContext: ${e.message}`);
    results.symptoms.push(`AudioContext creation failed: ${e.message}`);
    results.recommendations.push('Try reloading the page or checking browser console for errors');
    return results;
  }

  // Test 3: Check audio context state
  console.log('\n[TEST 3] AudioContext state');
  if (audioContext.state === 'running') {
    console.log('✓ AudioContext is running');
  } else if (audioContext.state === 'suspended') {
    console.warn('⚠ AudioContext is suspended (waiting for user gesture)');
    results.symptoms.push('AudioContext suspended');
    results.recommendations.push('Click the Power On button to unlock audio');
  } else if (audioContext.state === 'closed') {
    console.error('❌ AudioContext is closed');
    results.symptoms.push('AudioContext is closed');
    results.recommendations.push('Reload the page to reinitialize audio');
  }

  // Test 4: Test basic sound output
  console.log('\n[TEST 4] Sound output capability');
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const masterGain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(masterGain);
    masterGain.connect(audioContext.destination);

    // Set up a short beep
    osc.frequency.value = 1000; // 1kHz
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.setValueAtTime(0, audioContext.currentTime + 0.1);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.1);

    console.log('✓ Test tone dispatched (listen for 1kHz beep)');
  } catch (e) {
    console.error(`❌ Failed to generate test tone: ${e.message}`);
    results.symptoms.push(`Test tone generation failed: ${e.message}`);
    results.recommendations.push('Check browser console for Web Audio API errors');
  }

  // Test 5: Check MediaStream and camera access
  console.log('\n[TEST 5] Camera/MediaStream availability');
  if (!results.mediaDevicesAvailable) {
    console.warn('⚠ navigator.mediaDevices not available');
    results.symptoms.push('mediaDevices API not available');
  } else if (!results.getUserMediaAvailable) {
    console.warn('⚠ getUserMedia not available');
    results.symptoms.push('getUserMedia API not available');
  } else {
    console.log('✓ MediaStream APIs available');
  }

  // Test 6: Check Web Worker support
  console.log('\n[TEST 6] Web Worker availability');
  if (!results.webWorkerAvailable) {
    console.error('❌ Web Workers not available');
    results.symptoms.push('Web Workers not supported');
    results.recommendations.push('Use a modern browser that supports Web Workers');
  } else {
    console.log('✓ Web Workers available');
  }

  // Test 7: Check console logging
  console.log('\n[TEST 7] Structured logging');
  try {
    structuredLog('INFO', 'Test structured log', { test: true });
    console.log('✓ Structured logging functional');
  } catch (e) {
    console.warn(`⚠ Structured logging issue: ${e.message}`);
  }

  // Summary
  console.log('\n=== Diagnostic Summary ===');
  if (results.symptoms.length === 0) {
    console.log('✓ All tests passed - audio system appears functional');
  } else {
    console.warn(`⚠ Found ${results.symptoms.length} potential issue(s):`);
    results.symptoms.forEach((s, i) => console.warn(`  ${i + 1}. ${s}`));
  }

  if (results.recommendations.length > 0) {
    console.log('\nRecommendations:');
    results.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  }

  return results;
}

// If run in browser, expose globally
if (typeof window !== 'undefined') {
  window.runAudioDiagnostic = runAudioDiagnostic;
}
