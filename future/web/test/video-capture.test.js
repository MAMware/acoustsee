describe('processFrame', () => {
  test('handles non-finite dimensions', async () => {
    jest.spyOn(global.console, 'error').mockImplementation(() => {});
    jest.spyOn(structuredLog, 'call').mockImplementation(() => {});
    const DOM = { frameCanvas: { getContext: () => null }, videoFeed: {} };
    jest.spyOn(getDOM, 'call').mockReturnValue(DOM);
    const result = await processFrame(NaN, 240);
    expect(result).toEqual({ notes: [], newFrameData: null, avgIntensity: 0 });
    expect(structuredLog).toHaveBeenCalledWith('DEBUG', 'processFrame dimensions', { rawWidth: NaN, rawHeight: 240 });
    expect(console.error).toHaveBeenCalledWith("Canvas context not found");
  });
});
