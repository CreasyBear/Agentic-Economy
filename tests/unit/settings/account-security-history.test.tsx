/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { AeAgentSecurityHistory } from '@/components/ae/agent-access/AeAgentSecurityHistory'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

afterEach(() => {
  cleanup()
  readHistory.mockReset()
})

describe('account security history', () => {
  it('keeps compromise recovery as independent source checks without claiming containment', () => {
    render(<AeCompromiseRecoveryChecklist />)

    expect(screen.getByRole('heading', { name: 'If you suspect compromise' })).toBeTruthy()
    expect(screen.getByText('This page does not mark the Account contained')).toBeTruthy()
    expect(screen.getByText(/Resetting MFA alone does not revoke existing sessions/u)).toBeTruthy()
    expect(screen.getAllByText('Review at source')).toHaveLength(5)
    expect(screen.getByRole('link', { name: /Review and revoke Clerk sessions/u }).getAttribute('href'))
      .toBe('#clerk-account-security')
    expect(screen.getByRole('link', { name: /Rotate or disconnect Agents/u }).getAttribute('href'))
      .toBe('/agent-access')
    expect(screen.getByRole('link', { name: /Provider connections/u }).getAttribute('href'))
      .toBe('/owner/offerings#provider-connections')
    expect(screen.getByRole('link', { name: /Review Provider payout authority/u }).getAttribute('href'))
      .toBe('/owner/offerings#earnings')
    expect(screen.getByRole('link', { name: /Retain evidence and contact support/u }).getAttribute('href'))
      .toBe('/support')
    expect(document.body.textContent).not.toContain('Contained')
  })

  it('shows source time separately from recorded time and exposes only durable references', () => {
    render(<AeAccountSecurityHistory initialResult={available()} />)

    expect(screen.getByRole('heading', { name: 'Security history' })).toBeTruthy()
    expect(screen.getByText('Session revoked')).toBeTruthy()
    expect(screen.getByText('Clerk observed')).toBeTruthy()
    expect(screen.getByText(/Recorded/u)).toBeTruthy()
    expect(screen.getByText('clerk:delivery-hash')).toBeTruthy()
    expect(document.body.textContent).not.toContain('owner@example.test')
    expect(document.body.textContent).not.toContain('192.0.2.1')
    expect(document.body.textContent).not.toContain('session_raw_1')
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

    expect(screen.getByRole('alert').textContent).toContain('No newer security state is being claimed')
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
    expect(screen.getByText(/Recorded/u)).toBeTruthy()
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
    expect(screen.getByText('agent:rename-safe')).toBeTruthy()
    expect(readHistory).toHaveBeenCalledWith({ data: { principalRef } })
    expect(document.body.textContent).not.toContain(principalRef)
    expect(document.body.textContent).not.toContain(`prn_${'b'.repeat(32)}`)
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
