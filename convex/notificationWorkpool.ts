import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const notificationWorkpool = new Workpool(components.notificationWorkpool, {
  maxParallelism: 2,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 8,
    initialBackoffMs: 60_000,
    base: 2,
  },
})
