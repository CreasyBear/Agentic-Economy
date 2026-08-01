import { describe, expect, it } from 'vitest'

import { shouldRenderEngineDialog } from '@/routes/index'

describe('homepage engine dialog gate', () => {
  it('keeps exact searches on the options path and gates open asks by the flag', () => {
    expect(shouldRenderEngineDialog({
      query: 'dentist near Adelaide',
      engineDialogEnabled: true,
    })).toBe(false)
    expect(shouldRenderEngineDialog({
      query: 'I need my home office set up for video calls next month',
      engineDialogEnabled: true,
    })).toBe(true)
    expect(shouldRenderEngineDialog({
      query: 'I need my home office set up for video calls next month',
      engineDialogEnabled: false,
    })).toBe(false)
  })
})
