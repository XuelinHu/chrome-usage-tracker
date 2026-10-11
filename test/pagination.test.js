import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/lib/pagination.js';

test('paginates rows and reports the final page', () => {
  const result = paginate(Array.from({ length: 21 }, (_, index) => index + 1), 3, 10);
  assert.deepEqual(result.rows, [21]);
  assert.equal(result.page, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.total, 21);
});

test('clamps a stale page after the result set shrinks', () => {
  const result = paginate([1, 2, 3], 8, 10);
  assert.deepEqual(result.rows, [1, 2, 3]);
  assert.equal(result.page, 1);
});

test('empty results still have a stable first page', () => {
  assert.deepEqual(paginate([], 0, 10), {
    rows: [], page: 1, pageSize: 10, total: 0, totalPages: 1
  });
});
