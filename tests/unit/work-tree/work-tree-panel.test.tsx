// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeWorkTreePanel } from '@/components/ae/work-tree/AeWorkTreePanel'
import type { WorkNode, WorkTree } from '@/modules/work-tree/public'

type MockTreeNode = {
  nodeId: string
  title: string
  children?: readonly MockTreeNode[]
}

type MockRendererProps = {
  node: {
    data: MockTreeNode
    level: number
    isInternal: boolean
    isOpen: boolean
    toggle: () => void
  }
  style: Readonly<Record<string, number>>
}

vi.mock('react-arborist', () => ({
  Tree: ({ data, children: Renderer }: { data: readonly MockTreeNode[]; children: (props: MockRendererProps) => ReactElement }) => {
    const renderNode = (item: MockTreeNode, level: number): ReactElement[] => [
      <Renderer key={item.nodeId} node={{ data: item, level, isInternal: (item.children?.length ?? 0) > 0, isOpen: true, toggle: vi.fn() }} style={{ top: 0, height: 72 }} />,
      ...(item.children ?? []).flatMap((child) => renderNode(child, level + 1)),
    ]
    return <div role="tree">{data.flatMap((item) => renderNode(item, 0))}</div>
  },
}))

afterEach(cleanup)

function node(overrides: Partial<WorkNode>): WorkNode {
  return {
    format: 'ae.work-node:v1',
    nodeId: 'root',
    kind: 'package',
    title: 'Plan',
    status: 'ready',
    dependsOn: [],
    priority: 2,
    timing: { certainty: 'window', window: { earliest: '2026-08-01', latest: '2026-08-08' } },
    evidenceRefs: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const tree: WorkTree = {
  format: 'ae.work-tree:v1',
  treeId: 'tree-1',
  projectId: 'project-1',
  generation: 1,
  revision: 1,
  charterText: 'Keep the plan moving.',
  nodes: [
    node({ nodeId: 'root', title: 'Plan' }),
    node({ nodeId: 'fog-node', title: 'Still open', kind: 'task', status: 'fog', parentId: 'root' }),
  ],
}

describe('AeWorkTreePanel', () => {
  it('keeps the tree behind the whole-plan disclosure and shows status plus dimensions', () => {
    render(<AeWorkTreePanel tree={tree} />)

    expect(screen.queryByRole('tree')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See the whole plan' }))

    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getByText('Plan')).toBeTruthy()
    expect(screen.getByText('fog')).toBeTruthy()
    expect(screen.getAllByText('Timing: 2026-08-01–2026-08-08')).toHaveLength(2)
    expect(screen.getByLabelText('Five dimensions for Still open')).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: /Still open/u }).getAttribute('data-fog')).toBe('true')
  })
})
