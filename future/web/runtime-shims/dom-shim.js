export const DOM = {
  uiPanelRoot: { appendChild: (node) => { console.log('[DOM] appendChild', node && node.id); } },
  mainContainer: { addEventListener: (evt, cb) => { console.log('[DOM] mainContainer.addEventListener', evt); } },
  videoFeed: { play: () => {}, pause: () => {} },
  frameCanvas: { getContext: () => ({ putImageData: () => {} }) },
  button1: null,
  audioManager: null
};
