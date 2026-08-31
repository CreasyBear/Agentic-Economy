import { describe, expect, it } from 'vitest'
import { isRedirect } from '@tanstack/react-router'

import { Route } from '@/routes/_operator/owner.settings.members'

describe('retired owner members route', () => {
  it('redirects the old URL to the durable agent directory', () => {
    try {
      Route.options.beforeLoad?.({} as never)
      throw new Error('expected redirect')
    } catch (error) {
      expect(isRedirect(error)).toBe(true)
      expect(error).toMatchObject({ options: { to: '/agent-access', replace: true } })
    }
  })
})
