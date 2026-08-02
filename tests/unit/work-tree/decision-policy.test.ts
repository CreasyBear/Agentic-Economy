import { describe, expect, it } from 'vitest'

import { assessWorkTreeDecisionPolicy } from '@/modules/work-tree/convex'
import type { WorkNode } from '@/modules/work-tree/public'

function decision(overrides: Partial<WorkNode> = {}): WorkNode {
  return {
    format: 'ae.work-node:v1',
    nodeId: 'decision:t49-policy',
    kind: 'decision',
    title: 'T49 policy decision',
    status: 'ready',
    dependsOn: [],
    priority: 1,
    evidenceRefs: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('WorkTree decision policy', () => {
  it('keeps low-risk exact Lock eligible for bounded repeat use without step-up', () => {
    expect(assessWorkTreeDecisionPolicy(decision(), 'lock')).toMatchObject({
      requiresStepUp: false,
      eligibleForRepeatPermission: true,
      paid: false,
      irreversible: false,
      authorityWidening: false,
    })
  })

  it.each([
    { label: 'paid', node: decision({ cost: { currency: 'AUD', estimateMinor: 1 } }) },
    { label: 'irreversible', node: decision({ resource: { owner: 'business', exclusive: { startMs: 1, endMs: 2 } } }) },
    { label: 'authority widening', node: decision({ authorityRef: 'authority:t49' }) },
    { label: 'judgement scope', node: decision({ scope: { acceptance: 'judgement' } }) },
  ])('requires per-item step-up for protected Lock: $label', ({ node }) => {
    expect(assessWorkTreeDecisionPolicy(node, 'lock')).toMatchObject({
      requiresStepUp: true,
      eligibleForRepeatPermission: false,
    })
  })

  it('keeps Adjust and Park explicit but does not apply Lock step-up policy', () => {
    const paid = decision({ cost: { currency: 'AUD', estimateMinor: 1 }, authorityRef: 'authority:t49' })
    expect(assessWorkTreeDecisionPolicy(paid, 'adjust')).toMatchObject({
      requiresStepUp: false,
      eligibleForRepeatPermission: false,
    })
    expect(assessWorkTreeDecisionPolicy(paid, 'park')).toMatchObject({
      requiresStepUp: false,
      eligibleForRepeatPermission: false,
    })
  })
})
