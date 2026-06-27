import { describe, expect, it } from 'vitest'

import { aeCopy } from '@/lib/ui/copy'

describe('claims register seed copy', () => {
  it('keeps the foundation shell explicitly non-mutating', () => {
    expect(aeCopy.shellDescription).toContain('non-mutating shell')
    expect(aeCopy.notLiveNotice).toContain('not live')
  })
})

