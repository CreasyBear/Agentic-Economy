import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { Route } from '@/routes/_operator/owner.index'

describe('/owner redirect', () => {
  it('opens Market without dropping search parameters', () => {
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('owner market redirect is unavailable')

    let thrown: unknown
    try {
      beforeLoad({ search: { x: '1' } } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/market', search: { x: '1' } })
  })
})
