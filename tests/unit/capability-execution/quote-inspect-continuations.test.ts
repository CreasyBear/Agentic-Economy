import { describe, expect, it } from 'vitest'

import { toolPlanQuoteAction } from '@/modules/capability-execution/plan/quote.actions'
import {
  toolQuoteAction,
} from '@/modules/capability-execution/quote.actions'
import {
  toolQuoteResultSchema,
  projectToolQuoteRefusal,
  type ToolQuoteRefusalCode,
} from '@/modules/capability-execution/quote'
import {
  COMMERCIAL_POLICY_REFUSAL_REASONS,
  type CommercialPolicyRefusalReason,
} from '@/modules/money/public'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const input = { city: 'Perth' }

describe('tool.quote continuations', () => {
  it.each([toolQuoteAction, toolPlanQuoteAction])('discloses unpaid Provider inspection in $id metadata', action => {
    expect(action.effect).toMatchObject({ class: 'disclosure', reversible: false, recipientKind: 'provider_system', spendExposure: 'none' })
    expect(action.invocationContract.consequenceClass).toBe('communication')
    expect(action.mcp?.openWorld).toBe(true)
    expect(action.boundaries.join(' ')).toContain('before the Quote exists')
  })

  it.each<readonly [ToolQuoteRefusalCode, string | undefined, string | undefined]>([
    ['tool_not_found', 'registry.tools.list', undefined],
    ['tool_not_current', 'registry.tools.list', undefined],
    ['tool_not_ready', 'tool.quote', undefined],
    ['tool_unsupported', 'registry.tools.list', undefined],
    ['input_invalid', 'registry.tools.describe', undefined],
    ['grant_not_found', undefined, 'account_owner'],
    ['budget_exceeded', undefined, 'account_owner'],
    ['treasury_capacity_unavailable', 'tool.quote', undefined],
    ['pricing_setup_required', 'registry.tools.list', undefined],
    ['commercial_policy_unavailable', undefined, 'ae_support'],
    ['inspection_unavailable', 'tool.quote', undefined],
  ])('projects %s to exactly one safe next step', (code, action, requiredActor) => {
    const result = projectToolQuoteRefusal({
      toolRef,
      input,
      code,
      retryable: code === 'tool_not_ready' || code === 'treasury_capacity_unavailable' || code === 'inspection_unavailable',
      correlationRef: 'request:test-inspection',
    })

    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
    expect(result.continuation?.action).toBe(action)
    expect(result.ownerHandoff?.actor).toBe(requiredActor)
    expect(Number(result.continuation !== undefined) + Number(result.ownerHandoff !== undefined)).toBe(1)
  })

  it('directs ambiguous earlier spending to support without an automatic retry loop', () => {
    const result = projectToolQuoteRefusal({ toolRef, input, code: 'inspection_unavailable', retryable: true,
      correlationRef: 'request:history', reason: 'spending_period_legacy_history_requires_support' })
    expect(result).toMatchObject({ retryable: false, ownerHandoff: { actor: 'ae_support', destination: '/support', reason: expect.stringContaining('earlier spending') } })
    expect(result.continuation).toBeUndefined()
    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
  })

  it.each(['daily_limit_exhausted', 'monthly_limit_exhausted'])('discloses UTC for %s without funding advice', reason => {
    const result = projectToolQuoteRefusal({ toolRef, input, code: 'budget_exceeded', retryable: false,
      correlationRef: 'request:period', reason })
    expect(result.ownerHandoff).toMatchObject({ destination: '/agent-access', reason: expect.stringContaining('UTC') })
    expect(result.continuation).toBeUndefined()
    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
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
        args: {
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
    ['legal_customer_required', 'funding.handoff.config', 'account_owner', 'legal customer'],
    ['commercial_policy_fixture_required', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_deployment_profile_invalid', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_missing', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_not_effective', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_expired', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_suspended', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_superseded', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_environment_mismatch', 'tool.quote', 'ae_support', 'AE could not establish'],
    ['commercial_policy_conflict', 'tool.quote', 'ae_support', 'AE could not establish'],
  ])('gives %s a safe recheck and the responsible customer action', (reason, action, actor, marker) => {
    const result = refuse(reason)

    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({
      reason,
      continuation: { action },
      ownerHandoff: { actor },
    })
    expect(result.ownerHandoff?.reason).toContain(marker)
    expect(JSON.stringify(result.ownerHandoff)).not.toMatch(/PACKAGE4|local_ci|synthetic_vps_fixture|moneyCommercialPolicy|activate_commercial_policy|set_sandbox_deployment_profile/u)
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
    expect(result.ownerHandoff?.actor).toBe('ae_support')
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
        args: {},
      },
      ownerHandoff: {
        actor: 'account_owner',
        destination: '/agent-access',
        reason: 'The owner must confirm this Account\u2019s legal customer on the AE Account page before this Agent can call Tools.',
      },
    })
  })
})
