import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowFetchError } from '../src/lib/fetchErrorToast';
test('shows once then stays quiet for 10 minutes', () => {
  assert.equal(shouldShowFetchError('k', 1000), true);
  assert.equal(shouldShowFetchError('k', 1000 + 9 * 60000), false);
  assert.equal(shouldShowFetchError('k', 1000 + 10 * 60000), true);
});
