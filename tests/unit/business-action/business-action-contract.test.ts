import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  BusinessActionCardDefaults,
  BusinessActionExternalEvidenceProviderValues,
  BusinessActionGuardrailDecisionValues,
  BusinessActionGuardrailProviderValues,
  BusinessActionResultArtifactRequirementValues,
  BusinessActionSlug,
  BusinessActionSlugValues,
  ReceiptReconstructionStatusValues,
  isBusinessActionExternalEvidenceProvider,
  isBusinessActionSlug,
} from '@/modules/business-action/public'

const businessActionContractFiles = [
  'src/modules/business-action/public.ts',
  'src/modules/business-action/internal/schema.ts',
] as const

describe('business action domain contract', () => {
  it('locks Phase 6 to one action slug', () => {
    expect(BusinessActionSlug).toBe('provision-paid-intake-endpoint')
    expect(BusinessActionSlugValues).toEqual(['provision-paid-intake-endpoint'])

    expect(isBusinessActionSlug('provision-paid-intake-endpoint')).toBe(true)
    expect(isBusinessActionSlug('executeAction')).toBe(false)
    expect(isBusinessActionSlug('contact-follow-up')).toBe(false)
    expect(isBusinessActionSlug('generic-action')).toBe(false)
  })

  it('keeps public card posture proposal-only and non-callable', () => {
    expect(BusinessActionCardDefaults).toEqual({
      actionSlug: 'provision-paid-intake-endpoint',
      posture: 'proposal_only',
      callable: false,
      paymentRequired: false,
      ownerApprovalRequired: true,
      receiptRequired: true,
    })
  })

  it('keeps provider and evidence contracts closed', () => {
    expect(BusinessActionExternalEvidenceProviderValues).toEqual([
      'hermes',
      'stripe_test_mode',
      'link_cli_test_mode',
      'endpoint_host',
    ])
    expect(BusinessActionGuardrailProviderValues).toEqual(['nemo_guardrails', 'nemotron'])
    expect(BusinessActionGuardrailDecisionValues).toEqual(['allow', 'block', 'refusal'])
    expect(BusinessActionResultArtifactRequirementValues).toEqual([
      'endpoint_descriptor',
      'json_schema',
      'private_endpoint_provisioning_payment_gate_ref',
    ])
    expect(ReceiptReconstructionStatusValues).toEqual([
      'complete',
      'incomplete',
      'proof_gap',
      'tampered',
      'evidence_mismatch',
      'stale_source',
      'expired_mandate',
      'unbound_provider_event',
      'refused_no_consequence',
    ])

    expect(isBusinessActionExternalEvidenceProvider('hermes')).toBe(true)
    expect(isBusinessActionExternalEvidenceProvider('other')).toBe(false)
    expect(isBusinessActionExternalEvidenceProvider('stripe')).toBe(false)
  })

  it('does not expose broad action, provider, payment, or callable shapes in the domain files', () => {
    for (const file of businessActionContractFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source).not.toMatch(/\bexecuteAction\b/)
      expect(source).not.toMatch(/actionSlug\s*:\s*string/)
      expect(source).not.toMatch(/provider\s*:\s*['"]other['"]/)
      expect(source).not.toMatch(/paymentRequired\s*:\s*true/)
      expect(source).not.toMatch(/callable\s*:\s*true/)
    }
  })
})
