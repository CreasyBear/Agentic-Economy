import { describe, expect, it } from 'vitest'

import { getStatusPresentation } from '@/lib/ui/status-presentation'

describe('getStatusPresentation', () => {
  it('keeps unavailable capabilities explicit and human-readable', () => {
    expect(getStatusPresentation('not_live')).toMatchObject({
      label: 'Not live',
      tone: 'neutral',
    })
  })
})

