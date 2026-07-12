import { describe, expect, it } from 'vitest'

import {
  consumeDisclosureGrant,
  createDataAuthorizationBudget,
  resolveDisclosureAttempt,
} from '@/modules/routing-kernel/internal/data-authorization-budget'

const budgetInput = {
  dataAuthorizationBudgetRef: 'data-budget:1', sourceGrantId: 'grant:1', agentId: 'agent:1', principalId: 'principal:1',
  networkId: 'network:1', protectedFieldSetId: 'field-set:parcel:v1', permittedFields: ['parcel_dimensions', 'recipient_address'],
  permittedRecipientBindingIds: ['binding:primary:v1', 'binding:fallback:v1'], permittedPurposes: ['purchase_shipping_label'],
  maximumAttempts: 2, maximumExposures: 1, expiresAt: 2_000,
} as const

describe('Data Authorization Budget', () => {
  it('consumes exact single-use grants and prevents aggregate exposure oversubscription', () => {
    const budget = createDataAuthorizationBudget(budgetInput)
    const first = consumeDisclosureGrant(budget, {
      disclosureGrantId: 'disclosure:1', rootRunId: 'root:1', leafRunId: 'leaf:1', attempt: 1,
      recipientBindingId: 'binding:primary:v1', purpose: 'purchase_shipping_label',
      fields: ['recipient_address'], projectionDigest: 'sha256:projection-1', now: 1_000,
    })
    expect(first).toMatchObject({ kind: 'consumed', budget: { consumedAttempts: 1, consumedExposures: 1 }, attempt: { disposition: 'indeterminate' } })
    if (first.kind !== 'consumed') return
    expect(consumeDisclosureGrant(first.budget, {
      disclosureGrantId: 'disclosure:2', rootRunId: 'root:2', leafRunId: 'leaf:2', attempt: 1,
      recipientBindingId: 'binding:fallback:v1', purpose: 'purchase_shipping_label',
      fields: ['parcel_dimensions'], projectionDigest: 'sha256:projection-2', now: 1_001,
    })).toEqual({ kind: 'refused', reason: 'disclosure_exposure_capacity_exceeded' })
    expect(consumeDisclosureGrant(first.budget, {
      disclosureGrantId: 'disclosure:1', rootRunId: 'root:1', leafRunId: 'leaf:1', attempt: 1,
      recipientBindingId: 'binding:primary:v1', purpose: 'purchase_shipping_label',
      fields: ['recipient_address'], projectionDigest: 'sha256:projection-1', now: 1_001,
    })).toEqual(first)
  })

  it('spends attempts permanently but restores exposure only for proven not-released', () => {
    const consumed = consumeDisclosureGrant(createDataAuthorizationBudget(budgetInput), {
      disclosureGrantId: 'disclosure:1', rootRunId: 'root:1', leafRunId: 'leaf:1', attempt: 1,
      recipientBindingId: 'binding:primary:v1', purpose: 'purchase_shipping_label',
      fields: ['recipient_address'], projectionDigest: 'sha256:projection-1', now: 1_000,
    })
    if (consumed.kind !== 'consumed') throw new Error(consumed.reason)
    const notReleased = resolveDisclosureAttempt(consumed.budget, { disclosureGrantId: 'disclosure:1', disposition: 'not_released', now: 1_010 })
    expect(notReleased).toMatchObject({ kind: 'resolved', budget: { consumedAttempts: 1, consumedExposures: 0 } })
    if (notReleased.kind !== 'resolved') return
    const second = consumeDisclosureGrant(notReleased.budget, {
      disclosureGrantId: 'disclosure:2', rootRunId: 'root:2', leafRunId: 'leaf:2', attempt: 1,
      recipientBindingId: 'binding:fallback:v1', purpose: 'purchase_shipping_label',
      fields: ['parcel_dimensions'], projectionDigest: 'sha256:projection-2', now: 1_020,
    })
    expect(second).toMatchObject({ kind: 'consumed', budget: { consumedAttempts: 2, consumedExposures: 1 } })
    if (second.kind !== 'consumed') return
    expect(resolveDisclosureAttempt(second.budget, { disclosureGrantId: 'disclosure:2', disposition: 'released', now: 1_030 })).toMatchObject({ kind: 'resolved', budget: { consumedAttempts: 2, consumedExposures: 1 } })
  })

  it('refuses undeclared fields, recipients, purposes, expiry, and changed grant replay', () => {
    const budget = createDataAuthorizationBudget(budgetInput)
    const base = { disclosureGrantId: 'disclosure:1', rootRunId: 'root:1', leafRunId: 'leaf:1', attempt: 1, recipientBindingId: 'binding:primary:v1', purpose: 'purchase_shipping_label', fields: ['recipient_address'], projectionDigest: 'sha256:projection-1', now: 1_000 } as const
    expect(consumeDisclosureGrant(budget, { ...base, fields: ['payment_card'] })).toEqual({ kind: 'refused', reason: 'disclosure_field_not_permitted' })
    expect(consumeDisclosureGrant(budget, { ...base, recipientBindingId: 'binding:other' })).toEqual({ kind: 'refused', reason: 'disclosure_recipient_not_permitted' })
    expect(consumeDisclosureGrant(budget, { ...base, purpose: 'advertising' })).toEqual({ kind: 'refused', reason: 'disclosure_purpose_not_permitted' })
    expect(consumeDisclosureGrant(budget, { ...base, now: 2_000 })).toEqual({ kind: 'refused', reason: 'data_authorization_expired' })
    const consumed = consumeDisclosureGrant(budget, base)
    if (consumed.kind !== 'consumed') throw new Error(consumed.reason)
    expect(consumeDisclosureGrant(consumed.budget, { ...base, projectionDigest: 'sha256:changed' })).toEqual({ kind: 'refused', reason: 'disclosure_grant_conflict' })
  })
})
