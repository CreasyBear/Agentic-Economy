import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpParameterKeyValues,
  ContactFollowUpPolicyKindValues,
} from '@/modules/protected-action/internal/selected-action-contract'
import {
  isContactFollowUpAttemptOutcome,
  isContactFollowUpDecision,
  isContactFollowUpParameterKey,
  isContactFollowUpPolicyKind,
  validateContactFollowUpSlug,
} from '@/modules/protected-action/internal/validators'

const selectedActionRouteFiles = [
  'src/routes/owner.actions.tsx',
  'src/routes/owner.actions.$proposalId.tsx',
  'src/routes/owner.actions.$proposalId.receipt.tsx',
  'src/routes/admin.protected-actions.tsx',
  'src/routes/admin.protected-actions.$proposalId.tsx',
] as const

describe('selected contact follow-up action contract', () => {
  it('exposes exactly one selected action slug and the four allowed parameters', () => {
    expect(ContactFollowUpActionSlug).toBe('contact-follow-up')
    expect(ContactFollowUpParameterKeyValues).toEqual([
      'contactName',
      'contactChannel',
      'messageSummary',
      'sourceMessageRef',
    ])
    expect(validateContactFollowUpSlug('contact-follow-up')).toEqual({ valid: true })
    expect(validateContactFollowUpSlug('generic-action')).toEqual({ valid: false, reason: 'selected_slug_only' })
  })

  it('keeps policy, decision, and attempt literals closed over contact follow-up states', () => {
    expect(ContactFollowUpPolicyKindValues).toEqual([
      'review_required',
      'refused',
      'expired',
      'proof_gap',
      'missing_proof',
      'external_authority',
      'time_bound',
    ])
    expect(ContactFollowUpDecisionValues).toEqual(['approved', 'rejected'])
    expect(ContactFollowUpAttemptOutcomeValues).toEqual(['receipt_recorded', 'proof_gap_recorded', 'failed'])

    expect(isContactFollowUpParameterKey('sourceMessageRef')).toBe(true)
    expect(isContactFollowUpParameterKey('amount')).toBe(false)
    expect(isContactFollowUpDecision('approved')).toBe(true)
    expect(isContactFollowUpDecision('auto_approved')).toBe(false)
    expect(isContactFollowUpPolicyKind('external_authority')).toBe(true)
    expect(isContactFollowUpPolicyKind('marketplace_allowed')).toBe(false)
    expect(isContactFollowUpAttemptOutcome('receipt_recorded')).toBe(true)
    expect(isContactFollowUpAttemptOutcome('provider_success')).toBe(false)
  })

  it('keeps route-facing seams selected-action-specific', () => {
    for (const file of selectedActionRouteFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source).toContain('ContactFollowUp')
      expect(source).not.toMatch(/\bproposeAction\b|\bevaluateActionPolicy\b|\bconsumeActionGatewayAdmission\b|\bretryActionAttempt\b|\bactionClass\b/)
    }
  })
})
