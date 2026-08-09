import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createEmptyNotificationOutboxSourceState,
  type NotificationOutboxSourceState,
} from '@/modules/notification-outbox/public'
import {
  allowWorkTreeRepeatPermission,
  assessWorkTreeDecisionPolicy,
  composeWorkTreeRepeatPermission,
  enqueueRenderedWorkTreeMemoNotification,
  renderWeeklyMemo,
  projectWeeklyMemo,
  type WorkTreeMemoNotificationInput,
  type WorkTreeMemoProjectionInput,
  type WorkTreeRepeatPermissionBinding,
  type WorkTreeRepeatUseInput,
  type WorkTreeRepeatUseResult,
  type WorkNode,
  validateWorkTreeRepeatUse,
} from '@/modules/work-tree/public'
import type { StandingRoutePorts } from '@/modules/customer-request/application/public'
import type { WorkTreeDecisionReceipt } from '@/modules/work-tree/work-tree.functions'

const projectId = 'project:t49-memo'
const readbackUrl = `/api/v1/work-tree/inspect?projectId=${encodeURIComponent(projectId)}`

function input(): WorkTreeMemoProjectionInput {
  return {
    projectId,
    revision: 4,
    tree: {
      format: 'ae.work-tree:v1',
      treeId: 'tree:t49-memo',
      projectId,
      generation: 1,
      revision: 4,
      charterText: 'Keep one durable decision source.',
      nodes: [{
        format: 'ae.work-node:v1',
        nodeId: 'decision:t49',
        kind: 'decision',
        title: 'Choose the next bounded step',
        status: 'ready',
        dependsOn: [],
        priority: 2,
        timing: { certainty: 'window', leadTimeDays: 3 },
        cost: {
          committed: { currency: 'AUD', units: '1200', exponent: 2 },
          envelope: { currency: 'AUD', units: '2500', exponent: 2 },
        },
        effort: { humanMinutes: 45 },
        scope: { acceptance: 'criteria', criteria: [{ criterionId: 'c1', label: 'Bounded', accepted: true }] },
        evidenceRefs: [],
        createdAt: 1,
        updatedAt: 4,
      }],
    },
    events: [
      { kind: 'created', operationKey: 'create:t49', seq: 1, generation: 1, revision: 1, at: 1 },
      { kind: 'decision_proposed', operationKey: 'proposal:t49', seq: 2, generation: 1, revision: 3, at: 3 },
    ],
    receipts: [
      acceptedReceipt(),
      refusedReceipt(),
    ],
    readbackUrl,
    nowMs: Date.UTC(2026, 7, 2),
  }
}

function acceptedReceipt(): WorkTreeDecisionReceipt {
  return {
    kind: 'accepted',
    decision: 'adjust',
    projectId,
    nodeId: 'decision:t49',
    receiptId: 'receipt:adjust',
    generation: 1,
    revision: 4,
    disposition: 'adjusted',
    occurredAt: 4,
    readback: { projectId, revision: 4 },
  }
}

function refusedReceipt(): WorkTreeDecisionReceipt {
  return {
    kind: 'refused',
    decision: 'lock',
    projectId,
    nodeId: 'decision:t49',
    receiptId: 'receipt:refused',
    generation: 1,
    revision: 4,
    disposition: 'unchanged',
    refusalCode: 'step_up_required',
    occurredAt: 4,
    readback: { projectId, revision: 4 },
  }
}

function repeatBinding(status: 'active' | 'withdrawn' = 'active'): WorkTreeRepeatPermissionBinding {
  return {
    projectId,
    nodeId: 'decision:t49',
    generation: 1,
    revision: 4,
    workTreeRevision: 8,
    proposalDigest: 'proposal:t49',
    permission: {
      kind: 'repeat_permission',
      status,
      permissionRef: 'repeat-permission:t49',
      requestRef: 'request:t49',
      revision: 4,
      routeRef: 'route:t49',
      delegatedCredentialId: 'credential:t49',
      limits: {
        perUseSpend: { currency: 'AUD', units: '500', exponent: 2 },
        cumulativeSpend: { currency: 'AUD', units: '1000', exponent: 2 },
        perUseDataAllocations: 1,
        cumulativeDataAllocations: 2,
        occurrences: 2,
      },
      fallback: 'ask_for_confirmation',
      validFrom: 100,
      validUntil: 200,
    },
  }
}

describe('T49 WorkTree memo projection', () => {
  it('projects events, receipts, refusals and readback without mutating source input', () => {
    const source = input()
    const first = projectWeeklyMemo(source)
    const second = projectWeeklyMemo(source)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      readbackUrl,
      cost: {
        committed: { currency: 'AUD', units: '1200', exponent: 2 },
        envelope: { currency: 'AUD', units: '2500', exponent: 2 },
      },
      timingCriticalPathSummary: 'Choose the next bounded step · 3 days',
      effortMinutes: 45,
      scopeCoverage: { accepted: 1, total: 1 },
      changes: [
        { title: 'WorkTree created' },
        { title: 'Decision proposed' },
      ],
      receipts: [
        { status: 'accepted' },
        { status: 'refused' },
      ],
      exceptions: [{ title: 'lock refused', severity: 'warning' }],
    })
    expect(source.tree.revision).toBe(4)
    expect(JSON.stringify(first)).not.toContain(canonicalDigest('private model reasoning'))
  })

  it('renders a public readback link and source-derived status without private reasoning', async () => {
    const html = await renderWeeklyMemo(projectWeeklyMemo(input()))

    expect(html).toContain(readbackUrl)
    expect(html).toContain('Choose the next bounded step')
    expect(html).toContain('lock refused')
    expect(html).toContain('step_up_required')
    expect(html).not.toContain('private model reasoning')
    expect(html).not.toContain('apiKey')
  })
  it('retries memo delivery as one logical notification with the same authenticated readback link', async () => {
    const memo = projectWeeklyMemo(input())
    const notificationInput: WorkTreeMemoNotificationInput = {
      businessId: brandNonEmpty('business:t49', 'BusinessId'),
      projectId,
      revision: 4,
      recipientRole: 'owner',
      providerFamily: 'resend',
      correlationId: brandNonEmpty('correlation:t49-memo', 'CorrelationId'),
      readbackUrl,
      memo,
      now: 1_754_000_000_000,
    }
    const initialState: NotificationOutboxSourceState = createEmptyNotificationOutboxSourceState()

    const first = await enqueueRenderedWorkTreeMemoNotification(initialState, notificationInput)
    expect(first).toMatchObject({ kind: 'ok', code: 'notification_queued' })
    if (first.kind !== 'ok') throw new Error(first.code)
    expect(first.state.dispatches).toHaveLength(1)
    expect(first.dispatch.redactedPayload).toMatchObject({
      template: 'work-tree-weekly-memo',
      projectId,
      revision: 4,
      readbackUrl,
    })
    expect(JSON.stringify(first.dispatch.redactedPayload)).not.toContain('apiKey')
    expect(JSON.stringify(first.dispatch.redactedPayload)).not.toContain('private model reasoning')

    const retry = await enqueueRenderedWorkTreeMemoNotification(first.state, notificationInput)
    expect(retry).toMatchObject({ kind: 'ok', code: 'notification_enqueue_replayed' })
    if (retry.kind !== 'ok') throw new Error(retry.code)
    expect(retry.state.dispatches).toHaveLength(1)
    expect(retry.dispatch.dispatchId).toBe(first.dispatch.dispatchId)
    expect(retry.dispatch.providerIdempotencyKey).toBe(first.dispatch.providerIdempotencyKey)
    expect(retry.dispatch.redactedPayload).toMatchObject({ readbackUrl })
  })

  it('accepts one bounded repeat authorization and refuses expiry, revocation, widening, and stale fences', () => {
    const node = input().tree.nodes[0]
    if (node === undefined) throw new Error('memo_fixture_node_missing')
    const policy = assessWorkTreeDecisionPolicy({ ...node, cost: undefined }, 'lock')
    expect(policy).toMatchObject({ eligibleForRepeatPermission: true, requiresStepUp: false })

    const composed = composeWorkTreeRepeatPermission({
      projectId,
      nodeId: 'decision:t49',
      generation: 1,
      revision: 4,
      workTreeRevision: 8,
      proposalDigest: 'proposal:t49',
      policy,
    }, repeatBinding().permission)
    expect(composed).toMatchObject({
      kind: 'work_tree_repeat_permission',
      status: 'active',
      projectId,
      nodeId: 'decision:t49',
      revision: 4,
      workTreeRevision: 8,
      proposalDigest: 'proposal:t49',
    })

    const accepted = validateWorkTreeRepeatUse(repeatUse())
    expect(accepted).toMatchObject({
      kind: 'work_tree_repeat_authorization',
      status: 'accepted',
      workTreeRevision: 8,
      readback: { projectId, revision: 8 },
    })
    expect(validateWorkTreeRepeatUse(repeatUse({ now: 200 }))).toEqual({
      kind: 'refused',
      reason: 'permission_expired',
    })
    expect(refusalReason(validateWorkTreeRepeatUse(repeatUse({ binding: repeatBinding('withdrawn') })))).toBe('permission_revoked')
    expect(refusalReason(validateWorkTreeRepeatUse(repeatUse({
      requestedSpend: { currency: 'AUD', units: '501', exponent: 2 },
    })))).toBe('scope_widened')
    expect(refusalReason(validateWorkTreeRepeatUse(repeatUse({ proposalDigest: 'proposal:changed' })))).toBe('proposal_changed')
    expect(refusalReason(validateWorkTreeRepeatUse(repeatUse({ workTreeRevision: 9 })))).toBe('revision_changed')
    expect(refusalReason(validateWorkTreeRepeatUse(repeatUse({ requestedOccurrences: 2 })))).toBe('limit_exceeded')
  })

  it.each([
    { label: 'non-decision node', node: { kind: 'task' as const } },
    { label: 'fog decision node', node: { status: 'fog' as const } },
    { label: 'queued decision node', node: { status: 'queued' as const } },
  ])('refuses repeat permission for a $label', async ({ node }) => {
    await expect(allowWorkTreeRepeatPermission(
      repeatPermissionInput(node),
      {} as StandingRoutePorts,
    )).resolves.toEqual({
      kind: 'unavailable',
      reason: 'repeat_permission_not_available',
      summary: 'Repeat permission is only available for a ready WorkTree decision.',
    })
  })
})

function repeatPermissionInput(
  nodeOverrides: Partial<WorkNode> = {},
): Parameters<typeof allowWorkTreeRepeatPermission>[0] {
  const node = input().tree.nodes[0]
  if (node === undefined) throw new Error('memo_fixture_node_missing')
  return {
    requestRef: 'request:t49',
    revision: 4,
    routeRef: 'route:t49',
    delegatedCredentialId: 'credential:t49',
    occurrences: 2,
    cumulativeSpend: { currency: 'AUD', units: '1000', exponent: 2 },
    validUntil: 200,
    idempotencyKey: 'allow-repeat:t49',
    principalId: 'principal:t49',
    projectId,
    nodeId: 'decision:t49',
    generation: 1,
    workTreeRevision: 8,
    proposalDigest: 'proposal:t49',
    node: { ...node, cost: undefined, ...nodeOverrides },
  }
}

function repeatUse(overrides: Partial<WorkTreeRepeatUseInput> = {}): WorkTreeRepeatUseInput {
  return {
    binding: repeatBinding(),
    projectId,
    nodeId: 'decision:t49',
    generation: 1,
    workTreeRevision: 8,
    proposalDigest: 'proposal:t49',
    delegatedCredentialId: 'credential:t49',
    now: 150,
    requestedSpend: { currency: 'AUD', units: '4000', exponent: 3 },
    requestedDataAllocations: 1,
    requestedOccurrences: 1,
    ...overrides,
  }
}
function refusalReason(result: WorkTreeRepeatUseResult): string {
  if (result.kind !== 'refused') throw new Error(`expected_repeat_refusal:${result.kind}`)
  return result.reason
}
