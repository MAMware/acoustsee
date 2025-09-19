export function structuredLog(level, text, data) {
  const out = { level, text, data };
  if (level === 'ERROR') console.error('[LOG]', JSON.stringify(out));
  else if (level === 'WARN') console.warn('[LOG]', JSON.stringify(out));
  else console.info('[LOG]', JSON.stringify(out));
}
