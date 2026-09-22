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
  UserProfile: () => <div data-testid="user-profile" />,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ae/website', () => ({
  AeSiteAuthPanel: ({
    children,
    eyebrow,
    title,
  }: {
    children: ReactNode
    eyebrow?: string
    title: string
  }) => (
    <section aria-label={title}>
      {eyebrow ? <p>{eyebrow}</p> : null}
      {children}
    </section>
  ),
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
    title,
    secondaryBar,
    stickyHeader,
    children,
  }: {
    title: string
    secondaryBar?: ReactNode
    stickyHeader?: boolean
    children: ReactNode
  }) => (
    <main data-sticky-header={String(stickyHeader)}>
      <h1>{title}</h1>
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
  it('renders sticky in-page navigation to every settings section', () => {
    render(
      <OwnerSettingsShell>
        <div />
      </OwnerSettingsShell>,
    )

    const nav = screen.getByRole('navigation', { name: 'Account settings sections' })
    expect(nav.closest('main')?.getAttribute('data-sticky-header')).toBe('true')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(within(nav).getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('#clerk-account-security')
    expect(within(nav).getByRole('link', { name: 'Team' }).getAttribute('href')).toBe('#team')
    expect(within(nav).getByRole('link', { name: 'Business' }).getAttribute('href')).toBe('#business')
    expect(within(nav).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('#privacy')
    expect(within(nav).getByRole('link', { name: 'Email alerts' }).getAttribute('href')).toBe('#notifications')
    expect(within(nav).getByRole('link', { name: 'Security history' }).getAttribute('href')).toBe('#security-history')
  })

  it('keeps Profile and Team as separate labelled sections and links Team to its page', () => {
    mockSettingsQueries()
    render(<AccountSettingsSection history={history} />)

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual([
      'Profile',
      'Team',
      'Business',
      'Privacy',
      'Email alerts',
      'Security history',
    ])
    expect(screen.getByRole('textbox', { name: 'ABN' })).toBeTruthy()
    expect(screen.getByText('ABN and GST facts used on your tax invoices.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Manage Team/ }).getAttribute('href')).toBe('/owner/team')
    expect(screen.getByText('Download a copy of the data Agentic Economy holds for this Account.')).toBeTruthy()
    const exportLink = screen.getByRole('link', { name: 'Download your data (JSON)' })
    expect(exportLink.getAttribute('href')).toBe('/api/owner/data-export')
    expect(exportLink.hasAttribute('download')).toBe(true)
    expect(screen.getByText(/Saved for this Account\./)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Filter security history' })).toBeTruthy()
    expect(screen.queryByText('Session', { exact: true })).toBeNull()
  })

  it('reads saved notification choices and writes changes through the persistent mutation', async () => {
    mockSettingsQueries()
    convexMocks.updatePreferences.mockResolvedValue({ kind: 'updated', revision: 5 })
    render(<AccountSettingsSection history={history} />)

    const lowCredit = screen.getByRole('switch', { name: 'Low credit balance' })
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
