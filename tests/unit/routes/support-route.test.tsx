/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({ component: undefined as ComponentType | undefined }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.component = options.component
    return { ...options, options }
  },
  Link: ({
    children,
    to,
    className,
    search,
    hash,
  }: {
    children: ReactNode
    to: string
    className?: string
    search?: Readonly<Record<string, string>>
    hash?: string
  }) => {
    const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
    const fragment = hash === undefined ? '' : `#${hash}`
    return <a href={`${to}${query}${fragment}`} className={className}>{children}</a>
  },
}))

vi.mock('@/components/ae/layout/AePublicPage', () => ({
  AePublicPage: ({ actions, children, title }: { actions: ReactNode; children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

import '@/routes/support'

afterEach(cleanup)

describe('/support', () => {
  it('maps each visible failure message to one safe immediate action', () => {
    renderRoute()

    const troubleshooting = screen.getByRole('region', { name: 'Match the message you saw' })
    const symptomList = within(troubleshooting).getByRole('list')
    expect(within(symptomList).getAllByRole('listitem')).toHaveLength(4)

    expect(within(troubleshooting).getByText('No matching credential is selected')).toBeTruthy()
    expect(within(troubleshooting).getByText('Buyer balance is empty / Call declined for insufficient credit')).toBeTruthy()
    expect(within(troubleshooting).getByText('Operation is not currently callable')).toBeTruthy()
    expect(within(troubleshooting).getByText('Payment being verified / Reconciliation required')).toBeTruthy()

    const codes = Array.from(troubleshooting.querySelectorAll('code'), (code) => code.textContent)
    expect(codes).toEqual(['ae connect --base-url "$ORIGIN"'])
    expect(within(troubleshooting).getByRole('link', { name: 'Add credit' }).getAttribute('href')).toBe('/owner/credit#fund')
    expect(within(troubleshooting).getByRole('link', { name: 'Choose another Operation' }).getAttribute('href')).toBe('/market?window=30d#operations')
    expect(within(troubleshooting).getByRole('link', { name: 'Open Activity' }).getAttribute('href')).toBe('/activity')

    expect(within(troubleshooting).getByText('Choose another current Operation. Retrying will not restore supplier readiness.')).toBeTruthy()
    expect(within(troubleshooting).getByText('Inspect the exact receipt in Activity. Do not retry the call.')).toBeTruthy()
    expect(troubleshooting.textContent).not.toContain('Retry the call.')
    expect(troubleshooting.textContent).not.toContain('Try again')
  })

  it('preserves all setup and issue escalation paths', () => {
    renderRoute()

    expect(screen.getByRole('link', { name: /Report a problem/ }).getAttribute('href')).toBe(
      'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose',
    )
    expect(screen.getByRole('link', { name: /Open issue form/ }).getAttribute('href')).toBe(
      'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose',
    )
    expect(screen.getByRole('link', { name: 'Review agent setup' }).getAttribute('href')).toBe('/for-agents')
    expect(screen.getByRole('link', { name: 'Continue supplier setup' }).getAttribute('href')).toBe('/owner/supply')
    expect(screen.getByRole('link', { name: 'Review supplier requirements' }).getAttribute('href')).toBe('/for-providers')
    expect(screen.getByRole('link', { name: 'Request a listing correction' }).getAttribute('href')).toBe('/privacy/remove-business')
    expect(screen.getByText(/Never include keys, wallet material, raw inputs, or private results/)).toBeTruthy()
  })
})

function renderRoute() {
  const Component = routeState.component
  if (Component === undefined) throw new Error('Support route component was not captured.')
  render(<Component />)
}
