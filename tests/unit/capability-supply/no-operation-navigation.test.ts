import { describe, expect, it } from 'vitest'

import {
  noOperationNavigation,
  type OperationProjectionNavigationContract,
} from '@/modules/capability-supply/operation-projection'

const relation = (name: 'list' | 'search' | 'describe' | 'compare' | 'invoke') => ({
  relation: name,
  pathTemplate: `/api/${name}`,
  method: 'POST' as const,
  actionId: `operation.${name}`,
  authentication: name === 'invoke' ? 'required' as const : 'none' as const,
})

describe('no-Operation navigation', () => {
  it('advertises only browse and search when there is no Operation reference', () => {
    const navigation: OperationProjectionNavigationContract = {
      market: {
        list: relation('list') as OperationProjectionNavigationContract['market']['list'],
        search: relation('search') as OperationProjectionNavigationContract['market']['search'],
        describe: relation('describe') as OperationProjectionNavigationContract['market']['describe'],
        compare: relation('compare') as OperationProjectionNavigationContract['market']['compare'],
      },
      invoke: relation('invoke') as OperationProjectionNavigationContract['invoke'],
    }

    expect(noOperationNavigation(navigation).map(({ relation: name }) => name)).toEqual(['list', 'search'])
  })
})
