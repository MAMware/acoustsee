// Dynamic loader for grid mappers. This tries to import optional grid
// modules at runtime and returns only the ones that successfully load.
// This avoids adding fake/stub modules into production code just to satisfy
// static import checks. R4925: This file should allow for easier addition of new grid modules without modifying core code.-But, does this works on GitHubPages?. The legacy method from /scrips/dinamical-files-indexer.js used to work fine altought it had to be run after grids/synths/or languages were added.

const GRID_MODULES = [
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
        // Try common export names for compatibility with various mappers - R4925: This seems hardcoded and not very scalable. We could use a registration system instead?.
        const mapFn = m.mapFrameToCircleOfFifths || m.mapFrameToHexTonnetz || m.mapFrameToCues || m.mapFrameToGrid;
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
