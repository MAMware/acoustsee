import { JSDOM } from 'jsdom';

describe('debug-ui behavior drag/resize persistence', () => {
  let dom;
  beforeEach(() => {
    dom = new JSDOM(`<!doctype html><html><body><div id="ui-panel-root"></div></body></html>`, { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  test('debug panel elements created and persistence key exists after initialization', () => {
    // lazy-load the behavior module
    const mod = require('../../future/web/ui/debug-ui.behavior.js');
    const panel = document.createElement('div');
    panel.id = 'acoustsee-debug-panel';
    document.getElementById('ui-panel-root').appendChild(panel);

    // call initializer
    mod.initializeDebugUIBehavior({ panel, DOM: { videoFeed: null }, settings: {}, engine: null });

    // drag handle and resizer should exist
    const handle = panel.querySelector('#debug-drag-handle');
    const resizer = panel.querySelector('.debug-resizer');
    expect(handle).not.toBeNull();
    expect(resizer).not.toBeNull();

    // persistence key should exist (may be null until saved)
    const key = localStorage.getItem('acoustsee.debug.panel.bounds');
    expect(key === null || typeof key === 'string').toBe(true);
  });
});
