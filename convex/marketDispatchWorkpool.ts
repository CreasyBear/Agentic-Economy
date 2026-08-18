import { Workpool } from '@convex-dev/workpool'

import { components } from './_generated/api'

export const marketDispatchWorkpool = new Workpool(components.workpool, {
  // T38 reserves the 100 global Convex slots across all pools; market dispatch owns 32.
  maxParallelism: 32,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1_000, base: 2 },
})
