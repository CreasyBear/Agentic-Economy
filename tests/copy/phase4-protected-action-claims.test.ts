import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { scanCopyClaims } from '@/lib/ui/contract-scans'

const phase4Files = [
  '.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md',
  '.planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md',
  'src/modules/protected-action/internal/contact-follow-up.ts',
  'src/routes/owner.actions.tsx',
  'src/routes/owner.actions.$proposalId.tsx',
  'src/routes/owner.actions.$proposalId.receipt.tsx',
  'src/routes/admin.protected-actions.tsx',
  'src/routes/admin.protected-actions.$proposalId.tsx',
] as const

describe('phase 4 protected-action copy contract', () => {
  it('allows selected contact follow-up claims only in Phase 4-owned contexts', () => {
    const violations = scanCopyClaims(
      phase4Files.map((root) => ({ root, includeExtensions: ['.md', '.ts', '.tsx'] }))
    )

    expect(violations).toEqual([])
  })

  it('keeps the action-selection record boring, non-money, and evidence-backed', () => {
    const selection = readFileSync('.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md', 'utf8')

    expect(selection).toContain('selectedActionSlug: contact-follow-up')
    expect(selection).toContain('source_owned_follow_up_outbox')
    expect(selection).toContain('Phase 2')
    expect(selection).toMatch(/No Phase 5 money rail/i)
    expect(selection).toMatch(/remain unavailable and out of scope/i)
    expect(selection).not.toMatch(/\b(?:checkout is live|wallet ready|payment required|marketplace payout|hosted agent is live|request market is live)\b/i)
  })

  it('keeps selected-action UI copy explicit about owner approval and unavailable future surfaces', () => {
    const uiSpec = readFileSync('.planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md', 'utf8')

    expect(uiSpec).toContain('Owner-approved customer contact follow-up request')
    expect(uiSpec).toContain('contact-follow-up')
    expect(uiSpec).toContain('source-owned follow-up outbox')
    expect(uiSpec).toMatch(/does not approve future actions/i)
    expect(uiSpec).toMatch(/does not .*payments?/i)
  })
})
