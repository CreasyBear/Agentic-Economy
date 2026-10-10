// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { ProviderToolVersionsTable } from '@/components/ae/admin/provider-object/components/ProviderToolVersionsTable'
import { ProviderConnectionsTable } from '@/components/ae/admin/provider-object/components/ProviderConnectionsTable'
import { ProviderAdmissionCasesTable } from '@/components/ae/admin/provider-object/components/ProviderAdmissionCasesTable'
import { ProviderRemovalDisputesTable } from '@/components/ae/admin/provider-object/components/ProviderRemovalDisputesTable'
import { formatTimestamp } from '@/lib/ui/format-time'

afterEach(cleanup)

function toolRef(character: string) {
  const value = `operation:v1:${character.repeat(64)}`
  if (!isPublicToolRef(value)) throw new Error('invalid_fixture_tool_ref')
  return value
}

describe('Arc Provider record tables', () => {
  it('preserves publication order, full native destinations, current revision and authority facts', () => {
    const refs = [toolRef('b'), toolRef('a')]
    render(<ProviderToolVersionsTable rows={refs.map((ref, index) => ({
      ref, revision: index === 0 ? null : 12, disposition: 'current',
      sourceAuthorityState: index === 0 ? 'review_required' : 'verified', sourceAuthorityReview: null,
    }))} />)
    const table = screen.getByRole('table', { name: 'Tool versions' })
    expect(within(table).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual(
      refs.map(ref => [ref, `/admin/tools/${encodeURIComponent(ref)}`]),
    )
    expect(within(table).getByText('Current revision')).toBeTruthy()
    expect(within(table).getByText('12')).toBeTruthy()
    expect(within(table).getByText('Review required')).toBeTruthy()
    expect(within(table).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('preserves unknown environment and exact admission timestamps without adding commands', () => {
    const timestamp = Date.UTC(2026, 9, 2, 6, 30)
    render(<>
      <ProviderConnectionsTable rows={[{ connectionRef: 'connection:exact', lifecycle: 'reauthorization_required', sourceEnvironment: null }]} />
      <ProviderAdmissionCasesTable rows={[{ caseRef: 'admission:exact', state: 'under_review', updatedAt: timestamp }]} />
    </>)
    const connections = screen.getByRole('table', { name: 'Connections' })
    expect(within(connections).getByText('connection:exact')).toBeTruthy()
    expect(within(connections).getByText('Unavailable')).toBeTruthy()
    expect(within(connections).getByText('Reauthorization required')).toBeTruthy()
    const admission = screen.getByRole('table', { name: 'Admission cases' })
    const time = admission.querySelector('time')
    expect(time?.getAttribute('datetime')).toBe(new Date(timestamp).toISOString())
    expect(time?.getAttribute('title')).toBe(formatTimestamp(timestamp))
    expect(within(admission).queryByRole('button', { name: /sort/i })).toBeNull()
  })

  it('opens only the permission-supplied dispute review with the exact current row', () => {
    const onClose = vi.fn()
    const opened = { disputeRef: 'dispute:opened', status: 'opened' as const, updatedAt: 1790910000000 }
    const closed = { disputeRef: 'dispute:closed', status: 'closed' as const, updatedAt: 1790910000001 }
    const view = render(<ProviderRemovalDisputesTable rows={[opened, closed]} onCloseDispute={onClose} />)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Close dispute' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close dispute' }))
    expect(onClose).toHaveBeenCalledExactlyOnceWith(opened)
    view.rerender(<ProviderRemovalDisputesTable rows={[opened, closed]} />)
    expect(screen.queryByRole('button', { name: 'Close dispute' })).toBeNull()
  })

  it('keeps each truthful empty state and table identity', () => {
    render(<>
      <ProviderToolVersionsTable rows={[]} />
      <ProviderConnectionsTable rows={[]} />
      <ProviderAdmissionCasesTable rows={[]} />
      <ProviderRemovalDisputesTable rows={[]} />
    </>)
    expect(screen.getAllByRole('table')).toEqual(
      ['Tool versions', 'Connections', 'Admission cases', 'Removal disputes'].map(name => screen.getByRole('table', { name })),
    )
    for (const message of ['No Tool versions for this Provider.', 'No Provider connections.', 'No admission cases.', 'No removal disputes.']) {
      expect(screen.getByText(message)).toBeTruthy()
    }
    expect(screen.queryAllByRole('button').filter(button => button.getAttribute('aria-haspopup') !== 'menu')).toEqual([])
  })
})
