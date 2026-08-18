import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('P6 x402 orphan unplug', () => {
  it('does not query customerRequestX402PaymentAttempts from Convex application code', () => {
    const convexRoot = 'convex'
    const sources = readdirSync(convexRoot)
      .filter((entry) => entry.endsWith('.ts') && !entry.startsWith('_'))
      .map((entry) => readFileSync(join(convexRoot, entry), 'utf8'))
      .join('\n')
    expect(sources).not.toContain('customerRequestX402PaymentAttempts')
  })
})
