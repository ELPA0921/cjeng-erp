import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentPage, pageNumbers } from './pagination.ts'

test('page buttons show the ends and the pages around the current one, with gaps between', () => {
  assert.deepEqual(pageNumbers(0, 1), [0])
  assert.deepEqual(pageNumbers(0, 4), [0, 1, 2, 3])
  assert.deepEqual(pageNumbers(0, 10), [0, 1, 2, null, 9])
  assert.deepEqual(pageNumbers(5, 10), [0, null, 3, 4, 5, 6, 7, null, 9])
  assert.deepEqual(pageNumbers(9, 10), [0, null, 7, 8, 9])
  assert.deepEqual(pageNumbers(3, 10), [0, 1, 2, 3, 4, 5, null, 9])
})

test('the shown page follows a focused row and stays within the pages there are', () => {
  assert.equal(currentPage(0, 25, 3), 0)
  assert.equal(currentPage(60, 25, 1), 1)
  assert.equal(currentPage(60, 25, 7), 2)
  assert.equal(currentPage(60, 25, 0, 50), 2)
  assert.equal(currentPage(60, 25, 2, 24), 0)
})
