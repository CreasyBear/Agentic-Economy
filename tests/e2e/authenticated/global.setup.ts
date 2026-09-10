import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

import { requireAuthenticatedE2EEnvironment } from './environment'

setup.describe.configure({ mode: 'serial' })

setup('initialize Clerk testing token', async () => {
  requireAuthenticatedE2EEnvironment()
  await clerkSetup()
})
