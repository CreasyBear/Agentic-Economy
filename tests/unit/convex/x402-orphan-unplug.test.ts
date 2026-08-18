import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('P6 x402 orphan unplug', () => {
  it('does not query customerRequestX402PaymentAttempts from Convex application code', () => {
    const migrations = readFileSync('convex/migrations.ts', 'utf8')
    expect(migrations).not.toContain('customerRequestX402PaymentAttempts')
    const routeExecution = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
    expect(routeExecution).not.toContain('customerRequestX402PaymentAttempts')
  })
})
