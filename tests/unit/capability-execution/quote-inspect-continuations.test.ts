import { describe, expect, it } from 'vitest'

import {
  toolQuoteAction,
} from '@/modules/capability-execution/quote.actions'
import {
  COMMERCIAL_POLICY_ADMIN_SURFACE,
  toolQuoteResultSchema,
  projectToolQuoteRefusal,
  type ToolQuoteRefusalCode,
} from '@/modules/capability-execution/quote'
import {
  COMMERCIAL_POLICY_REFUSAL_REASONS,
  type CommercialPolicyRefusalReason,
} from '@/modules/money/public'
import { FUNDING_HANDOFF_CONFIG_PATH } from '@/modules/money/funding-handoff.actions'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const input = { city: 'Perth' }

describe('tool.quote continuations', () => {
  it.each<readonly [ToolQuoteRefusalCode, string | undefined, string | undefined]>([
    ['tool_not_found', 'registry.tools.list', undefined],
    ['tool_not_current', 'registry.tools.list', undefined],
    ['tool_not_ready', 'tool.quote', undefined],
    ['tool_unsupported', 'registry.tools.list', undefined],
    ['input_invalid', 'registry.tools.describe', undefined],
    ['grant_not_found', undefined, 'Review agent access'],
    ['budget_exceeded', undefined, 'Review agent access'],
    ['treasury_capacity_unavailable', 'tool.quote', undefined],
    ['pricing_setup_required', 'registry.tools.list', undefined],
    ['commercial_policy_unavailable', undefined, 'Contact support'],
    ['inspection_unavailable', 'tool.quote', undefined],
  ])('projects %s to exactly one safe next step', (code, action, requiredTitle) => {
    const result = projectToolQuoteRefusal({
      toolRef,
      input,
      code,
      retryable: code === 'tool_not_ready' || code === 'treasury_capacity_unavailable' || code === 'inspection_unavailable',
      correlationRef: 'request:test-inspection',
    })

    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
    expect(result.continuation?.action).toBe(action)
    expect(result.requiredActions?.[0]?.title).toBe(requiredTitle)
    expect(Number(result.continuation !== undefined) + Number(result.requiredActions !== undefined)).toBe(1)
  })

  it('rejects legacy operation refusal labels at the Tool Quote boundary', () => {
    const result = toolQuoteResultSchema.safeParse({
      kind: 'refused',
      toolRef,
      code: 'operation_not_found',
      retryable: false,
      correlationRef: 'request:legacy-refusal',
    })

    expect(result.success).toBe(false)
  })

  it('reports the current Tool Quote service error when the adapter is absent', async () => {
    await expect(toolQuoteAction.run({
      data: { toolRef, input },
      context: {
        agentAccessPrincipal: {} as never,
        callService: {} as never,
      },
    })).rejects.toThrow('tool_quote_unavailable')
  })

  it('returns a valid deterministic funding continuation for an exact shortfall', () => {
    const result = projectToolQuoteRefusal({
      toolRef,
      input,
      code: 'insufficient_balance',
      retryable: false,
      correlationRef: 'request:test-funding',
      funding: {
        principalAmount: { currency: 'AUD', units: '5000000', exponent: 6 },
        idempotencyKey: 'funding:deterministic-test',
      },
    })

    expect(result).toMatchObject({
      continuation: {
        action: 'funding.handoff.create',
        input: {
          principalAmount: { currency: 'AUD', units: '5000000', exponent: 6 },
          idempotencyKey: 'funding:deterministic-test',
        },
      },
    })
    expect(result).not.toHaveProperty('reinspection')
  })
})

describe('tool.quote commercial policy refusal reasons', () => {
  const refuse = (reason: CommercialPolicyRefusalReason) => projectToolQuoteRefusal({
    toolRef,
    input,
    code: 'commercial_policy_unavailable',
    retryable: true,
    correlationRef: 'request:test-commercial-policy',
    reason,
  })

  it.each<readonly [CommercialPolicyRefusalReason, string, string, string]>([
    ['legal_customer_required', 'funding.handoff.config', 'review_account_legal_customer', 'legal customer'],
    ['commercial_policy_fixture_required', 'tool.quote', 'set_sandbox_deployment_profile', 'AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE'],
    ['commercial_policy_deployment_profile_invalid', 'tool.quote', 'set_sandbox_deployment_profile', 'AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE'],
    ['commercial_policy_missing', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_not_effective', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_expired', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_suspended', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_superseded', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_environment_mismatch', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
    ['commercial_policy_conflict', 'tool.quote', 'activate_commercial_policy', COMMERCIAL_POLICY_ADMIN_SURFACE],
  ])('gives %s a machine continuation and a named operator action', (reason, action, operatorAction, marker) => {
    const result = refuse(reason)

    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({
      reason,
      continuation: { action },
      requiredActions: [{ action: operatorAction }],
    })
    expect(result.requiredActions?.[0]?.description).toContain(marker)
  })

  it('covers every enumerated reason', () => {
    for (const reason of COMMERCIAL_POLICY_REFUSAL_REASONS) {
      expect(refuse(reason).continuation).toBeDefined()
    }
  })

  it('keeps the reason-free refusal on the current contact-support behaviour', () => {
    const result = projectToolQuoteRefusal({
      toolRef,
      input,
      code: 'commercial_policy_unavailable',
      retryable: false,
      correlationRef: 'request:test-commercial-policy-unknown',
      reason: 'not_an_enumerated_reason',
    })

    expect(result.continuation).toBeUndefined()
    expect(result.requiredActions?.[0]?.title).toBe('Contact support')
  })

  it('projects the public refusal shape for legal_customer_required', () => {
    expect(refuse('legal_customer_required')).toEqual({
      kind: 'refused',
      toolRef,
      code: 'commercial_policy_unavailable',
      reason: 'legal_customer_required',
      retryable: true,
      correlationRef: 'request:test-commercial-policy',
      continuation: {
        action: 'funding.handoff.config',
        method: 'GET',
        path: FUNDING_HANDOFF_CONFIG_PATH,
        input: {},
      },
      requiredActions: [{
        action: 'review_account_legal_customer',
        blockedCapabilities: ['tool.call'],
        cta: '/agent-access',
        ctaLabel: 'Review agent access',
        description: 'The owner must confirm this Account\u2019s legal customer on the AE Account page before this Agent can call Tools.',
        iconUrl: null,
        status: 'required',
        title: 'Review account ownership',
      }],
    })
  })
})
