import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { aeStatusPresentation, aeStatusValues } from '@/lib/ui/status-presentation'

describe('protected-action UI contract', () => {
  it('keeps gateway and receipt statuses selected-action-specific', () => {
    expect(aeStatusValues).toEqual(
      expect.arrayContaining(['protected_action_gateway_admitted', 'protected_action_receipt_recorded'])
    )
    expect(aeStatusPresentation.protected_action_gateway_admitted.description).toContain('contact follow-up')
    expect(aeStatusPresentation.protected_action_receipt_recorded.description).toMatch(/source-owned/i)
  })

  it('registers active owner/admin protected-action routes in the generated route tree', () => {
    const routeTree = readFileSync('src/routeTree.gen.ts', 'utf8')

    expect(routeTree).toContain("'/owner/actions'")
    expect(routeTree).toContain("'/owner/actions/$proposalId'")
    expect(routeTree).toContain("'/owner/actions/$proposalId/receipt'")
    expect(routeTree).toContain("'/admin/protected-actions'")
    expect(routeTree).toContain("'/admin/protected-actions/$proposalId'")
  })
})
