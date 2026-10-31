import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeAt, restoreAt } from '../src/hooks/useUndoableList';

test('removeAt drops one item and leaves the original untouched', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(removeAt(list, 1), ['a', 'c']);
  assert.deepEqual(list, ['a', 'b', 'c']);
});

test('removeAt ignores out-of-range indexes', () => {
  assert.deepEqual(removeAt(['a'], 5), ['a']);
  assert.deepEqual(removeAt(['a'], -1), ['a']);
});

test('restoreAt puts the item back at its old position', () => {
  assert.deepEqual(restoreAt(['a', 'c'], 1, 'b'), ['a', 'b', 'c']);
});

test('restoreAt clamps when the list got shorter or the index is odd', () => {
  assert.deepEqual(restoreAt(['a'], 9, 'z'), ['a', 'z']);
  assert.deepEqual(restoreAt(['a'], -3, 'z'), ['z', 'a']);
});

test('remove then restore round-trips, including empty-string rows', () => {
  const list = ['', 'squat', ''];
  const removed = list[0];
  assert.deepEqual(restoreAt(removeAt(list, 0), 0, removed), list);
});
