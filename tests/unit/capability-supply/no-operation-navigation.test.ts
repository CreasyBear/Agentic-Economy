import { describe, expect, it } from 'vitest'

import { noOperationNavigation } from '@/modules/capability-supply/internal/operation-project'
import type { OperationProjectionNavigationContract } from '@/modules/capability-supply/internal/operation-projection-types'

const relation = (name: 'search' | 'detail' | 'compare' | 'inspect_plan' | 'invoke') => ({
  relation: name,
  pathTemplate: `/api/${name}`,
  method: 'POST' as const,
  actionId: `operation.${name}`,
  authentication: name === 'invoke' ? 'required' as const : 'none' as const,
})

describe('no-Operation navigation', () => {
  it('does not advertise detail navigation when there is no Operation reference', () => {
    const navigation: OperationProjectionNavigationContract = {
      market: {
        search: relation('search'),
        detail: relation('detail'),
        compare: relation('compare'),
        inspectPlan: relation('inspect_plan'),
      },
      invoke: relation('invoke') as OperationProjectionNavigationContract['invoke'],
    }

    expect(noOperationNavigation(navigation).map(({ relation: name }) => name)).toEqual(['search'])
  })
})
