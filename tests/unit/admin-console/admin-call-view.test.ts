import { describe, expect, it } from 'vitest'

import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { shapeAdminCallView } from '../../../convex/lib/adminConsole/reads/call'

const parsedCallRef = parseCallRef(`operation-invocation:v1:${'a'.repeat(64)}`)
if (parsedCallRef.kind !== 'valid') throw new Error('test_call_ref_invalid')

describe('admin Call view', () => {
  it('keeps a completed result with uncertain money facts unresolved', () => {
    const status = {
      kind: 'found' as const,
      version: 1,
      callRef: parsedCallRef.ref,
      toolRef: `operation:v1:${'b'.repeat(64)}`,
      state: 'terminal' as const,
      result: {
        kind: 'completed' as const,
        callRef: parsedCallRef.ref,
        toolRef: `operation:v1:${'b'.repeat(64)}`,
        output: { answer: 42 },
        evidenceHash: 'sha256:completed-result',
        usage: {
          usageRef: 'usage:uncertain-admin-view',
          observedAt: 1_800_000_000_000,
          chargeState: 'outcome_unknown' as const,
          amount: { currency: 'AUD', units: '2500000', exponent: 6 },
          priceDigest: 'sha256:price',
        },
      },
    }

    const view = shapeAdminCallView({
      ref: parsedCallRef.ref,
      state: 'completed',
      quoteRef: null,
      toolRef: null,
      workspaceRef: null,
      agentRef: null,
      correlationId: null,
      resolution: null,
      answerModelCost: null,
      timeline: [],
      status,
    })

    expect(view.purchase.kind).toBe('uncertain')
    expect(view.receipt.resultKind).toBe('completed')
    expect(view.receipt.complete).toBe(false)
    expect(JSON.stringify(view)).not.toContain('"answer":42')
  })
})
