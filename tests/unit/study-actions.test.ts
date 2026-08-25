import { describe, expect, it } from 'vitest'

import { findAction, listActions } from '@/modules/actions'

describe('Study registered action seams', () => {
  it('leaves deleted study action ids undefined', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).not.toContain('study.start')
    expect(ids).not.toContain('study.inspect')
    expect(ids).not.toContain('study.complete')
    expect(findAction('study.start')).toBeUndefined()
    expect(findAction('study.inspect')).toBeUndefined()
    expect(findAction('study.complete')).toBeUndefined()
  })
})
