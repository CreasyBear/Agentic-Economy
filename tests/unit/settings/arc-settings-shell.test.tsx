/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsShell } from '@/components/ae/settings/settings-shell/SettingsShell'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { SecuritySettings } from '@/components/arc/blocks/security-settings/security-settings'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, activeOptions: _activeOptions, ...props }: { to: string; activeOptions?: unknown; children: ReactNode }) => <a href={to} {...props} />,
}))
afterEach(cleanup)

describe('Arc settings shell', () => {
  it('leads with the actual settings form and keeps the destination directory closed', async () => {
    render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Your workspace identity"><p>Workspace name editor</p></SettingsPage></SettingsShell>)
    expect(screen.getAllByRole('heading', { level: 1 }).map(heading => heading.textContent)).toEqual(['Business profile'])
    expect(screen.getByText('Workspace name editor')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Privacy' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Business profile' })).toHaveFocus())
  })

  it('groups all native destinations by customer job, with privacy and security last', async () => {
    render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Your workspace identity">Form</SettingsPage></SettingsShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Settings section: Business profile' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map(item => [item.textContent, item.getAttribute('href')])).toEqual([
      ['Business profile', '/owner/settings/workspace'],
      ['Team & roles', '/owner/settings/team'],
      ['Agent keys', '/owner/settings/agent-keys'],
      ['Provider connections', '/owner/settings/integrations'],
      ['Spending defaults', '/owner/settings/spending'],
      ['Receipts & invoices', '/owner/settings/receipts'],
      ['Tax', '/owner/settings/tax'],
      ['Profile', '/owner/settings/account'],
      ['Notifications', '/owner/settings/notifications'],
      ['Privacy', '/owner/settings/privacy'],
      ['Sign-in security', '/owner/settings/account/security'],
      ['Security activity', '/owner/settings/security-activity'],
    ])
    expect(['Workspace', 'Agents & Tools', 'Spending, billing & tax', 'Account preferences', 'Privacy & security'].every(label => within(menu).getByText(label))).toBe(true)
    expect(within(menu).getByRole('menuitem', { name: 'Business profile' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).queryByRole('menuitem', { name: 'Overview' })).toBeNull()
  })

  it('supports keyboard navigation and returns focus to the section trigger on Escape', async () => {
    render(<SettingsShell pathname="/owner/settings/tax"><SettingsPage title="Tax" description="Billing identity">Form</SettingsPage></SettingsShell>)
    const trigger = screen.getByRole('button', { name: 'Settings section: Tax' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tax' })).toHaveFocus())
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(await screen.findByRole('menu')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'End' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Security activity' })).toHaveFocus())
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('does not steal focus from a section menu opened before route-heading focus settles', async () => {
    render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Your workspace identity">Form</SettingsPage></SettingsShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Settings section: Business profile' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    expect(menu.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('heading', { name: 'Business profile' })).not.toHaveFocus()
  })

  it.each(['/owner/settings/receipts', '/owner/settings/receipts/'])('focuses the single actual receipt heading after %s commits', async pathname => {
    render(<SettingsShell pathname={pathname}><SettingsPage title="Receipts & invoices" description="Account top-ups">Records</SettingsPage></SettingsShell>)
    const heading = screen.getByRole('heading', { level: 1, name: 'Receipts & invoices' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Back to settings' })).toBeNull()
  })

  it.each(['/owner/settings/account/security', '/owner/settings/account/security/mfa', '/owner/settings/account/security/'])('recognizes Clerk security deep links at %s', async pathname => {
    render(<SettingsShell pathname={pathname}><SecuritySettings content={<button type="button">Manage authentication</button>} /></SettingsShell>)
    expect(screen.getAllByRole('heading', { level: 1 }).map(heading => heading.textContent)).toEqual(['Security'])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Security' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Settings section: Sign-in security' }))
    expect(screen.getByRole('menuitem', { name: 'Sign-in security' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('menuitem', { name: 'Profile' })).not.toHaveAttribute('aria-current')
  })

  it('keeps account subpages in Profile rather than misclassifying prefix collisions as Security', () => {
    render(<SettingsShell pathname="/owner/settings/account/security-preferences"><SettingsPage title="Profile" description="Account identity">Profile content</SettingsPage></SettingsShell>)
    expect(screen.getByRole('button', { name: 'Settings section: Profile' })).toBeVisible()
  })
})
