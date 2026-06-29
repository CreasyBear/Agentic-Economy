import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const protectedActionRouteFiles = [
  'src/routes/owner.actions.tsx',
  'src/routes/owner.actions.$proposalId.tsx',
  'src/routes/owner.actions.$proposalId.receipt.tsx',
  'src/routes/admin.protected-actions.tsx',
  'src/routes/admin.protected-actions.$proposalId.tsx',
] as const

describe('protected action route SEO posture', () => {
  it('keeps owner/admin protected-action routes noindexed and non-public-marketing', () => {
    for (const file of protectedActionRouteFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source).toContain("name: 'robots'")
      expect(source).toContain("content: 'noindex'")
      expect(source).not.toMatch(/\b(?:canonicalUrl|AggregateRating|Offer|priceRange)\b/)
    }
  })
})
