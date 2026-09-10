export const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'can',
  'find',
  'for',
  'from',
  'get',
  'how',
  'i',
  'in',
  'into',
  'is',
  'me',
  'need',
  'of',
  'on',
  'or',
  'please',
  'tell',
  'that',
  'the',
  'this',
  'to',
  'use',
  'want',
  'what',
  'when',
  'where',
  'which',
  'who',
  'with',
])

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
