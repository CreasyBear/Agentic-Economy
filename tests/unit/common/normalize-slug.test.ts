import { describe, expect, it } from 'vitest'

import { normalizeSlug } from '@/modules/common/normalize-slug'

describe('normalizeSlug', () => {
  it('uses slugify transliteration and separator collapse', () => {
    expect(normalizeSlug('Café & Co.')).toBe('cafe-and-co')
  })

  it('caps canonical slugs at 72 characters and removes a cut-off dash', () => {
    expect(normalizeSlug(`${'a'.repeat(71)} service`)).toBe('a'.repeat(71))
  })

  it('keeps empty input empty for callers that own their fallback policy', () => {
    expect(normalizeSlug('---')).toBe('')
  })
})
