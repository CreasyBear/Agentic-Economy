import { describe, expect, it } from 'vitest'

import { readOpenUiBundle } from '@/modules/chat/openui-bundle'
import type { ToolCardProjection } from '@/modules/chat/tool-card'

const search: ToolCardProjection = {
  toolId: 'registry.tools.search',
  title: 'Search tools',
  kind: 'choices',
  state: 'complete',
  choices: [],
  toolRefs: [],
}

describe('openui bundle', () => {
  it('binds a stack to the tool result and leaves prices out of the fence', () => {
    const bundle = readOpenUiBundle([
      'Two lookups match.',
      '```openui',
      'root = Stack([lead, found])',
      'lead = TextContent("Two lookups match the request.")',
      'found = ToolChoices("registry.tools.search")',
      '```',
    ].join('\n'), [search])

    expect(bundle).toMatchObject({
      prose: 'Two lookups match.',
      root: {
        kind: 'stack',
        children: [
          { kind: 'text', text: 'Two lookups match the request.' },
          { kind: 'tool', toolIndex: 0 },
        ],
      },
    })
    if (bundle === null || bundle.root === null) throw new Error('missing_bundle')
    expect([...bundle.consumed]).toEqual([0])
  })

  it('rejects a fence that names a Tool reference instead of a tool id', () => {
    expect(readOpenUiBundle(
      '```openui\nroot = ToolChoices("operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")\n```',
      [search],
    )).toBeNull()
  })

  it('keeps prose visible while the fence is still streaming', () => {
    expect(readOpenUiBundle('Lead sentence.\n```openui\nroot = Stack([lead])', [])).toEqual({
      prose: 'Lead sentence.',
      root: null,
    })
  })
})
