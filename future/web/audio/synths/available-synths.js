// ...existing code...
import { playFmSynthesis, synthMeta as fmSynthMeta } from './fm-synthesis.js';
import { playSawtoothPad, synthMeta as sawtoothMeta } from './sawtooth-pad.js';
import { playSineWave, synthMeta as sineMeta } from './sine-wave.js';
import { playStrings, synthMeta as stringsMeta } from './strings.js';

// dev: fail early so broken synth modules are fixed rather than silently tolerated
const DEV_FAIL_FAST = true;
const REQUIRED_META = ['id','name','maxNotes'];

// Validate meta but collect errors instead of throwing immediately. Returns
// an array of error messages (empty if ok).
function collectMetaErrors(meta, moduleId) {
  const errors = [];
  if (!meta || typeof meta !== 'object') {
    errors.push(`Synth module "${moduleId}" missing synthMeta export (object).`);
    return errors;
  }
  for (const k of REQUIRED_META) {
    if (meta[k] == null) {
      errors.push(`Synth "${moduleId}" synthMeta missing required field "${k}".`);
    }
  }
  return errors;
}

const modules = [
  { play: playFmSynthesis, meta: fmSynthMeta, id: 'fm-synthesis' },
  { play: playSawtoothPad, meta: sawtoothMeta, id: 'sawtooth-pad' },
  { play: playSineWave, meta: sineMeta, id: 'sine-wave' },
  { play: playStrings, meta: stringsMeta, id: 'strings' },
];

// run validation for all modules and aggregate errors in dev mode
const allErrors = [];
const wrapped = modules.map(m => {
  const errs = collectMetaErrors(m.meta, m.id);
  if (errs.length) allErrors.push(...errs.map(e => ({ id: m.id, msg: e })));
  return {
    id: m.meta?.id || m.id,
    playFunction: m.play,
    meta: m.meta || {}
  };
});

if (DEV_FAIL_FAST && allErrors.length > 0) {
  const summary = allErrors.map(e => `- [${e.id}] ${e.msg}`).join('\n');
  throw new Error(`available-synths validation failed:\n${summary}`);
}

export const availableEnginesData = wrapped;