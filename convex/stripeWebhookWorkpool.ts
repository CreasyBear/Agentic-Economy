import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const stripeWebhookWorkpool = new Workpool(components.stripeWebhookWorkpool, {
  maxParallelism: 4,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 13,
    initialBackoffMs: 60_000,
    base: 2,
  },
})
