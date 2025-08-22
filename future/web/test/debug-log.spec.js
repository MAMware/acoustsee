import { JSDOM } from 'jsdom';

import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../../future/web/ui/debug-log.js';

describe('debug-log batching and buffer', () => {
  let dom;
  let container;

  beforeEach(() => {
    dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`);
    global.document = dom.window.document;
    global.window = dom.window;
    container = dom.window.document.createElement('div');
    container.id = 'debug-log-view';
    dom.window.document.body.appendChild(container);
  });

  afterEach(() => {
    // cleanup globals
    delete global.document;
    delete global.window;
  });

  test('buffering and export', () => {
    clearLogs();
    debugLog('INFO', 'first');
    debugLog('WARN', 'second');

    // export should contain two entries
    const data = JSON.parse(exportLogs());
    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data[data.length - 2].text).toMatch(/first/);
    expect(data[data.length - 1].text).toMatch(/second/);
  });

  test('setLogView flushes buffer into DOM', () => {
    clearLogs();
    debugLog('INFO', 'one');
    debugLog('INFO', 'two');

    setLogView(container, { maxEntries: 100 });
    // After setLogView, container should have children (2 entries)
    const rows = Array.from(container.querySelectorAll('.log-entry'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[rows.length - 2].textContent).toMatch(/one/);
    expect(rows[rows.length - 1].textContent).toMatch(/two/);
  });

  test('pending queue flush and clearLogs clears pending', (done) => {
    clearLogs();
    setLogView(container, { maxEntries: 100 });

    // simulate many logs quickly
    for (let i = 0; i < 20; i++) debugLog('DEBUG', `msg-${i}`);

    // wait a frame for rAF to flush
    setTimeout(() => {
      const rows = container.querySelectorAll('.log-entry');
      expect(rows.length).toBeGreaterThan(0);

      // now clear
      clearLogs();
      expect(container.innerHTML).toBe('');
      done();
    }, 50);
  });

  test('setPaused prevents flush', (done) => {
    clearLogs();
    setLogView(container, { maxEntries: 100 });
    setPaused(true);
    debugLog('INFO', 'paused-msg');
    setTimeout(() => {
      const rows = container.querySelectorAll('.log-entry');
      expect(rows.length).toBe(0);
      setPaused(false);
      done();
    }, 50);
  });
});
