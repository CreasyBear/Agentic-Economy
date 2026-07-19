import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('published operation host boundary', () => {
  it('keeps eligibility, authority, payment, retry, reconciliation and transport rules out of hosts', () => {
    const source = readFileSync(
      'src/modules/capability-supply/published-operation-hosts.ts',
      'utf8',
    )
    expect(source).not.toMatch(/internal\//)
    expect(source).not.toMatch(/route-transport-runtime|readiness-probe|transport-adapters/)
    expect(source).not.toMatch(/invokeRegisteredRouteTransport|createX402PaymentSignature/)
    expect(source).not.toMatch(/decide\(|execute\(|reconcile\(|retry\(/)
    expect(source).not.toMatch(/payTo|network|asset|amountMinor|credentialRef/)
  })
})
