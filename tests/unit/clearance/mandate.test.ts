import { describe, expect, it } from 'vitest'

import {
  createClearanceMandate,
  evaluateClearanceMandate,
} from '@/modules/clearance/internal/mandate'

const NOW = 1_804_150_000

const activeMandateInput = {
  mandateId: 'mandate:principal-one:paid-intake',
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  allowedScopes: ['request:create', 'checkpoint:propose'],
  maxAmountCents: 10_000,
  status: 'active',
  createdAt: NOW - 60,
  expiresAt: NOW + 3_600,
} as const

describe('clearance mandate evaluation', () => {
  it('rejects identity-only authority before any action-specific clearance is granted', () => {
    expect(
      evaluateClearanceMandate({
        mandate: undefined,
        principalId: activeMandateInput.principalId,
        actionClass: activeMandateInput.actionClass,
        actionRef: activeMandateInput.actionRef,
        scope: 'request:create',
        amountCents: 5_000,
        now: NOW,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'clearance_mandate_required',
    })
  })

  it.each([
    {
      name: 'wrong principal',
      request: { principalId: 'principal:wba:other-agent' },
      expected: 'clearance_mandate_principal_mismatch',
    },
    {
      name: 'wrong action class',
      request: { actionClass: 'contact_follow_up' as const },
      expected: 'clearance_mandate_action_class_mismatch',
    },
    {
      name: 'wrong action ref',
      request: { actionRef: 'business-action:other' },
      expected: 'clearance_mandate_action_ref_mismatch',
    },
    {
      name: 'expired mandate',
      mandate: { expiresAt: NOW - 1 },
      expected: 'clearance_mandate_expired',
    },
    {
      name: 'revoked mandate',
      mandate: { status: 'revoked' as const, revokedAt: NOW - 10 },
      expected: 'clearance_mandate_revoked',
    },
    {
      name: 'disallowed scope',
      request: { scope: 'payment:capture' },
      expected: 'clearance_mandate_scope_not_allowed',
    },
    {
      name: 'amount cap excess',
      request: { amountCents: 10_001 },
      expected: 'clearance_mandate_amount_cap_exceeded',
    },
  ])('rejects $name with a specific refusal reason', ({ mandate, request, expected }) => {
    const clearanceMandate = createClearanceMandate({
      ...activeMandateInput,
      ...mandate,
    })

    expect(
      evaluateClearanceMandate({
        mandate: clearanceMandate,
        principalId: activeMandateInput.principalId,
        actionClass: activeMandateInput.actionClass,
        actionRef: activeMandateInput.actionRef,
        scope: 'request:create',
        amountCents: 5_000,
        now: NOW,
        ...request,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: expected,
      mandateId: activeMandateInput.mandateId,
    })
  })

  it('accepts a matching active mandate without treating identity as authority by itself', () => {
    const mandate = createClearanceMandate(activeMandateInput)

    expect(
      evaluateClearanceMandate({
        mandate,
        principalId: activeMandateInput.principalId,
        actionClass: activeMandateInput.actionClass,
        actionRef: activeMandateInput.actionRef,
        scope: 'checkpoint:propose',
        amountCents: 10_000,
        now: NOW,
      }),
    ).toEqual({
      kind: 'accepted',
      mandate,
    })
  })
})
