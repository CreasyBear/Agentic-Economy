/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const readHistory = vi.fn()

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-start')>(),
  useServerFn: () => readHistory,
}))

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Link: React.forwardRef(function MockLink(
      { children, to, ...props }: { children: ReactNode; to: string },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return <a ref={ref} href={to} {...props}>{children}</a>
    }),
  }
})

import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { AeSecurityHistoryTable } from '@/components/ae/settings/AeSecurityHistoryTable'
import { AeAgentSecurityHistory } from '@/components/ae/agent-access/AeAgentSecurityHistory'
import type { AccountSecurityHistoryItem, AccountSecurityHistoryResult } from '@/modules/security/account-security'

afterEach(() => {
  cleanup()
  readHistory.mockReset()
})

describe('account security history', () => {
  it('keeps compromise recovery as independent source checks without claiming containment', () => {
    render(<AeCompromiseRecoveryChecklist />)

    expect(screen.getByRole('heading', { name: 'If you suspect compromise' })).toBeTruthy()
    expect(document.querySelector('details')).toBeNull()
    expect(screen.getByText('This page does not mark the account contained')).toBeTruthy()
    expect(screen.getByText(/Resetting MFA alone does not revoke existing sessions/u)).toBeTruthy()
    expect(screen.getByText(/Opening this checklist does not revoke access/u)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Review' }).map((link) => link.getAttribute('href')))
      .toEqual(['/owner/settings/account/security', '/owner/settings/agent-keys', '/owner/settings/integrations'])
    expect(screen.getByText(/Review wallet-control authority and its generation separately from Tool readiness\./u))
      .toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href'))
      .toBe('/support')
    expect(document.body.textContent).not.toContain('Contained')
  })

  it('opens durable security evidence on demand without exposing raw identity or payloads', () => {
    render(<AeAccountSecurityHistory initialResult={available()} />)

    const table = screen.getByRole('table', { name: 'Account security history' })
    expect(screen.getByRole('heading', { name: 'Recorded activity' })).toBeTruthy()
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Activity',
      'Time',
      'Source',
      'Evidence',
    ])
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(screen.getByText('Revoked')).toBeTruthy()
    expect(screen.getByText('Clerk observed')).toBeTruthy()
    expect(within(table).getByText(/^Recorded /u)).toBeTruthy()
    expect(screen.queryByText('clerk:delivery-hash')).toBeNull()
    expect(document.querySelector('details')).toBeNull()
    const detailsButton = screen.getByRole('button', {
      name: 'View details for security event audit:clerk:delivery-hash',
    })
    detailsButton.focus()
    fireEvent.click(detailsButton)

    const drawer = screen.getByRole('dialog', { name: 'Security event' })
    expect(within(drawer).getByText('Session revoked · Revoked')).toBeTruthy()
    expect(within(drawer).getByText('Event reference')).toBeTruthy()
    expect(within(drawer).getByText('audit:clerk:delivery-hash')).toBeTruthy()
    expect(within(drawer).getByText('Clerk observed')).toBeTruthy()
    expect(within(drawer).getByText('Observed time')).toBeTruthy()
    expect(within(drawer).getByText('Recorded time')).toBeTruthy()
    expect(within(drawer).getByText('Correlation reference')).toBeTruthy()
    expect(within(drawer).getByText('clerk:delivery-hash')).toBeTruthy()
    expect(within(drawer).getByText('Actor · Owner')).toBeTruthy()
    expect(within(drawer).getByText('Target · Session')).toBeTruthy()
    expect(document.body.textContent).not.toContain('owner@example.test')
    expect(document.body.textContent).not.toContain('192.0.2.1')
    expect(document.body.textContent).not.toContain('session_raw_1')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Security event' })).toBeNull()
    expect(document.activeElement).toBe(detailsButton)
  })

  it('distinguishes AE, Clerk, and provider observations without exposing provider payloads', () => {
    const first = available().page.items[0]!
    render(<AeAccountSecurityHistory initialResult={{
      kind: 'available',
      page: {
        items: [
          { ...first, eventRef: 'audit:ae', correlationRef: 'reference:ae', sourceSystem: 'ae_recorded' },
          { ...first, eventRef: 'audit:clerk', correlationRef: 'reference:clerk', sourceSystem: 'clerk_observed' },
          { ...first, eventRef: 'audit:provider', correlationRef: 'reference:provider', sourceSystem: 'provider_observed' },
        ],
        continueCursor: '',
        isDone: true,
      },
    }} />)

    expect(screen.getByText('AE recorded')).toBeTruthy()
    expect(screen.getByText('Clerk observed')).toBeTruthy()
    expect(screen.getByText('Provider observed')).toBeTruthy()
  })

  it('truthfully keeps the vendor controls available when history cannot load', async () => {
    readHistory.mockResolvedValueOnce(available())
    render(<AeAccountSecurityHistory initialResult={{ kind: 'unavailable', reason: 'source_unavailable' }} />)

    expect(screen.getByRole('alert').textContent).toContain('Security history is temporarily unavailable')
    expect(screen.getByText(/What happened:/u)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — Profile, sessions, and Recovery stay available\./u))
      .toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Session revoked')).toBeTruthy())
    expect(readHistory).toHaveBeenCalledWith({ data: {} })
  })

  it('labels a missing provider observation time instead of substituting record time', () => {
    const result = available()
    const item = result.page.items[0]!
    render(<AeAccountSecurityHistory initialResult={{
      kind: 'available',
      page: {
        ...result.page,
        items: [{
          eventRef: item.eventRef,
          eventType: item.eventType,
          actorKind: item.actorKind,
          actorRef: item.actorRef,
          targetType: item.targetType,
          targetRef: item.targetRef,
          outcome: item.outcome,
          sourceSystem: item.sourceSystem,
          recordedAt: item.recordedAt,
          correlationRef: item.correlationRef,
        }],
      },
    }} />)

    expect(screen.getByText('Observed time unavailable')).toBeTruthy()
    expect(within(screen.getByRole('table', { name: 'Account security history' })).getByText(/^Recorded /u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {
      name: 'View details for security event audit:clerk:delivery-hash',
    }))
    const drawer = screen.getByRole('dialog', { name: 'Security event' })
    expect(within(drawer).getByText('Observed time')).toBeTruthy()
    expect(within(drawer).getByText('Observed time unavailable')).toBeTruthy()
    expect(within(drawer).getByText('Recorded time')).toBeTruthy()
  })

  it('refreshes open evidence by event identity and closes when that event is removed', async () => {
    const first = available().page.items[0]!
    const props = {
      caption: 'Account security history',
      emptyMessage: 'No security events.',
      isDone: true,
      loading: false,
      onLoadMore: vi.fn(),
    }
    const { rerender } = render(<AeSecurityHistoryTable rows={[first]} {...props} />)

    fireEvent.click(screen.getByRole('button', {
      name: `View details for security event ${first.eventRef}`,
    }))
    expect(screen.getByRole('dialog', { name: 'Security event' })).toBeTruthy()

    const refreshed: AccountSecurityHistoryItem = {
      ...first,
      eventType: 'account.security_profile.updated',
      outcome: 'changed',
      sourceSystem: 'provider_observed',
      correlationRef: 'provider:refresh-42',
    }
    rerender(<AeSecurityHistoryTable rows={[refreshed]} {...props} />)
    const updatedDrawer = screen.getByRole('dialog', { name: 'Security event' })
    expect(within(updatedDrawer).getByText('Security profile updated · Changed')).toBeTruthy()
    expect(within(updatedDrawer).getByText('Provider observed')).toBeTruthy()
    expect(within(updatedDrawer).getByText('provider:refresh-42')).toBeTruthy()
    expect(within(updatedDrawer).queryByText('clerk:delivery-hash')).toBeNull()

    rerender(<AeSecurityHistoryTable rows={[]} {...props} />)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Security event' })).toBeNull())
  })

  it('filters durable evidence while keeping actor and target facts behind their disclosure flag', () => {
    const first = available().page.items[0]!
    const second = {
      ...first,
      eventRef: 'audit:clerk:another-event',
      actorRef: 'prn_fedcba9876543210fedcba9876543210',
      correlationRef: 'clerk:another-delivery',
    }
    const rows = [first, second]
    const props = {
      rows,
      caption: 'Account security history',
      emptyMessage: 'No security events.',
      isDone: true,
      loading: false,
      onLoadMore: vi.fn(),
    }
    const { rerender } = render(<AeSecurityHistoryTable {...props} />)
    const table = screen.getByRole('table', { name: 'Account security history' })
    const evidenceHeader = within(table).getByRole('columnheader', { name: 'Evidence' })
    const search = screen.getByRole('searchbox', { name: 'Filter security history…' })

    expect(evidenceHeader.hasAttribute('aria-sort')).toBe(false)
    expect(within(evidenceHeader).queryByRole('button')).toBeNull()
    expect(within(table).getByRole('button', { name: 'Sort by Activity' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Sort by Time' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Sort by Source' })).toBeTruthy()

    fireEvent.change(search, { target: { value: first.actorRef } })
    expect(screen.getByRole('button', { name: `View details for security event ${first.eventRef}` })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `View details for security event ${second.eventRef}` })).toBeNull()

    rerender(<AeSecurityHistoryTable {...props} showActorAndTarget={false} />)
    expect(screen.queryByRole('button', { name: `View details for security event ${first.eventRef}` })).toBeNull()
    expect(screen.getByText('No security events.')).toBeTruthy()
  })

  it('appends the next native page without replacing newer evidence', async () => {
    const first = available(false)
    readHistory.mockResolvedValueOnce({
      kind: 'available',
      page: {
        items: [{
          ...first.page.items[0]!,
          eventRef: 'audit:clerk:older',
          eventType: 'account.session.ended',
          correlationRef: 'clerk:older-delivery-hash',
        }],
        continueCursor: '',
        isDone: true,
      },
    })
    render(<AeAccountSecurityHistory initialResult={first} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
    await waitFor(() => expect(screen.getByText('Session ended')).toBeTruthy())
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(readHistory).toHaveBeenCalledWith({ data: { cursor: 'cursor-1' } })
  })

  it('keeps known Account events and the exact cursor when continuation is unavailable', async () => {
    const first = available(false)
    readHistory
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })
      .mockResolvedValueOnce({
        kind: 'available',
        page: {
          items: [{
            ...first.page.items[0]!,
            eventRef: 'audit:clerk:older-after-retry',
            eventType: 'account.session.ended',
            correlationRef: 'clerk:older-after-retry',
          }],
          continueCursor: '',
          isDone: true,
        },
      })
    render(<AeAccountSecurityHistory initialResult={first} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry older events' })).toBeTruthy())
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(screen.getByText(/Older security events could not be loaded\./u)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — known security history remains visible\./u)).toBeTruthy()
    expect(screen.getByText(/Check your connection and retry older events\./u)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry older events' }))
    await waitFor(() => expect(screen.getByText('Session ended')).toBeTruthy())
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(readHistory).toHaveBeenNthCalledWith(1, { data: { cursor: 'cursor-1' } })
    expect(readHistory).toHaveBeenNthCalledWith(2, { data: { cursor: 'cursor-1' } })
  })

  it('deduplicates a repeated native page boundary by durable event identity', async () => {
    const first = available(false)
    readHistory.mockResolvedValueOnce({
      kind: 'available',
      page: {
        items: [first.page.items[0]!],
        continueCursor: '',
        isDone: true,
      },
    })
    render(<AeAccountSecurityHistory initialResult={first} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load older events' })).toBeNull())
    expect(screen.getAllByText('Session revoked')).toHaveLength(1)
  })

  it('does not append an old Account continuation after equal-content loader evidence is replaced', async () => {
    const first = available(false)
    let resolveOlder: ((result: AccountSecurityHistoryResult) => void) | undefined
    const olderRead = new Promise<AccountSecurityHistoryResult>((resolve) => {
      resolveOlder = resolve
    })
    readHistory.mockReturnValueOnce(olderRead)
    const replacement: AccountSecurityHistoryResult = {
      kind: 'available',
      page: {
        ...first.page,
        items: [...first.page.items],
      },
    }
    const { rerender } = render(<AeAccountSecurityHistory initialResult={first} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))

    rerender(<AeAccountSecurityHistory initialResult={replacement} />)
    await act(async () => {
      resolveOlder?.({
        kind: 'available',
        page: {
          items: [{
            ...first.page.items[0]!,
            eventRef: 'audit:clerk:older-stale',
            eventType: 'account.session.ended',
            correlationRef: 'clerk:older-stale',
          }],
          continueCursor: '',
          isDone: true,
        },
      })
      await olderRead
    })

    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(screen.queryByText('Session ended')).toBeNull()
    expect(screen.getByRole('button', { name: 'Load older events' })).toBeTruthy()
  })
})

describe('Agent security history', () => {
  it('loads only the selected Principal and omits raw actor and target references', async () => {
    const principalRef = `prn_${'a'.repeat(32)}`
    readHistory.mockResolvedValueOnce({
      kind: 'available',
      page: {
        items: [{
          eventRef: 'audit:agent:rename-safe',
          eventType: 'agent.renamed',
          actorKind: 'owner',
          actorRef: `prn_${'b'.repeat(32)}`,
          targetType: 'agent',
          targetRef: principalRef,
          outcome: 'renamed',
          sourceSystem: 'ae_recorded',
          recordedAt: 1_700_000_060_000,
          correlationRef: 'agent:rename-safe',
        }],
        continueCursor: '',
        isDone: true,
      },
    })

    render(<AeAgentSecurityHistory principalRef={principalRef} />)

    expect(await screen.findByText('Agent renamed')).toBeTruthy()
    expect(screen.getByText('AE recorded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {
      name: 'View details for security event audit:agent:rename-safe',
    }))
    const drawer = screen.getByRole('dialog', { name: 'Security event' })
    expect(within(drawer).getByText('Correlation reference')).toBeTruthy()
    expect(within(drawer).getByText('agent:rename-safe')).toBeTruthy()
    expect(within(drawer).queryByText(/Actor ·/u)).toBeNull()
    expect(within(drawer).queryByText(/Target ·/u)).toBeNull()
    expect(readHistory).toHaveBeenCalledWith({ data: { principalRef } })
    expect(document.body.textContent).not.toContain(principalRef)
    expect(document.body.textContent).not.toContain(`prn_${'b'.repeat(32)}`)
  })

  it('keeps known Agent events when loading older evidence fails', async () => {
    const principalRef = `prn_${'c'.repeat(32)}`
    readHistory
      .mockResolvedValueOnce(available(false))
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })

    render(<AeAgentSecurityHistory principalRef={principalRef} />)

    expect(await screen.findByText('Session revoked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry older events' })).toBeTruthy())
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(screen.getByText(/Older security events could not be loaded\./u)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — known security history remains visible\./u)).toBeTruthy()
    expect(screen.getByText(/Check your connection and retry older events\./u)).toBeTruthy()
  })

  it('ignores an old Agent read after the selected identity changes', async () => {
    const firstPrincipalRef = `prn_${'d'.repeat(32)}`
    const nextPrincipalRef = `prn_${'e'.repeat(32)}`
    let resolveFirst: ((result: AccountSecurityHistoryResult) => void) | undefined
    const firstRead = new Promise<AccountSecurityHistoryResult>((resolve) => {
      resolveFirst = resolve
    })
    const next = available()
    readHistory.mockImplementation(({ data }: { data: { principalRef: string } }) => data.principalRef === firstPrincipalRef
      ? firstRead
      : Promise.resolve({
          kind: 'available' as const,
          page: {
            ...next.page,
            items: [{
              ...next.page.items[0]!,
              eventRef: 'audit:agent:new-selection',
              eventType: 'account.session.ended' as const,
              correlationRef: 'agent:new-selection',
            }],
          },
        }))

    const { rerender } = render(<AeAgentSecurityHistory principalRef={firstPrincipalRef} />)
    rerender(<AeAgentSecurityHistory principalRef={nextPrincipalRef} />)
    expect(await screen.findByText('Session ended')).toBeTruthy()

    await act(async () => {
      resolveFirst?.(available())
      await firstRead
    })
    expect(screen.queryByText('Session revoked')).toBeNull()
    expect(readHistory).toHaveBeenCalledWith({ data: { principalRef: nextPrincipalRef } })
  })
})

function available(isDone = true): Extract<AccountSecurityHistoryResult, { kind: 'available' }> {
  return {
    kind: 'available',
    page: {
      items: [{
        eventRef: 'audit:clerk:delivery-hash',
        eventType: 'account.session.revoked',
        actorKind: 'owner',
        actorRef: 'prn_0123456789abcdef0123456789abcdef',
        targetType: 'session',
        targetRef: 'clerk-session:target-hash',
        outcome: 'revoked',
        sourceSystem: 'clerk_observed',
        observedAt: 1_700_000_000_000,
        recordedAt: 1_700_000_060_000,
        correlationRef: 'clerk:delivery-hash',
      }],
      continueCursor: isDone ? '' : 'cursor-1',
      isDone,
    },
  }
}
