import { describe, expect, it } from 'vitest'
import {
  projectCliJourneyProblem, projectMcpJourneyProblem, projectStreamJourneyProblem,
  projectProcureNext, type CallEvent, type JourneyStatus, type TurnEvent,
} from '@/modules/actions/contract'
import type { ToolProcureResult } from '@/modules/capability-execution/procure'
import type { CallRef, QuoteRef } from '@/modules/capability-execution/call-contracts'
import type { PublicToolRef } from '@/modules/common/tool-ref'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'

const callRef = `operation-invocation:v1:${'a'.repeat(64)}` as CallRef
const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}` as QuoteRef
const principalRef = 'principal-1' as PrincipalRef
const toolRef = `operation:v1:${'b'.repeat(64)}` as PublicToolRef
const options = { origin: 'https://api.ae.test' }
const statusNext = { action: 'call.status', args: { callRef }, authority: 'same_principal' } as const
const problem = {
  type: 'about:blank', title: 'Permission denied', status: 403, detail: 'Approval required',
  instance: '/api/v1/calls', kind: 'PERMISSION_DENIED', code: 'approval_required',
  requestId: 'request-1', retryable: false,
  refs: { callRef, recoveryRef: '00000000-0000-4000-8000-000000000000', identityPreserved: true },
  untrusted: 'discard me',
  next: [
    { action: 'approve', args: { callRef, url: 'https://api.ae.test/approve' }, authority: 'human_owner' },
    { ...statusNext, authority: 'public' }, statusNext,
    { action: 'registry.tools.describe', args: { toolRef }, authority: 'public' },
    { action: 'connect', args: { via: 'cli', command: 'ae connect' }, authority: 'human_owner' },
  ],
} as const

describe('journey contract projections', () => {
  it('retains exact owner input and one primary next while dropping aliases and unknown fields', () => {
    expect(projectCliJourneyProblem(problem, { ...options, source: 'remote', exitCode: 3 })).toEqual({
      type: 'about:blank', title: 'Permission denied', status: 403, detail: 'Approval required',
      instance: '/api/v1/calls', kind: 'PERMISSION_DENIED', code: 'approval_required',
      requestId: 'request-1', source: 'remote', retryable: false, exitCode: 3,
      refs: problem.refs, next: [statusNext],
    })
  })
  it('admits the existing Plan read or cancel under its owner but keeps a single primary operation', () => {
    const read = { action: 'tool.plan.get', args: { planRef: 'plan:v1:one' }, authority: 'same_principal' }
    const cancel = { ...read, action: 'tool.plan.cancel' }
    const project = (next: unknown) => projectCliJourneyProblem({ ...problem, next }, { ...options, source: 'remote', exitCode: 1 }).next
    expect(project([read, cancel])).toEqual([read])
    expect(project([{ ...read, authority: 'public' }, { ...read, action: 'tool.plan.approve' }, cancel])).toEqual([cancel])
  })
  it('requires the same principal for Journey Tool status and retains public describe', () => {
    const status = { action: 'journey.status', args: { ref: { kind: 'tool', ref: toolRef } }, authority: 'same_principal' }
    const detail = { action: 'registry.tools.describe', args: { toolRef }, authority: 'public' }
    const project = (next: unknown) => projectCliJourneyProblem({ ...problem, next }, { ...options, source: 'remote', exitCode: 1 }).next
    expect(project([{ ...status, authority: 'public' }, status, detail])).toEqual([status])
    expect(project([detail])).toEqual([detail])
  })
  it('uses the same validated problem in MCP and stream data', () => {
    const mcp = projectMcpJourneyProblem(problem, options)
    expect(mcp).toMatchObject({ isError: true, structuredContent: { next: [statusNext] } })
    expect(mcp.content).toEqual([{ type: 'text', text: 'Permission denied' }])
    expect(projectStreamJourneyProblem(problem, options)).toEqual({ type: 'data-ae-problem', value: mcp.structuredContent })
  })
  it('preserves a safe owner handoff separately and rejects foreign or credential-bearing destinations', () => {
    const { requestId: _requestId, ...local } = problem
    const handoff = { actor: 'account_owner', reason: 'connect_required', destination: '/agent-access' }
    const project = (destination: string) => projectCliJourneyProblem({ ...local, ownerHandoff: { ...handoff, destination } }, { ...options, source: 'local', exitCode: 2 })
    expect(project('/agent-access')).toMatchObject({ source: 'local', ownerHandoff: handoff })
    expect(project('/agent-access')).not.toHaveProperty('requestId')
    for (const destination of ['https://evil.test/agent-access', '//evil.test/agent-access', 'https://api.ae.test@evil.test/agent-access']) {
      expect(project(destination)).not.toHaveProperty('ownerHandoff')
    }
    expect(() => projectCliJourneyProblem(local, { ...options, source: 'remote', exitCode: 2 })).toThrow()
  })
  it('preserves the dispatched Call identity without inventing a funding operation for a budget refusal', () => {
    const common = { schemaVersion: 'tool.procure:v1', quoteRef, callRef, idempotencyKey: 'purchase-1' } as const
    expect(projectProcureNext({ ...common, kind: 'pending', status: 'pending' })).toEqual([statusNext])
    expect(projectProcureNext({ ...common, kind: 'outcome_unknown', status: 'outcome_unknown' })).toEqual([statusNext])
    expect(projectProcureNext({ ...common, kind: 'refused_after_dispatch', status: 'refused_after_dispatch', code: 'call_refused', detail: 'No delivery' })).toEqual([statusNext])
    expect(projectProcureNext({ schemaVersion: 'tool.procure:v1', kind: 'refused', status: 'refused', code: 'budget_exceeded', retryable: false, detail: 'Too high', idempotencyKey: 'purchase-1' })).toEqual([])
    expect(projectProcureNext({ schemaVersion: 'tool.procure:v1', kind: 'refused', status: 'refused', code: 'invocation_runtime_unavailable', retryable: true, detail: 'Call status unavailable', idempotencyKey: 'purchase-1', quoteRef })).toEqual([
      { action: 'journey.status', args: { ref: { kind: 'quote', ref: quoteRef } }, authority: 'same_principal' },
    ])
    expect(() => projectProcureNext({ ...common, callRef: 'malformed', kind: 'pending', status: 'pending' })).toThrow('procure_result_call_ref_invalid')
  })
})

// These assignments are compile-time contracts; the function is never called.
function checkJourneyTypes() {
  // @ts-expect-error A Call event without its own payment state is not a Call event.
  const missingPayment: CallEvent = { kind: 'call', eventId: 'e1', correlationId: 'c1', sequence: 1, state: 'working', callRef }
  // @ts-expect-error A Turn cannot claim a payment state.
  const turnPayment: TurnEvent = { kind: 'turn', eventId: 'e1', correlationId: 'c1', sequence: 1, state: 'working', turnRef: 'turn-1' as TurnEvent['turnRef'], contextId: 'thread-1' as TurnEvent['contextId'], payment: 'paid' }
  // @ts-expect-error Tool readiness must not be represented as a task work state.
  const toolWork: JourneyStatus = { kind: 'tool', ref: toolRef, readiness: 'ready', workState: 'working', next: [] }
  void [missingPayment, turnPayment, toolWork]
  // @ts-expect-error Quote commitment is not an A2A work state.
  const quoteWork: JourneyStatus = { kind: 'quote', ref: quoteRef, principalRef, commitment: 'committed', workState: 'working', next: [] }
  // @ts-expect-error A post-dispatch result cannot lose its Call handle.
  const pendingWithoutCall: ToolProcureResult = { schemaVersion: 'tool.procure:v1', kind: 'pending', status: 'pending', quoteRef: 'quote-1', idempotencyKey: 'purchase-1' }
  // @ts-expect-error Pre-dispatch refusal cannot claim a Call.
  const preDispatchWithCall: ToolProcureResult = { schemaVersion: 'tool.procure:v1', kind: 'refused', status: 'refused', code: 'budget_exceeded', detail: 'Too high', idempotencyKey: 'purchase-1', callRef }
  void [quoteWork, pendingWithoutCall, preDispatchWithCall]
}
void checkJourneyTypes
