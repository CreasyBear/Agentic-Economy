// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

const routerNavigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: routerNavigate }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const PRINCIPAL_ID = `prn_${'a'.repeat(32)}`
const FOREIGN_PRINCIPAL_ID = `prn_${'b'.repeat(32)}`
const KEY_ID_CANARY = 'key_private_canary_12345678'

const caller: AgentOperatorKeyReadback = {
  key: {
    keyId: KEY_ID_CANARY,
    name: 'Route assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: PRINCIPAL_ID,
    credentialId: KEY_ID_CANARY,
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentInvocations: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}

function consoleProps() {
  return {
    items: [caller],
    loading: false,
    onRevoke: vi.fn(),
    approvals: [],
    approvalsLoading: false,
    onRetryApprovals: vi.fn(),
    onDecideApproval: vi.fn(),
  } as const
}

afterEach(() => {
  cleanup()
  routerNavigate.mockReset()
})

describe('assistant access owner continuation anchors', () => {
  it('keeps funding on Credit and revocation on Keys', () => {
    const { container: credit } = render(
      <AeOwnerCredit items={[]} loading={false} />,
    )
    const { container: keys } = render(
      <AeAgentOperatorConsole
        items={[]}
        loading={false}
        onRevoke={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )

    expect(credit.querySelector('#fund')).not.toBeNull()
    expect(credit.querySelector('a[href="/market?window=30d"]')?.textContent).toBe('Search Operations')
    expect(keys.querySelector('#revoke')).not.toBeNull()
    expect(keys.querySelector('#fund')).toBeNull()
    expect(keys.querySelector('a[href="/for-agents"]')?.textContent).toBe('Connect agent')
  })

  it('confirms only the exact route-selected caller without exposing locator or key canaries', async () => {
    const onRevoke = vi.fn()
    const onClearSelectedPrincipal = vi.fn()
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onRevoke={onRevoke}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={onClearSelectedPrincipal}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Route assistant' })
    expect(dialog.textContent).toContain('•••• 12345678')
    expect(dialog.textContent).not.toContain(KEY_ID_CANARY)
    expect(dialog.textContent).not.toContain(PRINCIPAL_ID)
    expect(dialog.textContent).not.toMatch(/grant|credential/iu)

    const trigger = screen.getByRole('button', { name: 'Revoke access now' })
    fireEvent.click(trigger)
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Revoke access for Route assistant?',
    })
    expect(onRevoke).not.toHaveBeenCalled()
    expect(within(confirmation).getByText(
      'New calls from Route assistant will stop immediately. Reconnecting this agent requires fresh authorization.',
    )).toBeDefined()
    expect(confirmation.textContent).not.toContain(KEY_ID_CANARY)
    expect(confirmation.textContent).not.toContain(PRINCIPAL_ID)
    expect(confirmation.textContent).not.toMatch(/grant|credential/iu)
    const cancel = within(confirmation).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    fireEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onRevoke).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    await waitFor(() => expect(document.activeElement).toBe(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    ))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onRevoke).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    const closeButton = screen
      .getAllByRole('button', { name: 'Close' })
      .find((button) => button.textContent === 'Close')
    if (closeButton === undefined) throw new Error('sheet_close_button_missing')
    fireEvent.click(closeButton)
    expect(onClearSelectedPrincipal).toHaveBeenCalledOnce()
  })

  it('revokes once after confirmation and locks dismissal while the exact callback is pending', async () => {
    let resolveRevoke: (() => void) | undefined
    const onRevoke = vi.fn(() => new Promise<void>((resolve) => {
      resolveRevoke = resolve
    }))
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        onRevoke={onRevoke}
        selectedPrincipalId={PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Revoke access now' })
    fireEvent.click(trigger)
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Revoke agent access',
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(onRevoke).toHaveBeenCalledOnce())
    expect(onRevoke).toHaveBeenCalledWith(KEY_ID_CANARY)
    expect(onRevoke).not.toHaveBeenCalledWith(PRINCIPAL_ID)

    const pendingDialog = screen.getByRole('alertdialog')
    const working = within(pendingDialog).getByRole<HTMLButtonElement>('button', {
      name: 'Working…',
    })
    expect(working.disabled).toBe(true)
    fireEvent.click(working)
    fireEvent.click(within(pendingDialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeDefined()
    expect(onRevoke).toHaveBeenCalledOnce()

    const finishRevoke = resolveRevoke
    if (finishRevoke === undefined) throw new Error('revoke_not_started')
    finishRevoke()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onRevoke).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  })

  it('fails closed when the route locator does not match an owner-visible caller', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        selectedPrincipalId={FOREIGN_PRINCIPAL_ID}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.textContent).not.toContain(FOREIGN_PRINCIPAL_ID)
    expect(document.body.textContent).not.toContain(KEY_ID_CANARY)
  })

  it('uses one native link action for route-backed selection', () => {
    render(
      <AeAgentOperatorConsole
        {...consoleProps()}
        getAgentHref={(principalId) => `/agent-access?caller=${principalId}`}
        onClearSelectedPrincipal={() => undefined}
      />,
    )

    const row = screen.getByText('Route assistant').closest('tr')
    if (row === null) throw new Error('caller_row_missing')
    expect(row.getAttribute('tabindex')).toBeNull()
    const open = within(row).getByRole('link', { name: 'Open Route assistant' })
    expect(open.getAttribute('href')).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
