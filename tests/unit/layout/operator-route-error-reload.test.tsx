/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeStateMocks = vi.hoisted(() => ({
  parentShell: null as null | { nested: true },
  pathname: '/owner/settings/connections',
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: routeStateMocks.pathname }),
}))

vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({
    children,
    currentPath,
    title,
  }: {
    children: ReactNode
    currentPath: string
    title: string
  }) => (
    <section data-current-path={currentPath}>
      <h1>{title}</h1>
      {children}
    </section>
  ),
  useOperatorShellChrome: () => routeStateMocks.parentShell,
}))

import { OperatorRouteError } from '@/components/ae/layout/AeOperatorRouteStates'

afterEach(() => {
  cleanup()
  routeStateMocks.parentShell = null
  routeStateMocks.pathname = '/owner/settings/connections'
})

describe('OperatorRouteError reload recovery', () => {
  it('offers retry and system-status recovery without leaking error details', () => {
    render(<OperatorRouteError error={new Error('private upstream credential')} />)

    const alert = screen.getByRole('alert')
    const button = within(alert).getByRole('button', { name: 'Try again' })
    const statusLink = within(alert).getByRole('link', { name: 'Check system status' })

    expect(within(alert).getAllByRole('button')).toHaveLength(1)
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('min-h-touch')).toBe(true)
    expect(statusLink.getAttribute('href')).toBe('/status')
    expect(statusLink.classList.contains('min-h-touch')).toBe(true)
    expect(alert.textContent).not.toContain('private upstream credential')
    expect(alert.textContent).toContain('check system status before repeating an Operation call')
  })

  it('retains nested parent chrome with one Settings heading', () => {
    routeStateMocks.parentShell = { nested: true }

    render(
      <main>
        <h1>Settings</h1>
        <OperatorRouteError error={new Error('private nested failure')} />
      </main>,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('wires the button directly to reloading the exact current page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/ae/layout/AeOperatorRouteStates.tsx'),
      'utf8',
    )

    expect(source.match(/onClick=\{\(\) => window\.location\.reload\(\)\}/g)).toHaveLength(1)
  })
})
