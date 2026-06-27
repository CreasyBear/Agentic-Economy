import { describe, expect, it } from 'vitest'

import { aeStatusPresentation, aeStatusValues } from '@/lib/ui/status-presentation'

describe('AE status presentation contract', () => {
  it('keeps every status mapped to text, tone, and priority', () => {
    for (const status of aeStatusValues) {
      expect(aeStatusPresentation[status].label.length).toBeGreaterThan(0)
      expect(aeStatusPresentation[status].description.length).toBeGreaterThan(0)
      expect(aeStatusPresentation[status].priority).toMatch(/^(low|medium|high)$/)
    }
  })
})

