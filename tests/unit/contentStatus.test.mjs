import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTENT_STATUS_OPTIONS, contentStatusLabel, normalizeContentStatus } from '../../src/lib/contentStatus.js'

test('content status accepts supported values and defaults unknown values to ongoing', () => {
  assert.equal(normalizeContentStatus('ongoing'), 'ongoing')
  assert.equal(normalizeContentStatus('COMPLETED'), 'completed')
  assert.equal(normalizeContentStatus('upcoming'), 'upcoming')
  assert.equal(normalizeContentStatus('unknown'), 'ongoing')
})

test('content status labels stay consistent across catalogue cards', () => {
  assert.equal(contentStatusLabel('ongoing'), 'Ongoing')
  assert.equal(contentStatusLabel('completed'), 'Completed')
  assert.equal(contentStatusLabel('upcoming'), 'Coming Soon')
  assert.deepEqual(CONTENT_STATUS_OPTIONS.map((option) => option.value), ['ongoing', 'completed', 'upcoming'])
})
