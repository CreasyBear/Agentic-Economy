import { describe, expect, it } from 'vitest'

import { emptyOwnerOfferingEditorValue, publishGateRefusal } from '@/components/ae/offerings/AeOwnerOfferings'
import { claimFormHrefFor } from '@/components/ae/claim/AeFindMyBusiness'

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
  it('carries every prefill field in the link so nothing is retyped', () => {
    const href = claimFormHrefFor({
      slug: 'joondalup-emergency-plumbing',
      name: 'Joondalup Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Joondalup',
      stateTerritory: 'WA',
    })

    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/claim/form')
    expect(url.searchParams.get('businessName')).toBe('Joondalup Emergency Plumbing')
    expect(url.searchParams.get('category')).toBe('Emergency plumbing')
    expect(url.searchParams.get('suburb')).toBe('Joondalup')
    expect(url.searchParams.get('stateTerritory')).toBe('WA')
    expect(url.searchParams.get('requestedSlug')).toBe('joondalup-emergency-plumbing')
  })
})
