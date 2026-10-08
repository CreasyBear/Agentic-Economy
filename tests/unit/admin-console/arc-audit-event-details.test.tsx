// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '../../setup/jsdom-platform'

import { AuditEventsTable } from '@/components/ae/admin/audit/components/AuditEventsTable'
import { AUDIT_COPY, type AdminAuditRowModel } from '@/components/ae/admin/audit/audit.contracts'

const auditOneAdmin: NonNullable<AdminAuditRowModel['admin']> = {
  permission: 'manage_provider',
  reasonCode: 'exact_reason_one',
  evidenceRefs: ['evidence:exact-one'],
  beforeState: '{"enabled":true}',
  afterState: '{"enabled":false}',
}

const auditTwoAdmin: NonNullable<AdminAuditRowModel['admin']> = {
  permission: 'manage_provider',
  reasonCode: 'exact_reason_two',
  evidenceRefs: ['evidence:exact-two'],
  beforeState: '{"enabled":true}',
  afterState: '{"enabled":false}',
}

const auditOne: AdminAuditRowModel = {
  id: 'audit:one',
  createdAtLabel: '4 Oct 2026, 6:00 pm',
  createdAtIso: '2026-10-04T10:00:00.000Z',
  eventType: 'admin.action_denied',
  actorRef: 'principal:exact-one',
  targetType: 'Provider',
  targetRef: 'provider:exact-one',
  targetLabel: 'Provider one',
  targetHref: '/admin/providers/provider-one',
  outcomeRaw: 'refused',
  correlationId: 'correlation:exact-one',
  admin: auditOneAdmin,
}

const auditTwo: AdminAuditRowModel = {
  id: 'audit:two',
  createdAtLabel: '4 Oct 2026, 5:00 pm',
  createdAtIso: '2026-10-04T09:00:00.000Z',
  eventType: 'agent.created',
  actorRef: 'principal:exact-two',
  targetType: 'Provider',
  targetRef: 'provider:exact-two',
  targetLabel: 'Provider two',
  targetHref: '/admin/providers/provider-two',
  outcomeRaw: 'completed',
  correlationId: 'correlation:exact-two',
  admin: auditTwoAdmin,
}

const rows = [auditOne, auditTwo] as const
const eventLabels = new Map([
  [auditOne.id, 'Admin action denied'],
  [auditTwo.id, 'Agent created'],
])

function renderTable(
  inputRows: readonly AdminAuditRowModel[] = rows,
  options: Readonly<{
    filtered?: boolean
    paginationStatus?: 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
    onLoadMore?: () => void
  }> = {},
) {
  return render(
    <AuditEventsTable
      rows={inputRows}
      filtered={options.filtered ?? false}
      paginationStatus={options.paginationStatus ?? 'Exhausted'}
      onLoadMore={options.onLoadMore ?? vi.fn()}
    />,
  )
}

function expectCompleteDetails(dialog: HTMLElement, row: AdminAuditRowModel): void {
  if (
    row.targetType === null || row.targetRef === null || row.targetHref === null ||
    row.outcomeRaw === null || row.admin === null ||
    row.admin.beforeState === null || row.admin.afterState === null
  ) throw new Error(`Expected complete detail fixture for ${row.id}`)
  const evidenceRef = row.admin.evidenceRefs[0]
  if (evidenceRef === undefined) throw new Error(`Expected evidence for ${row.id}`)

  expect(within(dialog).getByText(row.id, { exact: true })).toBeInTheDocument()
  const time = within(dialog).getByText(row.createdAtLabel, { exact: true })
  expect(time.tagName).toBe('TIME')
  expect(time).toHaveAttribute('datetime', row.createdAtIso)
  expect(within(dialog).getByText(row.eventType, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.actorRef, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.targetLabel, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.targetType, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.targetRef, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: row.targetLabel })).toHaveAttribute('href', row.targetHref)
  expect(within(dialog).getByText(row.outcomeRaw === 'refused' ? 'Refused' : 'Completed')).toBeInTheDocument()
  expect(within(dialog).getByText(row.outcomeRaw, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.correlationId, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.admin.permission, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.admin.reasonCode, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(evidenceRef, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.admin.beforeState, { exact: true })).toBeInTheDocument()
  expect(within(dialog).getByText(row.admin.afterState, { exact: true })).toBeInTheDocument()
}

afterEach(cleanup)

describe('Arc audit event details', () => {
  it('keeps the closed table concise and inspection free of callbacks', () => {
    const onLoadMore = vi.fn()
    renderTable(rows, { paginationStatus: 'CanLoadMore', onLoadMore })

    const table = screen.getByRole('table', { name: AUDIT_COPY.eventsTitle })
    expect(within(table).getByText(auditOne.createdAtLabel)).toBeInTheDocument()
    expect(within(table).getByText('Admin action denied')).toBeInTheDocument()
    expect(within(table).getByText(auditOne.actorRef)).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: auditOne.targetLabel })).toHaveAttribute('href', auditOne.targetHref)
    expect(within(table).getByText('Refused')).toBeInTheDocument()
    expect(within(table).getByText(auditOne.correlationId)).toBeInTheDocument()
    expect(within(table).getByText('Agent created')).toBeInTheDocument()
    expect(within(table).getByText(auditTwo.createdAtLabel)).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: auditTwo.targetLabel })).toHaveAttribute('href', auditTwo.targetHref)
    expect(within(table).getByText(auditTwo.actorRef)).toBeInTheDocument()
    expect(within(table).getByText(auditTwo.correlationId)).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: /^View /u })).toHaveLength(2)
    expect(screen.queryByText(auditOne.eventType, { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(auditOneAdmin.permission, { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(auditOneAdmin.reasonCode, { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(auditOneAdmin.evidenceRefs[0] ?? '', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(auditOneAdmin.beforeState ?? '', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText(auditOneAdmin.afterState ?? '', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Copy /u })).not.toBeInTheDocument()
    expect(document.querySelector('form')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `View ${eventLabels.get(auditOne.id)} at ${auditOne.createdAtLabel}` }))
    expect(screen.getByRole('dialog', { name: 'Audit event' })).toBeInTheDocument()
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('opens either exact row with its complete current facts and raw states', () => {
    renderTable()

    for (const row of rows) {
      const label = eventLabels.get(row.id)
      if (label === undefined) throw new Error(`Missing event label for ${row.id}`)
      fireEvent.click(screen.getByRole('button', { name: `View ${label} at ${row.createdAtLabel}` }))

      const dialog = screen.getByRole('dialog', { name: 'Audit event' })
      expectCompleteDetails(dialog, row)

      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog', { name: 'Audit event' })).not.toBeInTheDocument()
    }
  })

  it('keeps row identity when the table is sorted before inspection', () => {
    const onLoadMore = vi.fn()
    renderTable(rows, { paginationStatus: 'CanLoadMore', onLoadMore })

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Event type' }))
    expect(screen.getByRole('button', { name: 'Sort by Event type' }).closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Event type' }))
    expect(screen.getByRole('button', { name: 'Sort by Event type' }).closest('th')?.getAttribute('aria-sort')).toBe('descending')
    const actions = screen.getAllByRole('button', { name: /^View /u })
    expect(actions[0]).toHaveAccessibleName(`View ${eventLabels.get(auditTwo.id)} at ${auditTwo.createdAtLabel}`)
    fireEvent.click(screen.getByRole('button', { name: `View ${eventLabels.get(auditTwo.id)} at ${auditTwo.createdAtLabel}` }))

    const dialog = screen.getByRole('dialog', { name: 'Audit event' })
    expectCompleteDetails(dialog, auditTwo)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('refreshes an open detail view from a same-ID source row update', () => {
    const view = renderTable([auditOne])
    fireEvent.click(screen.getByRole('button', { name: `View ${eventLabels.get(auditOne.id)} at ${auditOne.createdAtLabel}` }))
    const refreshed: AdminAuditRowModel = {
      ...auditOne,
      createdAtLabel: '4 Oct 2026, 6:01 pm',
      createdAtIso: '2026-10-04T10:01:00.000Z',
      actorRef: 'principal:refreshed',
      outcomeRaw: 'unknown_outcome',
      admin: {
        ...auditOneAdmin,
        reasonCode: 'refreshed_reason',
        evidenceRefs: ['evidence:refreshed'],
        afterState: '{"enabled":"pending"}',
      },
    }

    view.rerender(
      <AuditEventsTable rows={[refreshed]} filtered={false} paginationStatus="Exhausted" onLoadMore={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Audit event' })
    expect(within(dialog).getByText(refreshed.createdAtLabel)).toBeInTheDocument()
    expect(within(dialog).getByText(refreshed.actorRef, { exact: true })).toBeInTheDocument()
    expect(within(dialog).getByText('Unknown outcome')).toBeInTheDocument()
    expect(within(dialog).getByText('refreshed_reason', { exact: true })).toBeInTheDocument()
    expect(within(dialog).getByText('evidence:refreshed', { exact: true })).toBeInTheDocument()
    expect(within(dialog).getByText('{"enabled":"pending"}', { exact: true })).toBeInTheDocument()
    expect(within(dialog).queryByText(auditOne.actorRef, { exact: true })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('exact_reason_one', { exact: true })).not.toBeInTheDocument()
  })

  it('closes when the selected row leaves the source and stays closed if it returns', async () => {
    const view = renderTable([auditOne])
    fireEvent.click(screen.getByRole('button', { name: `View ${eventLabels.get(auditOne.id)} at ${auditOne.createdAtLabel}` }))
    expect(screen.getByRole('dialog', { name: 'Audit event' })).toBeInTheDocument()

    view.rerender(<AuditEventsTable rows={[]} filtered paginationStatus="Exhausted" onLoadMore={vi.fn()} />)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audit event' })).not.toBeInTheDocument())
    view.rerender(<AuditEventsTable rows={[auditOne]} filtered paginationStatus="Exhausted" onLoadMore={vi.fn()} />)
    expect(screen.queryByRole('dialog', { name: 'Audit event' })).not.toBeInTheDocument()
  })

  it('returns focus to the exact row action after native Close and Escape dismissal', async () => {
    renderTable()
    const triggerName = `View ${eventLabels.get(auditTwo.id)} at ${auditTwo.createdAtLabel}`
    const getTrigger = () => screen.getByRole('button', { name: triggerName })

    fireEvent.click(getTrigger())
    let dialog = screen.getByRole('dialog', { name: 'Audit event' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.activeElement).toBe(getTrigger()))

    fireEvent.click(getTrigger())
    dialog = screen.getByRole('dialog', { name: 'Audit event' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Audit event' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(getTrigger()))
  })

  it('keeps null and unknown facts literal and links only fully specified targets', () => {
    const incompleteBase: AdminAuditRowModel = {
      ...auditOne,
      id: 'audit:unknown',
      eventType: 'future.audit_signal',
      targetType: null,
      targetLabel: 'Target unavailable',
      outcomeRaw: null,
      admin: null,
    }
    const partialTargets: readonly AdminAuditRowModel[] = [
      incompleteBase,
      { ...incompleteBase, id: 'audit:no-target-ref', targetRef: null },
      { ...incompleteBase, id: 'audit:no-target-href', targetHref: null },
    ]
    renderTable(partialTargets)

    const table = screen.getByRole('table', { name: AUDIT_COPY.eventsTitle })
    const actions = screen.getAllByRole('button', { name: `View Future audit signal at ${incompleteBase.createdAtLabel}` })
    expect(actions).toHaveLength(partialTargets.length)
    for (const [index, row] of partialTargets.entries()) {
      const action = actions[index]
      if (action === undefined) throw new Error(`Missing action for ${row.id}`)
      const tableRow = action.closest('tr')
      if (tableRow === null) throw new Error(`Missing table row for ${row.id}`)
      expect(within(tableRow).getByText('Target unavailable')).toBeInTheDocument()
      expect(within(tableRow).queryByRole('link')).not.toBeInTheDocument()
    }
    expect(within(table).getAllByText('Unavailable')).toHaveLength(partialTargets.length)

    const firstAction = actions[0]
    if (firstAction === undefined) throw new Error(`Missing action for ${incompleteBase.id}`)
    fireEvent.click(firstAction)
    const dialog = screen.getByRole('dialog', { name: 'Audit event' })
    expect(within(dialog).getByText('future.audit_signal', { exact: true })).toBeInTheDocument()
    expect(within(dialog).getByText('Unavailable')).toBeInTheDocument()
    expect(within(dialog).getByText('Target unavailable')).toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Permission', { exact: true })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Reason code', { exact: true })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Evidence', { exact: true })).not.toBeInTheDocument()
  })

  it('shows truthful empty states and loads another page only on explicit request', () => {
    const onLoadMore = vi.fn()
    const view = renderTable([], { filtered: false, paginationStatus: 'CanLoadMore', onLoadMore })
    expect(screen.getByRole('table', { name: AUDIT_COPY.eventsTitle })).toHaveTextContent(AUDIT_COPY.nothingNeedsAttention)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).toHaveBeenCalledOnce()

    onLoadMore.mockClear()
    view.rerender(
      <AuditEventsTable rows={[]} filtered paginationStatus="CanLoadMore" onLoadMore={onLoadMore} />,
    )
    expect(screen.getByRole('table', { name: AUDIT_COPY.eventsTitle })).toHaveTextContent(AUDIT_COPY.noFilterMatches)
    expect(onLoadMore).not.toHaveBeenCalled()

    view.rerender(
      <AuditEventsTable rows={rows} filtered={false} paginationStatus="CanLoadMore" onLoadMore={onLoadMore} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Event type' }))
    fireEvent.click(screen.getByRole('button', { name: `View ${eventLabels.get(auditOne.id)} at ${auditOne.createdAtLabel}` }))
    expect(screen.getByRole('dialog', { name: 'Audit event' })).toBeInTheDocument()
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})
