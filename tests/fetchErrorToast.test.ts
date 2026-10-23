import { describe, it, expect } from 'vitest';
import { shouldShowFetchError } from '../src/lib/fetchErrorToast';
describe('shouldShowFetchError', () => {
  it('shows once then stays quiet for 10 minutes', () => {
    expect(shouldShowFetchError('k', 1000)).toBe(true);
    expect(shouldShowFetchError('k', 1000 + 9 * 60000)).toBe(false);
    expect(shouldShowFetchError('k', 1000 + 10 * 60000)).toBe(true);
  });
});
