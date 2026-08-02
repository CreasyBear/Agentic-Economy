import { describe, expect, it } from 'vitest'

import { emptyOwnerOfferingEditorValue, publishGateRefusal } from '@/components/ae/offerings/AeOwnerOfferings'
import { claimFormSearchFor } from '@/components/ae/claim/AeFindMyBusiness'

describe('offering requiredness is a publish gate, not a save gate', () => {
  it('lets a draft park with nothing filled in', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'draft' })).toBeUndefined()
  })

  it('lets paused and retired states save without the publish facts', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'paused' })).toBeUndefined()
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'retired' })).toBeUndefined()
  })

  it('names the first missing field when publishing', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published' }))
      .toMatchObject({ field: 'name' })

    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published', name: 'Burst pipe repair' }))
      .toMatchObject({ field: 'category' })

    expect(
      publishGateRefusal({
        ...emptyOwnerOfferingEditorValue,
        status: 'published',
        name: 'Burst pipe repair',
        category: 'Plumbing',
      }),
    ).toMatchObject({ field: 'summary' })
  })

  it('passes the gate once the customer-readable facts exist', () => {
    expect(
      publishGateRefusal({
        ...emptyOwnerOfferingEditorValue,
        status: 'published',
        name: 'Burst pipe repair',
        category: 'Plumbing',
        summary: 'Same day burst pipe repairs.',
      }),
    ).toBeUndefined()
  })

  it('treats whitespace as missing', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published', name: '   ' }))
      .toMatchObject({ field: 'name' })
  })
})

describe('find-my-business hands facts to the claim form', () => {
  it('carries every prefill field in the link search so nothing is retyped', () => {
    expect(
      claimFormSearchFor({
        slug: 'joondalup-emergency-plumbing',
        name: 'Joondalup Emergency Plumbing',
        category: 'Emergency plumbing',
        suburb: 'Joondalup',
        stateTerritory: 'WA',
      }),
    ).toEqual({
      businessName: 'Joondalup Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Joondalup',
      stateTerritory: 'WA',
      requestedSlug: 'joondalup-emergency-plumbing',
    })
  })
})
