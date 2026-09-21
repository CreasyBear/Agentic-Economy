/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const convexMocks = vi.hoisted(() => ({
  readPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useQuery: convexMocks.readPreferences,
  useMutation: () => convexMocks.updatePreferences,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  UserProfile: () => <div data-testid="user-profile" />,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ae/website', () => ({
  AeSiteAuthPanel: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
  AeSiteAuthSubmit: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('@/components/ae/settings/AeCompromiseRecoveryChecklist', () => ({
  AeCompromiseRecoveryChecklist: () => (
    <section id="compromise-recovery" aria-labelledby="recovery-heading">
      <h2 id="recovery-heading">If you suspect compromise</h2>
    </section>
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
    expect(within(nav).getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('#clerk-account-security')
    expect(within(nav).getByRole('link', { name: 'Team' }).getAttribute('href')).toBe('#team')
    expect(within(nav).getByRole('link', { name: 'Email alerts' }).getAttribute('href')).toBe('#notifications')
    expect(within(nav).getByRole('link', { name: 'Security history' }).getAttribute('href')).toBe('#security-history')
  })

  it('keeps Profile and Team as separate labelled sections and links Team to its page', () => {
    convexMocks.readPreferences.mockReturnValue(savedPreferences)
    render(<AccountSettingsSection history={history} />)

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Profile', 'Team', 'If you suspect compromise', 'Email alerts', 'Security history'])
    expect(screen.getByRole('link', { name: /Manage Team/ }).getAttribute('href')).toBe('/owner/team')
    expect(screen.getByText(/Saved for this Account\./)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Filter security history' })).toBeTruthy()
  })

  it('reads saved notification choices and writes changes through the persistent mutation', async () => {
    convexMocks.readPreferences.mockReturnValue(savedPreferences)
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
