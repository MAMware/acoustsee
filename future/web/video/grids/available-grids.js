// Dynamic loader for grid mappers. This tries to import optional grid
// modules at runtime and returns only the ones that successfully load.
// WIP - This file is a work in progress and may change in future releases. 
// Preferred module contract:
//  - Export a function named `mapFunction(frameData, w, h, prevFrame, ctx)`
//  - Export an optional `meta` object with { id, name, author, description }
// This standard name simplifies the loader and reduces guesswork. Legacy
// export names are still supported as fallbacks.
//
// Future improvement (non-trivial): use a build-time registration step or
// indexer script (e.g., dinamical-files-indexer.js) to generate a manifest so
// new grid modules can be discovered without editing this file.

const GRID_MODULES = [
  'linear-pitch',    // NEW DEFAULT - Simple vertical position to pitch mapping
  'circle-of-fifths',
  'hex-tonnetz'
  // add more module basenames here as they are implemented R4925: we should try to automate this somehow.
];

let _gridsPromise = null;

export function loadAvailableGrids() {
  if (_gridsPromise) return _gridsPromise;
  _gridsPromise = (async () => {
    const results = await Promise.allSettled(
      GRID_MODULES.map(name => import(`./${name}.js`).then(m => ({ name, m })))
    );

    const grids = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.m) {
        const { name, m } = r.value;
        // Prefer standardized export name `mapFunction` and fall back to legacy
        // names for backward compatibility. R17925 we should try not to hardcode, lets brainstorm how to
        const mapFn = m.mapFunction || m.mapFrameToCircleOfFifths || m.mapFrameToHexTonnetz || m.mapFrameToCues || m.mapFrameToGrid;
        const id = (m.meta && m.meta.id) || name;
        if (typeof mapFn === 'function') {
          grids.push({ id, mapFunction: mapFn, meta: m.meta || {} });
        } else {
          // Module loaded but did not expose a recognized map function.
          if (typeof console !== 'undefined') console.warn(`Grid module ./` + name + `.js loaded but no map function exported.`);
        }
      } else {
        // optional: log missing modules in dev, R4925: This could be noisy there is no clear criterion for what grids should be expected.
        try {
          if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
            console.info(`Optional grid ./` + (r.status === 'rejected' ? r.reason?.message || r.reason : 'missing') );
          }
        } catch (e) {}
      }
    }
    return grids;
  })();
  return _gridsPromise;
}

// Backwards-compatible synchronous export: empty array initially.
// Consumers that need real grids should await loadAvailableGrids().
export const availableGridsData = [];
