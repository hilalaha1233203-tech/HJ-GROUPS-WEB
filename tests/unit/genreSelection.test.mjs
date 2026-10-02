import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GENRE_FALLBACK,
  MAX_GENRES,
  hasGenre,
  normalizeGenreSelection,
  serializeGenreSelection,
} from '../../src/lib/genreSelection.js'

test('normalizes comma-separated genres for edit compatibility', () => {
  assert.deepEqual(
    normalizeGenreSelection('Fantasy, Action, Romance'),
    ['Fantasy', 'Action', 'Romance']
  )
})

test('serializes selected genres for the existing text column', () => {
  assert.equal(
    serializeGenreSelection(['Fantasy', 'Action', 'Action', 'Romance']),
    'Fantasy, Action, Romance'
  )
})

test('matches any selected genre while keeping the existing text storage model', () => {
  assert.equal(hasGenre('Fantasy, Action, Romance', 'Action'), true)
  assert.equal(hasGenre('Fantasy, Action, Romance', 'Horror'), false)
})

test('keeps one fallback genre when the value is empty', () => {
  assert.deepEqual(normalizeGenreSelection(''), GENRE_FALLBACK)
  assert.equal(MAX_GENRES, 5)
})
