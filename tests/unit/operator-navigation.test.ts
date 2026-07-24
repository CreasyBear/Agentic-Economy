import { describe, expect, it } from 'vitest'

import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  isOperatorSectionPathActive,
  listOperatorCommandDestinations,
  navGroupsForRole,
  operatorUtilityItemsForRole,
  resolveOperatorSection,
  sectionNavForSection,
} from '@/lib/operator/navigation'

describe('operator navigation', () => {
  it('groups owner nav with billing under account', () => {
    const groups = navGroupsForRole('owner')
    const labels = groups.flatMap((group) => group.items.map((item) => item.label))

    expect(labels).toContain('Billing')
    expect(labels).toContain('Inquiries')
  })

  it('groups admin monetization separately from review queues', () => {
    const groups = navGroupsForRole('admin')

    expect(groups.map((group) => group.id)).toEqual(['review', 'operations', 'monetization'])
  })

  it('resolves billing section for nested owner billing routes', () => {
    expect(resolveOperatorSection('/owner/billing')).toBe('billing')
    expect(resolveOperatorSection('/owner/billing/receipts/rcpt_1')).toBe('billing')
    expect(resolveOperatorSection('/owner/inquiries')).toBeUndefined()
  })

  it('marks nested paths active for primary nav roots', () => {
    expect(isOperatorPathActive('/owner/billing/receipts/rcpt_1', '/owner/billing')).toBe(true)
    expect(isOperatorPathActive('/owner/billing/activate', '/owner/billing')).toBe(true)
  })

  it('uses exact match for billing overview in section rail', () => {
    expect(isOperatorSectionPathActive('/owner/billing', '/owner/billing', 'billing')).toBe(true)
    expect(isOperatorSectionPathActive('/owner/billing/activate', '/owner/billing', 'billing')).toBe(false)
    expect(isOperatorSectionPathActive('/owner/billing/activate', '/owner/billing/activate', 'billing')).toBe(true)
  })

  it('exposes billing section rail items', () => {
    expect(sectionNavForSection('billing').map((item) => item.href)).toEqual([
      '/owner/billing',
      '/owner/billing/activate',
    ])
  })

  it('stage-gates advanced owner nav when advanced mode is off', () => {
    const labels = navGroupsForRole('owner', { advanced: false }).flatMap((group) =>
      group.items.map((item) => item.label),
    )
    expect(labels).toEqual(['Business page', 'Offerings', 'Inquiries', 'Settings'])
  })

  it('shows advanced owner destinations in command list regardless of sidebar gate', () => {
    const labels = listOperatorCommandDestinations('owner')
      .flatMap((group) => group.items.map((item) => item.label))
    expect(labels).toContain('Billing')
    expect(labels).toContain('Ask')
  })

  it('exposes public utility links for operator sidebar footers', () => {
    const utilityHrefs = operatorUtilityItemsForRole('owner').map((item) => item.href)

    expect(utilityHrefs).toEqual(['/', '/registry', '/help'])
  })

  it('formats operator nav badges without showing empty counts', () => {
    expect(formatOperatorNavBadge(undefined)).toBeUndefined()
    expect(formatOperatorNavBadge(0)).toBeUndefined()
    expect(formatOperatorNavBadge(7)).toBe('7')
    expect(formatOperatorNavBadge(142)).toBe('99+')
    expect(formatOperatorNavBadge('needs review')).toBe('needs review')
  })
})
