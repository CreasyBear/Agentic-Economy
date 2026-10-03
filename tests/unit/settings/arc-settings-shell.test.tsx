/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsShell } from '@/components/ae/settings/settings-shell/SettingsShell'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, activeOptions: _activeOptions, ...props }: { to: string; activeOptions?: unknown; children: ReactNode }) => <a href={to} {...props} />,
}))
afterEach(cleanup)

describe('Arc settings shell', () => {
  it('makes the overview useful at every width with the full grouped settings destination list', () => {
    render(<SettingsShell pathname="/owner/settings"><p>Nested placeholder</p></SettingsShell>)
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const [name, href] of [
      ['Profile & security', '/owner/settings/account'],
      ['Business profile', '/owner/settings/workspace'],
      ['Receipts', '/owner/settings/receipts'],
      ['Agent keys', '/owner/settings/agent-keys'],
    ] as const) {
      expect(screen.getAllByRole('link', { name }).every(link => link.getAttribute('href') === href)).toBe(true)
    }
    expect(screen.queryByText('Nested placeholder')).toBeNull()
  })

  it.each(['/owner/settings/receipts', '/owner/settings/receipts/'])('focuses the actual receipt heading after %s commits', async pathname => {
    render(<SettingsShell pathname={pathname}><h2>Receipts &amp; invoices</h2></SettingsShell>)
    const heading = screen.getByRole('heading', { level: 2, name: 'Receipts & invoices' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Receipts' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute('href', '/owner/settings')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
