import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  BusinessActionSupportKillRuleValues,
  FunnelEventTypeValues,
  OperatorControlKeyValues,
  evaluateBusinessActionClaimSafety,
  readOperatorControls,
  setOperatorControl,
  validateBusinessActionNoRepairReconstruction,
} from '@/modules/observability/public'
import { observabilityTables } from '@/modules/observability/internal/schema'
import type {
  BusinessActionClaimSafetyInput,
  BusinessActionSupportKillRule,
  OperatorControlKey,
  OperatorControlSourceState,
  SetOperatorControlCommand,
} from '@/modules/observability/public'
import type { AdminMembership } from '@/modules/security/public'

describe('business action observability contracts', () => {
  it('registers Phase 6 audit targets in the shared observability schema', () => {
    expect(observabilityTables.auditEvents).toBeDefined()
    expect(AuditTargetTypeValues).toEqual(
      expect.arrayContaining([
        'business_action_card',
        'business_action_mandate',
        'business_action_request',
        'business_action_checkpoint',
        'business_action_guardrail_evidence',
        'business_action_external_evidence',
        'business_action_result_artifact',
        'business_action_receipt',
        'business_action_support',
        'business_action_private_evidence',
        'business_action_no_repair',
      ])
    )
  })

  it('registers Phase 6 audit events for receipt reconstruction', () => {
    expect(AuditEventTypeValues).toEqual(
      expect.arrayContaining([
        'business_action.card_versioned',
        'business_action.mandate_recorded',
        'business_action.request_proposed',
        'business_action.checkpoint_recorded',
        'business_action.guardrail_allowed',
        'business_action.guardrail_blocked',
        'business_action.evidence_ingested',
        'business_action.evidence_held',
        'business_action.result_artifact_recorded',
        'business_action.receipt_recorded',
        'business_action.proof_gap_recorded',
        'business_action.no_repair_marked',
      ])
    )
  })

  it('registers Phase 6 funnel events from GTM readiness', () => {
    expect(FunnelEventTypeValues).toEqual(
      expect.arrayContaining([
        'business_action_card_viewed',
        'business_action_request_started',
        'business_action_checkpoint_recorded',
        'business_action_guardrail_allowed',
        'business_action_guardrail_blocked',
        'business_action_evidence_ingested',
        'business_action_receipt_viewed',
        'business_action_proof_gap_recorded',
      ])
    )
  })

  it('adds source-owned operator controls for business actions', () => {
    const controls = [
      'business_actions_enabled',
      'business_action_attempts_enabled',
    ] as const satisfies readonly OperatorControlKey[]

    expect(OperatorControlKeyValues).toEqual(expect.arrayContaining([...controls]))

    for (const key of controls) {
      const state = operatorControlState()
      const result = setOperatorControl(
        state,
        operatorControlCommand({
          key,
          operationKey: brandNonEmpty(`op:${key}`, 'OperationKey'),
          correlationId: brandNonEmpty(`corr:${key}`, 'CorrelationId'),
        })
      )

      expect(result).toMatchObject({
        kind: 'ok',
        code: 'operator_control_changed',
        control: {
          key,
          enabled: false,
        },
        readback: {
          configuredEnabled: false,
          effectiveEnabled: false,
          source: 'source_owned',
        },
        auditEvent: {
          eventType: 'operator_control.changed',
          targetType: 'operator_control',
          targetRef: key,
        },
      })
      expect(readOperatorControls(state, 20).find((control) => control.key === key)).toMatchObject({
        configuredEnabled: false,
        effectiveEnabled: false,
        source: 'source_owned',
      })
    }
  })

  it('disables public and demo business-action claims for every support kill rule', () => {
    expect(BusinessActionSupportKillRuleValues).toEqual([
      'stale_card',
      'disabled_card',
      'revoked_mandate',
      'expired_mandate',
      'wrong_owner',
      'rejected_checkpoint',
      'guardrail_block',
      'guardrail_refusal',
      'unbound_evidence',
      'missing_artifact',
      'proof_gap',
      'no_repair',
      'support_capacity_breach',
    ])

    const cases: readonly {
      name: string
      rule: BusinessActionSupportKillRule
      input: Partial<BusinessActionClaimSafetyInput>
    }[] = [
      { name: 'stale card', rule: 'stale_card', input: { cardStatus: 'stale' } },
      { name: 'disabled card', rule: 'disabled_card', input: { cardStatus: 'disabled' } },
      { name: 'revoked mandate', rule: 'revoked_mandate', input: { mandateStatus: 'revoked' } },
      { name: 'expired mandate', rule: 'expired_mandate', input: { mandateExpiresAt: 10 } },
      { name: 'wrong owner', rule: 'wrong_owner', input: { ownerMatches: false } },
      { name: 'rejected checkpoint', rule: 'rejected_checkpoint', input: { checkpointDecision: 'refused' } },
      { name: 'guardrail block', rule: 'guardrail_block', input: { guardrailDecisions: ['block'] } },
      { name: 'guardrail refusal', rule: 'guardrail_refusal', input: { guardrailDecisions: ['refusal'] } },
      { name: 'unbound evidence', rule: 'unbound_evidence', input: { externalEvidenceBound: false } },
      { name: 'missing artifact', rule: 'missing_artifact', input: { resultArtifactStatus: undefined } },
      { name: 'proof gap', rule: 'proof_gap', input: { resultArtifactStatus: 'proof_gap' } },
      { name: 'no repair', rule: 'no_repair', input: { noRepairMarked: true } },
      {
        name: 'support capacity breach',
        rule: 'support_capacity_breach',
        input: { supportCapacity: { openIncidents: 3, capacityThreshold: 2 } },
      },
    ]

    for (const { name, rule, input } of cases) {
      const decision = evaluateBusinessActionClaimSafety(claimSafetyInput(input))

      expect(decision, name).toMatchObject({
        publicDemoClaimsEnabled: false,
        preserveHistoricalReadbacks: true,
        claimDisablePath: 'business_actions_enabled',
      })
      expect(decision.killRules, name).toContain(rule)
      expect(decision.operatorNextAction, name).toContain(rule)
    }
  })

  it('validates no-repair as terminal audited reconstruction without provider evidence rewrite', () => {
    expect(
      validateBusinessActionNoRepairReconstruction({
        noRepairMarked: true,
        auditEventType: 'business_action.no_repair_marked',
        auditTargetType: 'business_action_no_repair',
        requestHash: 'hash:request',
        receiptReconstructionStatus: 'proof_gap',
        noRepairHash: 'hash:no-repair',
        evidenceRefs: ['support:no-repair'],
        providerEvidenceBefore: ['hash:provider:evt_1'],
        providerEvidenceAfter: ['hash:provider:evt_1'],
      })
    ).toEqual({
      valid: true,
      terminal: true,
      auditable: true,
      reconstructable: true,
      providerEvidenceRewritten: false,
    })

    expect(
      validateBusinessActionNoRepairReconstruction({
        noRepairMarked: true,
        auditEventType: 'business_action.no_repair_marked',
        auditTargetType: 'business_action_no_repair',
        requestHash: 'hash:request',
        receiptReconstructionStatus: 'proof_gap',
        noRepairHash: 'hash:no-repair',
        evidenceRefs: ['support:no-repair'],
        providerEvidenceBefore: ['hash:provider:evt_1'],
        providerEvidenceAfter: ['hash:provider:evt_2'],
      })
    ).toEqual({ valid: false, reason: 'provider_evidence_rewritten' })
  })
})

function operatorControlState(): OperatorControlSourceState {
  return {
    operatorControls: [],
    auditEvents: [],
  }
}

function operatorControlCommand(overrides: Partial<SetOperatorControlCommand> = {}): SetOperatorControlCommand {
  return {
    adminMembership: activeMembership('owner_admin'),
    key: 'business_actions_enabled',
    enabled: false,
    reasonCode: 'business_action_support_kill_rule',
    evidenceRefs: ['private:evidence:business-action-support'],
    security: {
      csrf: {
        csrfToken: 'csrf-business-action',
        csrfCookie: 'csrf-business-action',
        allowedOrigins: ['https://ae.example'],
      },
    },
    operationKey: brandNonEmpty('op:business-action-control', 'OperationKey'),
    correlationId: brandNonEmpty('corr:business-action-control', 'CorrelationId'),
    now: 20,
    ...overrides,
  }
}

function activeMembership(role: AdminMembership['role']): AdminMembership {
  return {
    clerkUserId: `admin_${role}`,
    role,
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}

function claimSafetyInput(overrides: Partial<BusinessActionClaimSafetyInput> = {}): BusinessActionClaimSafetyInput {
  return {
    cardStatus: 'active',
    mandateStatus: 'active',
    mandateExpiresAt: 100,
    ownerMatches: true,
    checkpointDecision: 'accepted',
    guardrailDecisions: ['allow'],
    externalEvidenceBound: true,
    resultArtifactStatus: 'complete',
    noRepairMarked: false,
    supportCapacity: {
      openIncidents: 0,
      capacityThreshold: 2,
    },
    now: 20,
    ...overrides,
  }
}
