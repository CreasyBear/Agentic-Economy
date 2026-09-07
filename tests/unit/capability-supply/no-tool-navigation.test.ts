import { describe, expect, it } from 'vitest'

import {
  noToolNavigation,
  type ToolProjectionNavigationContract,
} from '@/modules/capability-supply/tool-projection'

const relation = (name: 'list' | 'search' | 'describe' | 'compare' | 'call') => ({
  relation: name,
  pathTemplate: `/api/${name}`,
  method: 'POST' as const,
  actionId: `tool.${name}`,
  authentication: name === 'call' ? 'required' as const : 'none' as const,
})

describe('no-Tool navigation', () => {
  it('advertises only browse and search when there is no Tool reference', () => {
    const navigation: ToolProjectionNavigationContract = {
      market: {
        list: relation('list') as ToolProjectionNavigationContract['market']['list'],
        search: relation('search') as ToolProjectionNavigationContract['market']['search'],
        describe: relation('describe') as ToolProjectionNavigationContract['market']['describe'],
        compare: relation('compare') as ToolProjectionNavigationContract['market']['compare'],
      },
      call: relation('call') as ToolProjectionNavigationContract['call'],
    }

    expect(noToolNavigation(navigation).map(({ relation: name }) => name)).toEqual(['list', 'search'])
  })
})
