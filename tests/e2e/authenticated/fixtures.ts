import { expect, test as base } from '@playwright/test'

import { applyVercelProtectionBypassToPage } from '../../deploy-smoke/vercel-bypass'
import { requireAuthenticatedE2EEnvironment } from './environment'

export const test = base.extend({
  page: async ({ page }, runTest) => {
    const environment = requireAuthenticatedE2EEnvironment()
    await applyVercelProtectionBypassToPage(page, new URL(environment.baseURL))
    if (environment.expectedSourceRevision !== undefined) {
      const release = await page.request.get('/api/v1/release')
      expect(release.ok()).toBe(true)
      await expect(release.json()).resolves.toEqual({
        kind: 'ok', sourceRevision: environment.expectedSourceRevision,
      })
    }
    await runTest(page)
  },
})
