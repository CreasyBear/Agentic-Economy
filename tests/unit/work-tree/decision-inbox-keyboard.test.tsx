// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeDecisionInbox } from '@/components/ae/work-tree/AeDecisionInbox'
import type { DecisionInboxExit, DecisionInboxItem, DecisionInboxProjection } from '@/modules/work-tree/public'

/**
 * The three exits are the only irreversible controls on the page, so they have
 * to work for someone who never touches a mouse.
 *
 * jsdom does not synthesise a click from Enter/Space the way a browser does, so
 * pressing keys here would prove nothing. What actually earns keyboard support
 * is the markup: a native `<button type="button">` that is enabled and left in
 * the natural tab order. These tests pin exactly that, plus the states a
 * screen-reader user depends on — inert exits while a decision is in flight, a
 * polite receipt, and an assertive refusal.
 */

afterEach(cleanup)

const EXIT_LABELS = ['Lock this in', 'Adjust', 'Park for now'] as const

function item(overrides: Partial<DecisionInboxItem> = {}): DecisionInboxItem {
  const treeId = 'tree-1'
  const nodeId = overrides.nodeId ?? 'decision-1'
  const exit = (kind: 'lock' | 'adjust' | 'park'): DecisionInboxExit => {
    const expectedGeneration = 1
    const expectedRevision = 1
    const proposalDigest = `proposal:${nodeId}:${kind}`
    return {
      kind,
      treeId,
      projectId: 'project-1',
      nodeId,
      expectedGeneration,
      expectedRevision,
      proposalDigest,
      decisionIdentity: {
        treeId,
        projectId: 'project-1',
        nodeId,
        proposalDigest,
        generation: expectedGeneration,
        revision: expectedRevision,
      },
    }
  }
  return {
    source: 'ready-node',
    status: 'ready',
    treeId,
    projectId: 'project-1',
    nodeId,
    title: 'Choose how your BAS gets brought up to date',
    readyAt: 1,
    priority: 3,
    moneyYes: false,
    irreversibility: 0,
    constraintPower: 0,
    leadTimeDays: 0,
    priorityUrgency: 0,
    requiresStepUp: false,
    authorityWidening: false,
    eligibleForRepeatPermission: false,
    exits: { lock: exit('lock'), adjust: exit('adjust'), park: exit('park') },
    ...overrides,
  }
}

function projection(items: readonly DecisionInboxItem[] = [item()]): DecisionInboxProjection {
  return { items, nextDecision: 'Next decision: 0h', nextDecisionHours: 0 }
}

describe('AeDecisionInbox keyboard and announcement semantics', () => {
  it('exposes every exit as a focusable native button that reports its decision', () => {
    const onLock = vi.fn()
    const onAdjust = vi.fn()
    const onPark = vi.fn()
    render(<AeDecisionInbox projection={projection()} onLock={onLock} onAdjust={onAdjust} onPark={onPark} />)

    for (const label of EXIT_LABELS) {
      const button = screen.getByRole('button', { name: label })
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      // No tabindex override and not disabled: the exit stays in the natural
      // tab order, which is what makes Enter and Space work at all.
      expect(button.getAttribute('tabindex')).toBeNull()
      expect(button.hasAttribute('disabled')).toBe(false)
      button.focus()
      expect(document.activeElement).toBe(button)
      fireEvent.click(button)
    }

    expect(onLock.mock.calls[0]?.[1]).toMatchObject({ kind: 'lock', nodeId: 'decision-1' })
    expect(onAdjust.mock.calls[0]?.[1]).toMatchObject({ kind: 'adjust', nodeId: 'decision-1' })
    expect(onPark.mock.calls[0]?.[1]).toMatchObject({ kind: 'park', nodeId: 'decision-1' })
  })

  it('makes every exit inert while a decision is in flight and announces the wait politely', () => {
    const onLock = vi.fn()
    render(
      <AeDecisionInbox projection={projection()} pendingExit="lock" onLock={onLock} onAdjust={vi.fn()} onPark={vi.fn()} />,
    )

    for (const label of EXIT_LABELS) {
      expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
    }
    expect(screen.getByRole('button', { name: 'Lock this in' }).getAttribute('aria-busy')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(onLock).not.toHaveBeenCalled()

    const pending = screen.getByText('Locking this in…').closest('[aria-live]')
    expect(pending?.getAttribute('aria-live')).toBe('polite')
    expect(pending?.getAttribute('aria-busy')).toBe('true')
  })

  it('announces a receipt politely', () => {
    render(
      <AeDecisionInbox
        projection={projection()}
        status={{ tone: 'receipt', message: 'Locked in — locked.', detail: 'Receipt receipt_1 at revision 5.' }}
        onLock={vi.fn()}
        onAdjust={vi.fn()}
        onPark={vi.fn()}
      />,
    )

    const receipt = screen.getByText('Locked in — locked.').closest('[aria-live]')
    expect(receipt?.getAttribute('role')).toBe('status')
    expect(receipt?.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText('Receipt receipt_1 at revision 5.')).toBeTruthy()
  })

  it('announces a refusal assertively and leaves the exits usable', () => {
    render(
      <AeDecisionInbox
        projection={projection()}
        status={{ tone: 'refusal', message: 'Adjusted was refused.', detail: 'Nothing changed.' }}
        onLock={vi.fn()}
        onAdjust={vi.fn()}
        onPark={vi.fn()}
      />,
    )

    // A refusal is something the person asked for and did not get; it interrupts.
    const refusal = screen.getByRole('alert')
    expect(refusal.getAttribute('aria-live')).toBe('assertive')
    expect(refusal.textContent).toContain('Adjusted was refused.')
    expect(refusal.textContent).toContain('Nothing changed.')
    expect(screen.getByRole('button', { name: 'Adjust' }).hasAttribute('disabled')).toBe(false)
  })

  it('reports which waiting decision is selected and switches the detail with it', () => {
    render(
      <AeDecisionInbox
        projection={projection([item(), item({ nodeId: 'decision-2', title: 'Confirm the lodgement date' })])}
        onLock={vi.fn()}
        onAdjust={vi.fn()}
        onPark={vi.fn()}
      />,
    )

    const second = screen.getByRole('button', { name: /Confirm the lodgement date/u })
    expect(second.getAttribute('aria-pressed')).toBe('false')

    second.focus()
    fireEvent.click(second)

    expect(screen.getByRole('button', { name: /Confirm the lodgement date/u }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Confirm the lodgement date', { selector: 'div' })).toBeTruthy()
  })
})
