import { describe, expect, it } from 'vitest'

import { Route } from '@/routes/for-providers'

describe('provider supply route', () => {
  it('declares the business supply landing route', () => {
    expect(Route).toBeDefined()
  })
})
