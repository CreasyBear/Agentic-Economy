import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { comparisonCompareAction } from '@/modules/comparison/comparison.actions'
import { actionToHarnessTool, runHarnessTool } from '@/modules/harness/action-tool'

const machineSelections = [
  {
    businessId: 'demo-business:graphql-data',
    offeringRef: 'demo-offering:graphql-data',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
  {
    businessId: 'demo-business:rest-data',
    offeringRef: 'demo-offering:rest-data',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
] as const

describe('Offering comparison vertical and horizontal transfer', () => {
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

  it('orders two machine/data Offerings through the registered comparison action', async () => {
    const outcome = await runHarnessTool({
      tool: actionToHarnessTool(comparisonCompareAction),
      input: {
        selections: machineSelections,
        priorities: ['machine_data:v1:lowest_request_price'],
      },
      surface: 'agentJson',
      allowWrites: false,
    })

    expect(outcome.result.status).toBe('ok')
    expect(outcome.result.output).toMatchObject({
      kind: 'comparison',
      schemaVersion: 'offering-comparison:v1',
      ordering: {
        kind: 'ordered',
        decisivePriorityIds: ['machine_data:v1:lowest_request_price'],
      },
    })
  })
})
