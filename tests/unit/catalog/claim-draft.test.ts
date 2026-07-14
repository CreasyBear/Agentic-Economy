import { describe, expect, it } from 'vitest'

import {
  emptyPublicOwnerClaimInput,
  initialClaimDraftState,
  reduceClaimDraft,
  snapshotClaimDraft,
} from '@/modules/catalog/claim-draft'

describe('Claim draft state', () => {
  it('hydrates atomically while preserving fields edited before storage is ready', () => {
    const edited = reduceClaimDraft(initialClaimDraftState, {
      type: 'edit_text', field: 'businessName', value: 'Owner edit',
    })

    const hydrated = reduceClaimDraft(edited, {
      type: 'hydrate',
      snapshot: {
        value: { ...emptyPublicOwnerClaimInput, businessName: 'Stored name', suburb: 'Perth' },
        factsConfirmed: true,
        dirtyFields: ['suburb'],
      },
    })

    expect(hydrated).toMatchObject({
      phase: 'ready',
      value: { businessName: 'Owner edit', suburb: 'Perth' },
      factsConfirmed: true,
    })
    expect([...hydrated.dirtyFields].sort()).toEqual(['businessName', 'suburb'])
  })

  it('imports supplied facts without overwriting owner edits and requires reconfirmation', () => {
    const current = reduceClaimDraft(
      reduceClaimDraft(initialClaimDraftState, { type: 'edit_text', field: 'serviceName', value: 'Owner service' }),
      { type: 'set_facts_confirmed', value: true },
    )

    const imported = reduceClaimDraft(current, {
      type: 'import',
      value: { ...emptyPublicOwnerClaimInput, businessName: 'Imported business', serviceName: 'Imported service' },
    })

    expect(imported.value.businessName).toBe('Imported business')
    expect(imported.value.serviceName).toBe('Owner service')
    expect(imported.factsConfirmed).toBe(false)
  })

  it('does not expose a persistence snapshot before hydration completes', () => {
    expect(snapshotClaimDraft(initialClaimDraftState)).toBeUndefined()

    const ready = reduceClaimDraft(initialClaimDraftState, { type: 'hydrate' })
    expect(snapshotClaimDraft(ready)).toEqual({
      value: emptyPublicOwnerClaimInput,
      factsConfirmed: false,
      dirtyFields: [],
    })
  })
})
