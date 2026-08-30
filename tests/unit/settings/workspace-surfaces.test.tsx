/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Link: React.forwardRef(function MockLink(
      { children, to, className, ...props }: { children: ReactNode; to: string; className?: string },
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
    keyId: 'key_ui_1',
    name: 'UI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: `prn_${'1'.repeat(32)}`,
    credentialId: 'key_ui_1',
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
  principalId: 'clerk_api_key:key_ui_1',
  activity: [],
  dataState: 'source',
}

afterEach(() => {
  cleanup()
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

  it('sends an unpublished workspace to supplier setup', () => {
    render(<AeWorkspaceGeneral result={{ kind: 'not_found', reason: 'no_such_business' }} />)

    expect(screen.getByRole('heading', { name: 'No supplier identity yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review supplier setup' }).getAttribute('href')).toBe('/for-providers')
  })

  it('lists the signed-in owner and agent callers without inventing a team roster', () => {
    render(<AeWorkspaceMembers items={[caller]} />)

    expect(screen.getByRole('heading', { name: 'Human operators' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Owner/ }).getAttribute('href')).toBe('/owner/settings')
    expect(screen.getByText(/UI assistant/)).toBeTruthy()
    expect(screen.getByText(/clerk_api_key:key_ui_1/)).toBeTruthy()
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
