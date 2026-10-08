/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsShell } from '@/components/ae/settings/settings-shell/SettingsShell'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { settingsNavigation } from '@/components/ae/settings/settings-shell/settings-shell.contracts'
import { SecuritySettings } from '@/components/ae/shared/arc-pro/security-settings/security-settings'
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, activeOptions: _activeOptions, ...props }: { to: string; activeOptions?: unknown; children: ReactNode }) => <a href={to} {...props} /> }))
afterEach(cleanup)

describe('REUI routed settings composition', () => {
  it('keeps one page heading and five horizontal groups with only the active sections', async () => {
    render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Workspace identity">Workspace name editor</SettingsPage></SettingsShell>)
    expect(screen.getAllByRole('heading', { level: 1 }).map(heading => heading.textContent)).toEqual(['Business profile'])
    expect(within(screen.getByRole('navigation', { name: 'Settings groups' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Workspace', 'Agents & Tools', 'Billing', 'Preferences', 'Security'])
    expect(within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Business profile', 'Team & roles'])
    expect(screen.queryByRole('link', { name: 'Tax' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Business profile' })).toHaveFocus())
  })

  it.each(settingsNavigation.flatMap(group => group.items.map(item => ({ group, item }))))('preserves native destinations and active grouping for $item.href', ({ group, item }) => {
    render(<SettingsShell pathname={item.href}><SettingsPage title={item.title ?? item.label} description="Settings">Form</SettingsPage></SettingsShell>)
    const groupLink = within(screen.getByRole('navigation', { name: 'Settings groups' })).getByRole('link', { name: group.shortLabel })
    expect(groupLink).toHaveAttribute('href', item.href)
    expect(groupLink).toHaveAttribute('aria-current', 'page')
    const sections = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(sections).getAllByRole('link')).toHaveLength(group.items.length)
    expect(within(sections).getByRole('link', { name: item.label })).toHaveAttribute('aria-current', 'page')
    for (const section of group.items) expect(within(sections).getByRole('link', { name: section.label })).toHaveAttribute('href', section.href)
  })

  it('focuses the new heading after navigation without losing the active child route', async () => {
    const view = render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Identity">Form</SettingsPage></SettingsShell>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Business profile' })).toHaveFocus())
    screen.getByRole('link', { name: 'Team & roles' }).focus()
    view.rerender(<SettingsShell pathname="/owner/settings/team"><SettingsPage title="Team & roles" description="People">Members</SettingsPage></SettingsShell>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Team & roles' })).toHaveFocus())
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('href', '/owner/settings/team')
  })

  it('does not steal focus from navigation used before heading focus settles', async () => {
    render(<SettingsShell pathname="/owner/settings/workspace"><SettingsPage title="Business profile" description="Identity">Form</SettingsPage></SettingsShell>)
    const link = screen.getByRole('link', { name: 'Billing' })
    link.focus()
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))) })
    expect(link).toHaveFocus()
  })

  it.each(['/owner/settings/account/security', '/owner/settings/account/security/mfa', '/owner/settings/account/security/'])('keeps Clerk security deep links in Security at %s', async pathname => {
    render(<SettingsShell pathname={pathname}><SecuritySettings content={<button type="button">Manage authentication</button>} /></SettingsShell>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Security' })).toHaveFocus())
    expect(screen.getByRole('link', { name: 'Sign-in security' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })
})
