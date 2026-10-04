import { describe, expect, it } from 'vitest'
import type { AgentActivityView, AgentDetail, AgentDirectoryProjection } from './agent-operator-view-model'
import { firstToolInstruction, projectAgentFirstUse } from './first-use.view-model'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const call: AgentActivityView = {
  callRef: `operation-invocation:v1:${'b'.repeat(64)}`, credentialRef: 'crd_current', toolRef,
  toolLabel: 'Company lookup', providerRef: 'provider_lookup', state: 'completed',
  deliveryState: 'delivered', paymentState: 'settled', receiptRef: 'receipt_one', createdAt: 10, updatedAt: 11,
}
const detail: AgentDetail = {
  agent: { principalRef: 'prn_intended', principalRevision: 1, displayName: 'Research Agent', applicationRef: 'ae',
    environment: 'sandbox', status: 'connected', authorityMode: 'approval_required', spendingPolicy: { kind: 'unavailable' },
    connectionCount: 1, connectorDisplayNames: ['Codex'] },
  connections: [], currentCredentialRef: 'crd_current',
  credentials: [{ credentialRef: 'crd_current', generation: 1, lifecycle: 'active', issuedAt: 1, expiresAt: 999 }],
  authorityMode: 'approval_required', scopes: ['market_tools:call'], spendingPolicy: { kind: 'unavailable' }, activity: [], dataState: 'source',
}
const callWithoutReceipt = { ...call }
delete callWithoutReceipt.receiptRef

function directory(...details: AgentDetail[]): AgentDirectoryProjection {
  return { items: details.map(value => value.agent), details }
}
describe('evidence for first Tool use', () => {
  it('never substitutes a different connected Agent for a missing intended Agent', () => {
    expect(projectAgentFirstUse({ directory: directory(detail), caller: 'prn_missing' }).kind).toBe('connection_required')
  })
  it('requires a choice when identity is ambiguous or a page is incomplete', () => {
    const other = { ...detail, agent: { ...detail.agent, principalRef: 'prn_other' } }
    expect(projectAgentFirstUse({ directory: directory(detail, other) }).kind).toBe('choose_agent')
    expect(projectAgentFirstUse({ directory: { ...directory(detail), nextCursor: 'opaque' } }).kind).toBe('choose_agent')
  })
  it('separates approved access from current-credential authentication', () => {
    const withOldAuth = { ...detail, credentials: [...detail.credentials,
      { credentialRef: 'crd_old', generation: 0, lifecycle: 'stale' as const, issuedAt: 0, expiresAt: 1, lastAuthenticatedAt: 10 }] }
    expect(projectAgentFirstUse({ directory: directory(withOldAuth) }).kind).toBe('authorized')
    const currentAuth = { ...detail, credentials: [{ ...detail.credentials[0]!, lastAuthenticatedAt: 12 }] }
    expect(projectAgentFirstUse({ directory: directory(currentAuth) }).kind).toBe('authenticated')
  })
  it('requires an exact attempt, the selected Tool and a receipt', () => {
    const delivered = { ...detail, activity: [call] }
    expect(projectAgentFirstUse({ directory: directory(delivered), toolRef, callRef: call.callRef })).toMatchObject({ kind: 'delivered', call: { callRef: call.callRef, receiptRef: call.receiptRef } })
    expect(projectAgentFirstUse({ directory: directory(delivered), toolRef: `operation:v1:${'c'.repeat(64)}` }).kind).toBe('authorized')
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [{ ...call, credentialRef: 'crd_old' }] }) }).kind).toBe('authorized')
  })
  it.each([
    { ...call, state: 'outcome_unknown' as const },
    { ...call, deliveryState: 'unknown' as const },
    { ...call, paymentState: 'unknown' as const },
    callWithoutReceipt,
    { ...call, state: 'refused' as const, deliveryState: 'not_delivered' as const },
  ])('retains an existing Call for recovery instead of inviting a second purchase', (activity) => {
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [activity] }), callRef: activity.callRef })).toMatchObject({ kind: 'recover', call: { callRef: call.callRef } })
  })
  it('lets the latest uncertain attempt take precedence over a previous delivery', () => {
    const uncertain = { ...call, callRef: 'call_newer', state: 'outcome_unknown' as const, createdAt: 20 }
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [call, uncertain] }) })).toMatchObject({ kind: 'recover', call: { callRef: 'call_newer' } })
  })
  it.each(['partial', 'unavailable'] as const)('does not turn %s evidence into readiness', (dataState) => {
    expect(projectAgentFirstUse({ directory: directory({ ...detail, dataState, activity: [call] }) }).kind).toBe('unavailable')
  })
  it('withholds completion after failed refresh without dropping known records', () => {
    const known = directory({ ...detail, activity: [call] })
    expect(projectAgentFirstUse({ directory: known, unavailable: true }).kind).toBe('unavailable')
    expect(known.details[0]?.activity[0]?.callRef).toBe(call.callRef)
  })
  it('honours deliberately limited and Provider-only authority', () => {
    const readOnly = { ...detail, agent: { ...detail.agent, authorityMode: 'read_only' as const } }
    expect(projectAgentFirstUse({ directory: directory(readOnly) }).kind).toBe('browse_only')
    expect(firstToolInstruction(toolRef, 'read_only')).toContain('Make no purchase')
    expect(projectAgentFirstUse({ directory: directory({ ...detail, scopes: ['market_supply:manage'] }) }).kind).toBe('connection_required')
  })
  it('does not carry historical authentication into Browse only progress', () => {
    const readOnly = { ...detail, agent: { ...detail.agent, authorityMode: 'read_only' as const, lastAuthenticatedAt: 12 } }
    expect(projectAgentFirstUse({ directory: directory(readOnly) })).toMatchObject({ kind: 'browse_only', authenticated: false })
    const currentAuth = { ...readOnly, credentials: [{ ...readOnly.credentials[0]!, lastAuthenticatedAt: 13 }] }
    expect(projectAgentFirstUse({ directory: directory(currentAuth) })).toMatchObject({ kind: 'browse_only', authenticated: true })
  })
  it.each([
    ['awaiting_authority', 'awaiting_authority'], ['queued', 'running'], ['running', 'running'], ['recovery_required', 'recover'], ['finished', 'recording_result'],
  ] as const)('observes recorded %s without claiming delivery', (phase, kind) => {
    const liveCall = { callRef: 'call_live', credentialRef: 'crd_current', toolRef, phase, createdAt: 20, updatedAt: 21 }
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [call], liveCalls: [liveCall] }), callRef: liveCall.callRef }))
      .toMatchObject({ kind, call: { callRef: 'call_live' } })
  })
  it('follows the original Call across credentials while keeping current authentication separate', () => {
    const liveCall = { callRef: call.callRef, credentialRef: 'crd_current', toolRef, phase: 'finished' as const, createdAt: call.createdAt, updatedAt: 21 }
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [call], liveCalls: [liveCall] }), callRef: call.callRef }).kind).toBe('delivered')
    const other = { ...liveCall, phase: 'running' as const, credentialRef: 'crd_old' }
    expect(projectAgentFirstUse({ directory: directory({ ...detail, liveCalls: [other] }) })).toMatchObject({ kind: 'running', access: { kind: 'authorized', authenticated: false } })
    expect(projectAgentFirstUse({ directory: directory({ ...detail, liveCalls: [{ ...other, credentialRef: 'crd_current' }] }), toolRef: 'other_tool' }).kind).toBe('authorized')
  })
  it.each(['expired', 'disconnected'] as const)('keeps an exact delivered Call after access becomes %s', status => {
    const watched = { ...detail, agent: { ...detail.agent, status }, activity: [], watchedCall: {
      kind: 'observed' as const, live: { ...call, credentialRef: 'old_key', phase: 'finished' as const }, activity: { ...call, credentialRef: 'old_key' },
    } }
    expect(projectAgentFirstUse({ directory: directory(watched), callRef: call.callRef })).toMatchObject({ kind: 'delivered', access: { kind: 'connection_required' } })
  })
  it('keeps recovery across a Browse only downgrade and reporting outage', () => {
    const watched = { ...detail, agent: { ...detail.agent, authorityMode: 'read_only' as const }, dataState: 'partial' as const,
      watchedCall: { kind: 'observed' as const, live: { ...call, credentialRef: 'old_key', phase: 'recovery_required' as const } } }
    expect(projectAgentFirstUse({ directory: directory(watched), callRef: call.callRef })).toMatchObject({ kind: 'recover', access: { kind: 'browse_only' } })
  })
  it('does not complete a new attempt from historical success or substitute a missing exact Call', () => {
    const known = directory({ ...detail, activity: [call] })
    expect(projectAgentFirstUse({ directory: known }).kind).toBe('authorized')
    expect(projectAgentFirstUse({ directory: known, callRef: 'call_missing' }).kind).toBe('unavailable')
    expect(projectAgentFirstUse({ directory: directory({ ...detail, activity: [call], watchedCall: { kind: 'missing' } }), callRef: call.callRef }).kind).toBe('unavailable')
  })
  it('asks which concurrent Call belongs to the task', () => {
    const running = { ...call, phase: 'running' as const }
    expect(projectAgentFirstUse({ directory: directory({ ...detail, liveCalls: [running, { ...running, callRef: 'call_other' }] }) }).kind).toBe('choose_call')
    expect(projectAgentFirstUse({ directory: directory({ ...detail, liveCalls: [running, { ...running, callRef: 'call_other' }] }), callRef: call.callRef })).toMatchObject({ kind: 'running', call: { callRef: call.callRef } })
  })

})
