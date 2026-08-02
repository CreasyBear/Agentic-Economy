// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeDecisionInbox } from '@/components/ae/work-tree/AeDecisionInbox'
import { projectDecisionInbox } from '@/modules/work-tree/public'
import type { WorkNode, WorkTree } from '@/modules/work-tree/public'

afterEach(cleanup)

function decision(nodeId: string): WorkNode {
  return {
    format: 'ae.work-node:v1',
    nodeId,
    kind: 'decision',
    title: nodeId,
    status: 'ready',
    dependsOn: [],
    priority: 2,
    evidenceRefs: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

const tree: WorkTree = {
  format: 'ae.work-tree:v1',
  treeId: 'tree-1',
  projectId: 'project-1',
  generation: 1,
  revision: 1,
  charterText: 'Keep the next decision moving.',
  nodes: [decision('Choose a venue')],
}

describe('AeDecisionInbox', () => {
  it('renders the capped decision surface and routes Lock/Adjust/Park exits', () => {
    const onLock = vi.fn()
    const onAdjust = vi.fn()
    const onPark = vi.fn()
    render(<AeDecisionInbox projection={projectDecisionInbox(tree, { nowMs: 1 })} onLock={onLock} onAdjust={onAdjust} onPark={onPark} />)

    expect(screen.getByRole('heading', { name: 'The decisions that matter' })).toBeTruthy()
    expect(screen.getByText('Next decision: 0h')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lock this in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(screen.getByRole('button', { name: 'Park for now' }))

    expect(onLock).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'Choose a venue' }), expect.objectContaining({ kind: 'lock' }))
    expect(onAdjust).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'Choose a venue' }), expect.objectContaining({ kind: 'adjust' }))
    expect(onPark).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'Choose a venue' }), expect.objectContaining({ kind: 'park' }))
  })
})
