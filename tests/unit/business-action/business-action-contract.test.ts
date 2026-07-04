import { describe, expect, it } from 'vitest'

import {
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

describe('business action domain contract', () => {
  it('locks Issue 29 to the paid intake and publish-agent intake action slugs', () => {
    expect(BusinessActionSlug).toBe('provision-paid-intake-endpoint')
    expect(BusinessActionSlugValues).toEqual(['provision-paid-intake-endpoint', 'publish-agent-intake-endpoint'])

    expect(isBusinessActionSlug('provision-paid-intake-endpoint')).toBe(true)
    expect(isBusinessActionSlug('publish-agent-intake-endpoint')).toBe(true)
    expect(isBusinessActionSlug('executeAction')).toBe(false)
    expect(isBusinessActionSlug('contact-follow-up')).toBe(false)
    expect(isBusinessActionSlug('generic-action')).toBe(false)
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

})
