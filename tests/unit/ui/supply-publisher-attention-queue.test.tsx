/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'

import { supplierContinuationForOffering } from '@/components/ae/supply/supplier-continuation'
import { offeringAt } from './supply-funnel-harness'

describe('supplier continuation', () => {
  it('uses a read-only destination while readiness is unresolved', () => {
    const offering = offeringAt('readiness')
    const result = supplierContinuationForOffering({
      ...offering,
      stepStates: { ...offering.stepStates, readiness: 'in_progress' },
    })
    expect(result).toMatchObject({ kind: 'navigate', label: 'View status' })
    expect(result.href).toContain('#readiness')
  })

  it('does not expose a provider connection reference in an Operations continuation', () => {
    const offering = offeringAt('readiness')
    const result = supplierContinuationForOffering({
      ...offering,
      actionableReason: 'authority_stale',
      authority: {
        kind: 'provider_connection',
        mode: 'provider_owned',
        connectionRef: 'connection:private-owner-reference',
        providerRef: 'provider:private-owner-reference',
      },
    })

    expect(result).toEqual({
      kind: 'navigate',
      label: 'Manage connections',
      href: '/owner/offerings#supplier-connections',
    })
    expect(JSON.stringify(result)).not.toMatch(/private-owner-reference|connection:/u)
  })

  it('keeps stale public authority on the retained preparation route', () => {
    const offering = offeringAt('readiness')
    const result = supplierContinuationForOffering({
      ...offering,
      actionableReason: 'authority_stale',
      authority: {
        kind: 'public_upstream',
        mode: 'provider_owned',
      },
    })

    expect(result).toEqual({
      kind: 'navigate',
      label: 'Re-admit provider authority',
      href: '/owner/supply/offering%3Aone#provider',
    })
  })
})
