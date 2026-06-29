import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { readOperatorControls, setOperatorControl } from '@/modules/observability/public'
import type { OperatorControlKey, OperatorControlSourceState, SetOperatorControlCommand } from '@/modules/observability/public'
import type { AdminMembership } from '@/modules/security/public'

describe('operator controls', () => {
  it('requires owner admin authority, reason, evidence, and future expiry', () => {
    expect(setOperatorControl(emptyState(), validCommand({ adminMembership: activeMembership('support') }))).toMatchObject({
      kind: 'error',
      code: 'operator_control_admin_denied',
      reason: 'action_not_allowed',
    })

    expect(setOperatorControl(emptyState(), validCommand({ reasonCode: ' ' }))).toMatchObject({
      kind: 'error',
      code: 'operator_control_invalid_reason',
    })

    expect(setOperatorControl(emptyState(), validCommand({ evidenceRefs: [] }))).toMatchObject({
      kind: 'error',
      code: 'operator_control_missing_evidence',
    })

    expect(setOperatorControl(emptyState(), validCommand({ expiresAt: 10 }))).toMatchObject({
      kind: 'error',
      code: 'operator_control_invalid_expiry',
    })
  })

  it('changes a control with audit and replays the same operation key', () => {
    const state = emptyState()
    const changed = setOperatorControl(state, validCommand())
    const replay = setOperatorControl(state, validCommand({ now: 30 }))

    expect(changed).toMatchObject({
      kind: 'ok',
      code: 'operator_control_changed',
      control: {
        key: 'claims_enabled',
        enabled: false,
        changedByAdminRef: 'admin_owner_admin',
      },
      readback: {
        effectiveEnabled: false,
        expired: false,
      },
      auditEvent: {
        eventType: 'operator_control.changed',
        targetType: 'operator_control',
        beforeState: 'default:true',
        afterState: 'disabled:100',
      },
    })
    expect(replay).toMatchObject({ kind: 'ok', code: 'operator_control_replayed' })
    expect(state.operatorControls).toHaveLength(1)
    expect(state.auditEvents).toHaveLength(1)
  })

  it('returns default and expired readbacks without exposing evidence', () => {
    const state = emptyState()
    setOperatorControl(state, validCommand({ expiresAt: 20 }))

    expect(readOperatorControls(state, 10).find((control) => control.key === 'claims_enabled')).toMatchObject({
      configuredEnabled: false,
      effectiveEnabled: false,
      expired: false,
      source: 'source_owned',
    })
    expect(readOperatorControls(state, 30).find((control) => control.key === 'claims_enabled')).toMatchObject({
      configuredEnabled: false,
      effectiveEnabled: true,
      expired: true,
    })
    expect(readOperatorControls(state, 30).find((control) => control.key === 'publish_enabled')).toMatchObject({
      configuredEnabled: true,
      effectiveEnabled: true,
      source: 'default',
    })
    expect(JSON.stringify(readOperatorControls(state, 30))).not.toContain('private:evidence')
  })

  it('defaults P2-P5 kill controls to enabled and keeps paid activation source-owned when disabled', () => {
    const p2ToP5Controls = [
      'inquiries_enabled',
      'notification_dispatch_enabled',
      'developer_discovery_publish_enabled',
      'protected_actions_enabled',
      'paid_activation_enabled',
      'billing_reconciliation_enabled',
    ] as const satisfies readonly OperatorControlKey[]

    const defaultReadbacks = readOperatorControls(emptyState(), 10)

    for (const key of p2ToP5Controls) {
      expect(defaultReadbacks.find((control) => control.key === key)).toMatchObject({
        configuredEnabled: true,
        effectiveEnabled: true,
        source: 'default',
      })
    }

    const state = emptyState()
    const disabledPaidActivation = setOperatorControl(
      state,
      validCommand({
        key: 'paid_activation_enabled',
        operationKey: brandNonEmpty('op:operator:paid-activation', 'OperationKey'),
        correlationId: brandNonEmpty('corr:operator:paid-activation', 'CorrelationId'),
      })
    )

    expect(disabledPaidActivation).toMatchObject({
      kind: 'ok',
      control: {
        key: 'paid_activation_enabled',
        enabled: false,
      },
      readback: {
        configuredEnabled: false,
        effectiveEnabled: false,
        source: 'source_owned',
      },
      auditEvent: {
        eventType: 'operator_control.changed',
        beforeState: 'default:true',
        afterState: 'disabled:100',
      },
    })
  })
})

function emptyState(): OperatorControlSourceState {
  return {
    operatorControls: [],
    auditEvents: [],
  }
}

function validCommand(overrides: Partial<SetOperatorControlCommand> = {}): SetOperatorControlCommand {
  return {
    adminMembership: activeMembership('owner_admin'),
    key: 'claims_enabled',
    enabled: false,
    reasonCode: 'abuse_spike',
    evidenceRefs: ['private:evidence:operator-control'],
    expiresAt: 100,
    security: {
      csrf: {
        csrfToken: 'csrf-control',
        csrfCookie: 'csrf-control',
        allowedOrigins: ['https://ae.example'],
      },
    },
    operationKey: brandNonEmpty('op:operator:claims-enabled', 'OperationKey'),
    correlationId: brandNonEmpty('corr:operator:claims-enabled', 'CorrelationId'),
    now: 10,
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
