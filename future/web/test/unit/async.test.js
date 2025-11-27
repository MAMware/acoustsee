// File: web/test/async.test.js
import { withErrorBoundary } from '../../utils/async.js';

describe('async', () => {
  test('withErrorBoundary handles success', async () => {
    const mockFn = async () => 'success';
    const { data, error } = await withErrorBoundary(mockFn);
    expect(data).toBe('success');
    expect(error).toBeNull();
  });

  test('withErrorBoundary handles error', async () => {
    const mockFn = async () => { throw new Error('test error'); };
    const { data, error } = await withErrorBoundary(mockFn);
    expect(data).toBeNull();
    expect(error.message).toBe('test error');
  });
});
