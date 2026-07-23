import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runHarnessTool } from '@/modules/harness/public'
import {
  actionToHarnessToolContract,
  createHarnessToolBoundaryInstrumentation,
  harnessToolContractToDefinition,
  type HarnessToolBoundaryEvent,
} from '@/modules/harness/tool-contract'
import * as convexSource from '@/lib/server/convex-source'
import { comparisonCompareAction } from '@/modules/comparison/comparison.actions'
import { buildComparisonRouteReadback } from '@/routes/compare'
import { createComparisonOfferingReadPort } from '@/modules/comparison/comparison.functions'

const selections = [
  {
    businessId: 'legacy-business:plumbing-demo',
    offeringRef: 'legacy-offering:plumbing-demo:diagnostic-plumbing',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
  {
    businessId: 'legacy-business:fremantle-coastal-electrical',
    offeringRef: 'legacy-offering:fremantle-coastal-electrical:electrical-fault-repairs',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
] as const

describe('human and structured comparison parity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T10:00:00Z'))
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('runs through the validated read-only harness and deep-equals the human result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const publicMutationSpy = vi.spyOn(convexSource, 'callPublicSourceMutation')
    const mutationSpy = vi.spyOn(convexSource, 'callSourceMutation')
    const boundaryEvents: HarnessToolBoundaryEvent[] = []
    const instrumentation = createHarnessToolBoundaryInstrumentation(
      (event) => boundaryEvents.push(event),
    )
    const priorities = ['professional_service:v1:lowest_total_price'] as const
    const outcome = await runHarnessTool({
      tool: harnessToolContractToDefinition(actionToHarnessToolContract(
        comparisonCompareAction,
        instrumentation,
      )),
      input: { selections, priorities },
      surface: 'agentJson',
      allowWrites: false,
    })
    expect(outcome.decision).toMatchObject({
      policy: 'allow',
      tier: 'read',
    })
    expect(outcome.result.status).toBe('ok')

    const human = await buildComparisonRouteReadback({
      selection: selections.map((selection) => JSON.stringify(selection)),
      priority: [...priorities],
    }, createComparisonOfferingReadPort())
    expect(human.kind).toBe('ready')
    if (human.kind !== 'ready') return

    expect(outcome.result.output).toEqual({
      kind: 'comparison',
      ...human.comparison,
    })
    expect(JSON.stringify(outcome.result.output)).not.toMatch(
      /sourceHash|credential|adapterConfig|privateReason|retry|inquiry|booking|payment/i,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(publicMutationSpy).not.toHaveBeenCalled()
    expect(mutationSpy).not.toHaveBeenCalled()
    expect(instrumentation.snapshot()).toEqual({
      actionInvocationEmissions: 0,
      controlEmissions: 0,
      attemptEmissions: 0,
      historyEmissions: 0,
      approvalPolicyEmissions: 1,
    })
    expect(boundaryEvents.filter(({ kind }) => [
      'action_invocation',
      'control',
      'attempt',
      'history',
    ].includes(kind))).toEqual([])
  })
})
