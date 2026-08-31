/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Link: React.forwardRef(function MockLink(
      {
        activeOptions: _activeOptions,
        children,
        to,
        className,
        ...props
      }: {
        activeOptions?: { exact?: boolean }
        children: ReactNode
        to: string
        className?: string
      },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return (
        <a ref={ref} href={to} className={className} {...props}>
          {children}
        </a>
      )
    }),
  }
})

import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsNav'
import { AeWorkspaceDevelopers } from '@/components/ae/settings/AeWorkspaceDevelopers'
import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { AeWorkspaceMembers } from '@/components/ae/settings/AeWorkspaceMembers'
import { buildPublicOwnerStatusReadback } from '@/modules/catalog/public'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const CALLER_PRINCIPAL_ID = `prn_${'1'.repeat(32)}`
const CALLER_KEY_CANARY = 'key_secret_canary_do_not_render'

const catalog: PublicBusinessCatalogApiV2Dto = {
  schemaVersion: 'public-business-catalog-api:v2',
  businessId: 'biz_workspace_1',
  slug: 'quote-works',
  name: 'Quote Works',
  category: 'Quotes',
  businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
  publicUrl: '/quote-works',
  trustTier: 'claimed',
  photos: [],
  observedAt: 0,
  disposition: 'current',
  offerings: [],
  accessSummary: { humanRequest: false, externalOperation: true, aeSupportedAction: true },
}

const caller: AgentOperatorKeyReadback = {
  key: {
    keyId: CALLER_KEY_CANARY,
    name: 'UI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: CALLER_PRINCIPAL_ID,
    credentialId: CALLER_KEY_CANARY,
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
  principalId: CALLER_PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}

const tabOffsets = new Map([
  ['Profile', 0],
  ['General', 76],
  ['Members', 150],
  ['Connections', 230],
  ['Credit', 344],
  ['Payouts', 410],
  ['Keys & APIs', 494],
])

let tabRowWidth = 390
let resizeCurrentTabRow: (() => void) | undefined

beforeEach(() => {
  tabRowWidth = 390
  resizeCurrentTabRow = undefined

  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return tabOffsets.get(this.textContent ?? '') ?? 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.textContent === 'Connections' ? 110 : this.textContent === 'Keys & APIs' ? 100 : 72
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === 'tabs-list' ? tabRowWidth : 0
  })

  vi.stubGlobal(
    'ResizeObserver',
    class MockResizeObserver {
      constructor(callback: () => void) {
        resizeCurrentTabRow = callback
      }

      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('owner workspace settings surfaces', () => {
  it('groups settings destinations without CRM objects', () => {
    render(<OwnerSettingsNav current="workspace" />)

    const nav = screen.getByRole('navigation', { name: 'Settings' })
    expect(nav.textContent).toMatch(/User/)
    expect(nav.textContent).toMatch(/Workspace/)
    expect(nav.textContent).toMatch(/Developers/)
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('href')).toBe('/owner/settings/workspace')
    expect(screen.getByRole('tab', { name: 'Members' }).getAttribute('href')).toBe('/owner/settings/members')
    expect(screen.getByRole('tab', { name: 'Connections' }).getAttribute('href')).toBe('/owner/settings/connections')
    expect(screen.getByRole('tab', { name: 'Payouts' }).getAttribute('href')).toBe('/owner/settings/payouts')
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-current')).toBe('page')
    expect(nav.textContent).not.toMatch(/People|Companies|Opportunities/i)
  })

  it('reveals a directly loaded late tab inside the local row without widening the document', () => {
    render(<OwnerSettingsNav current="developers" />)

    const nav = screen.getByRole('navigation', { name: 'Settings' })
    const row = nav.querySelector<HTMLElement>('[data-slot="tabs-list"]')
    const currentTab = screen.getByRole('tab', { name: 'Keys & APIs' })

    expect(row).not.toBeNull()
    expect(row?.scrollLeft).toBe(204)
    expect(currentTab.getAttribute('aria-current')).toBe('page')
    expect(currentTab.offsetLeft).toBeGreaterThanOrEqual(row?.scrollLeft ?? 0)
    expect(currentTab.offsetLeft + currentTab.offsetWidth).toBeLessThanOrEqual(
      (row?.scrollLeft ?? 0) + (row?.clientWidth ?? 0),
    )
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(screen.getByRole('tab', { name: 'Connections' }).getAttribute('href')).toBe('/owner/settings/connections')
    expect(nav.className).toMatch(/min-w-0.*max-w-full.*overflow-hidden/)
    expect(row?.className).toMatch(/min-w-0.*max-w-full.*overflow-x-auto.*overflow-y-hidden/)
    expect(document.documentElement.scrollLeft).toBe(0)
    expect(document.body.scrollLeft).toBe(0)
  })

  it('reveals the current tab after navigation and a narrower resize', () => {
    const { rerender } = render(<OwnerSettingsNav current="workspace" />)
    const row = screen
      .getByRole('navigation', { name: 'Settings' })
      .querySelector<HTMLElement>('[data-slot="tabs-list"]')

    expect(row?.scrollLeft).toBe(0)

    rerender(<OwnerSettingsNav current="developers" />)
    expect(row?.scrollLeft).toBe(204)

    tabRowWidth = 280
    resizeCurrentTabRow?.()

    expect(row?.scrollLeft).toBe(314)
    expect(screen.getByRole('tab', { name: 'Keys & APIs' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows supplier identity from the current catalog read', () => {
    render(
      <AeWorkspaceGeneral
        result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Supplier identity' })).toBeTruthy()
    expect(screen.getByText('Quote Works')).toBeTruthy()
    expect(screen.getByText('/quote-works')).toBeTruthy()
    expect(screen.getByText('biz_workspace_1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Supplier listing/ }).getAttribute('href')).toBe('/owner/status')
  })

  it('saves a changed public supplier name explicitly and reports success', async () => {
    let resolveRename: ((value: { kind: 'updated'; businessId: string; slug: string; name: string }) => void) | undefined
    const onRename = vi.fn(() => new Promise<{ kind: 'updated'; businessId: string; slug: string; name: string }>((resolve) => {
      resolveRename = resolve
    }))
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)

    const input = screen.getByRole('textbox', { name: 'Public supplier name' })
    const save = screen.getByRole('button', { name: 'Save public name' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'Quote Works API' } })
    expect((save as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(save)
    expect((screen.getByRole('button', { name: 'Saving public name…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ businessId: catalog.businessId, name: 'Quote Works API' }))
    resolveRename?.({ kind: 'updated', businessId: catalog.businessId, slug: catalog.slug, name: 'Quote Works API' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Public name saved'))
  })

  it('blocks empty and unchanged names and keeps a refusal visible', async () => {
    const onRename = vi.fn(async (_input: { businessId: string; name: string; requestKey: string }) => (
      { kind: 'refused' as const, code: 'source_unavailable' as const }
    ))
    render(<AeWorkspaceGeneral result={{ kind: 'available', readback: buildPublicOwnerStatusReadback(catalog) }} onRename={onRename} />)
    const input = screen.getByRole('textbox', { name: 'Public supplier name' })
    const save = screen.getByRole('button', { name: 'Save public name' })
    fireEvent.change(input, { target: { value: '   ' } })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Enter a public supplier name from 1 to 160 characters.')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'New public name' } })
    fireEvent.click(save)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('existing public name is unchanged'))
    const firstRequestKey = onRename.mock.calls[0]?.[0].requestKey
    fireEvent.change(input, { target: { value: 'Another public name' } })
    fireEvent.click(save)
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2))
    expect(onRename.mock.calls[1]?.[0].requestKey).not.toBe(firstRequestKey)
  })

  it('sends an unpublished workspace to supplier setup', () => {
    render(<AeWorkspaceGeneral result={{ kind: 'not_found', reason: 'no_such_business' }} />)

    expect(screen.getByRole('heading', { name: 'No supplier identity yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review supplier setup' }).getAttribute('href')).toBe('/for-providers')
  })

  it('lists the signed-in owner and agent callers without inventing a team roster', () => {
    render(<AeWorkspaceMembers items={[caller]} />)

    expect(screen.getByRole('heading', { name: 'Human operators' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Owner/ }).getAttribute('href')).toBe('/owner/settings')
    const callerLink = screen.getByRole('link', { name: /UI assistant/ })
    expect(callerLink.getAttribute('href')).toBe(`/agent-access?caller=${CALLER_PRINCIPAL_ID}`)
    expect(callerLink.textContent).toContain(CALLER_PRINCIPAL_ID)
    expect(document.body.textContent).not.toContain(CALLER_KEY_CANARY)
    expect(screen.getByRole('link', { name: 'Manage on Keys' }).getAttribute('href')).toBe('/agent-access')
    expect(screen.queryByText(/Invite/i)).toBeNull()
  })

  it('keeps the Keys empty copy when no agent caller exists', () => {
    render(<AeWorkspaceMembers items={[]} />)

    expect(screen.getByRole('heading', { name: 'No agent is connected yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Keys' }).getAttribute('href')).toBe('/agent-access')
  })

  it('keeps Keys & APIs on real machine-file destinations', () => {
    render(<AeWorkspaceDevelopers />)

    expect(screen.getByRole('link', { name: /Keys/ }).getAttribute('href')).toBe('/agent-access')
    expect(screen.getByRole('link', { name: /llms\.txt/ }).getAttribute('href')).toBe('/llms.txt')
    expect(screen.getByRole('link', { name: /SKILL\.md/ }).getAttribute('href')).toBe('/SKILL.md')
  })
})
