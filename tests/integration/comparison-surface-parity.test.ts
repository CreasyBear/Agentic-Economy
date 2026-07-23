import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { actionToHarnessTool, runHarnessTool } from '@/modules/harness/public'
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
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('runs through the validated read-only harness and deep-equals the human result', async () => {
    const priorities = ['professional_service:v1:lowest_total_price'] as const
    const outcome = await runHarnessTool({
      tool: actionToHarnessTool(comparisonCompareAction),
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

    expect(outcome.result.output).toEqual(human.comparison)
    expect(JSON.stringify(outcome.result.output)).not.toMatch(
      /sourceHash|credential|adapterConfig|privateReason|retry|inquiry|booking|payment/i,
    )
  })
})
