/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const convexMocks = vi.hoisted(() => ({
  readQuery: vi.fn(),
  updatePreferences: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useQuery: convexMocks.readQuery,
  useMutation: () => convexMocks.updatePreferences,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ae/website', () => ({
  AeSiteBody: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AeSiteAuthSubmit: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('@/components/ae/settings/AeCompromiseRecoveryChecklist', () => ({
  AeCompromiseRecoveryChecklist: () => (
    <details id="compromise-recovery">
      <summary>If you suspect compromise</summary>
    </details>
  ),
}))

vi.mock('@/components/ae/settings/AeAccountSecurityHistory', () => ({
  AeAccountSecurityHistory: () => (
    <section id="security-history" aria-labelledby="security-heading">
      <h2 id="security-heading">Security history</h2>
      <input aria-label="Filter security history" />
    </section>
  ),
}))

vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({
    secondaryBar,
    children,
  }: {
    title: string
    secondaryBar?: ReactNode
    stickyHeader?: boolean
    children: ReactNode
  }) => (
    <main>
      {secondaryBar}
      {children}
    </main>
  ),
}))

import { AccountSettingsSection } from '@/components/ae/settings/OwnerSettingsSections'
import { OwnerSettingsShell } from '@/components/ae/settings/OwnerSettingsShell'

const history = { kind: 'unavailable', reason: 'source_unavailable' } as const
const savedPreferences = {
  principalRef: 'principal:test',
  accountRef: 'account:test',
  lowCreditBalance: false,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  revision: 4,
  updatedAt: 1,
  isVirtualDefault: false,
} as const
const missingTaxFacts = {
  kind: 'missing',
  accountRef: 'account:test',
  revision: 0,
} as const

function mockSettingsQueries() {
  convexMocks.readQuery.mockImplementation((reference: unknown) => {
    if (reference !== null && typeof reference === 'object') {
      const functionName = Object.getOwnPropertySymbols(reference)
        .map((symbol) => Reflect.get(reference, symbol))
        .find((value): value is string => typeof value === 'string')
      if (functionName === 'moneyCustomerTaxFacts:readCustomerTaxFacts') return missingTaxFacts
    }
    return savedPreferences
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('/owner/settings R-17', () => {
  it('renders one settings tab for every section and shows Profile first', () => {
    mockSettingsQueries()
    render(
      <OwnerSettingsShell>
        <AccountSettingsSection history={history} />
      </OwnerSettingsShell>,
    )

    const tabs = screen.getByRole('tablist', { name: 'Account settings sections' })
    expect(tabs.closest('[data-slot="tabs"]')?.getAttribute('data-orientation')).toBe('horizontal')
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Profile',
      'Recovery',
      'Security history',
      'Team',
      'Workspace',
      'Business',
      'Privacy',
      'Email alerts',
    ])
    expect(within(tabs).getByRole('tab', { name: 'Profile' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Update profile/ }).getAttribute('href')).toBe('/owner/settings/account')
    expect(screen.queryByTestId('user-profile')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Business' })).toBeNull()
  })

  it('shows one settings section at a time and links Team to its page', () => {
    mockSettingsQueries()
    render(<AccountSettingsSection history={history} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'ABN' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Business' }))
    expect(screen.getByRole('textbox', { name: 'ABN' })).toBeTruthy()
    expect(screen.getByText('ABN and GST facts used on your tax invoices.')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Profile' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    expect(screen.getByRole('link', { name: /Manage Team/ }).getAttribute('href')).toBe('/owner/team')

    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }))
    expect(screen.getByRole('link', { name: /Workspace profile/ }).getAttribute('href')).toBe('/owner/workspace')

    fireEvent.click(screen.getByRole('tab', { name: 'Privacy' }))
    expect(screen.getByText('Download a copy of the data Agentic Economy holds for this Account.')).toBeTruthy()
    const exportLink = screen.getByRole('link', { name: 'Download your data (JSON)' })
    expect(exportLink.getAttribute('href')).toBe('/api/owner/data-export')
    expect(exportLink.hasAttribute('download')).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Email alerts' }))
    expect(screen.getByText(/Saved for this Account\./)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Security history' }))
    expect(screen.getByRole('textbox', { name: 'Filter security history' })).toBeTruthy()
    expect(screen.queryByText('Session', { exact: true })).toBeNull()
  })

  it('reads saved notification choices and writes changes through the persistent mutation', async () => {
    mockSettingsQueries()
    convexMocks.updatePreferences.mockResolvedValue({ kind: 'updated', revision: 5 })
    render(<AccountSettingsSection history={history} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Email alerts' }))

    const lowCredit = screen.getByRole('switch', { name: 'Email when credit balance is low' })
    expect(lowCredit.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(lowCredit)

    await waitFor(() => {
      expect(convexMocks.updatePreferences).toHaveBeenCalledWith(expect.objectContaining({
        lowCreditBalance: true,
        expectedRevision: 4,
        correlationRef: expect.stringMatching(/^ui:notification-preferences:/),
        idempotencyRef: expect.stringMatching(/^idem:notification-preferences:/),
      }))
    })
  })
})
