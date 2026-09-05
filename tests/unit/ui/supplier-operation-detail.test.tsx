/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { AeSupplierOperationDetail } from '@/components/ae/supply/AeSupplierOperationDetail'
import type { SupplierOperationStatus } from '@/modules/capability-supply/supplier-operation-status'

afterEach(cleanup)

const status = {
  schemaVersion: 'supplier_operations:v1',
  businessRef: 'business:one',
  providerRef: 'provider:one',
  operationRef: 'operation:one',
  revision: 3,
  state: 'Published',
  reasonCodes: [],
  observedAt: Date.UTC(2026, 7, 1),
  validUntil: Date.UTC(2026, 7, 2),
  source: { kind: 'openapi', revision: 'openapi:one', digest: `sha256:${'a'.repeat(64)}` },
  routeability: { available: true, reasonCodes: [] },
  authority: { kind: 'public' },
  health: {
    connection: 'not_required',
    validation: 'passed',
    publication: 'published',
    freshness: 'current',
    delivery: {
      kind: 'observed',
      deliveredCount: 8,
      notDeliveredCount: 1,
      unknownCount: 1,
      sampleSize: 10,
      lastObservedAt: Date.UTC(2026, 7, 1),
      windowStartAt: Date.UTC(2026, 6, 1),
      windowEndAt: Date.UTC(2026, 7, 1),
      provenance: 'canonical_call_receipts',
    },
    usefulOutcome: {
      kind: 'observed',
      qualifiedUseCount: 6,
      lastObservedAt: Date.UTC(2026, 7, 1),
      windowStartAt: Date.UTC(2026, 6, 1),
      windowEndAt: Date.UTC(2026, 7, 1),
      provenance: 'qualified_use_receipts',
    },
    operationalConditions: [],
  },
} as const satisfies SupplierOperationStatus

it('shows one factual Published status and the existing withdraw correction without manual admission ceremonies', async () => {
  const withdraw = vi.fn(async () => ({ kind: 'applied' as const, message: 'Operation withdrawn.' }))
  render(<AeSupplierOperationDetail name="Reference lookup" status={status} onWithdraw={withdraw} />)

  expect(screen.getByRole('heading', { name: 'Published' })).toBeTruthy()
  expect(screen.getByText('8 delivered · 1 not delivered · 1 unknown')).toBeTruthy()
  expect(screen.getByText('6 Qualified Uses')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Check readiness' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Run test/u })).toBeNull()
  expect(screen.queryByRole('button', { name: /Promote/u })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }))
  await waitFor(() => expect(withdraw).toHaveBeenCalledTimes(1))
})

it('renders the single source correction from the shared status contract', async () => {
  const recheck = vi.fn(async () => ({ kind: 'applied' as const, message: 'Source check scheduled.' }))
  render(<AeSupplierOperationDetail
    name="Reference lookup"
    status={{
      ...status,
      state: 'Action required',
      reasonCodes: ['source_drift'],
      routeability: { available: false, reasonCodes: ['source_drift'] },
      health: { ...status.health, freshness: 'failed', operationalConditions: ['source_drift'] },
      continuation: { action: 'supply.recheck' },
    }}
    onRecheck={recheck}
  />)

  expect(screen.getByText('Source changed')).toBeTruthy()
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Recheck source'])
  fireEvent.click(screen.getByRole('button', { name: 'Recheck source' }))
  await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1))
})

it('keeps a pending Provider review on status readback instead of starting another source check', () => {
  const refresh = vi.fn(async () => ({ kind: 'applied' as const, message: 'Status refreshed.' }))
  render(<AeSupplierOperationDetail
    name="Reference lookup"
    status={{
      ...status,
      state: 'Under review',
      reasonCodes: ['provider_authority_unverified', 'health_unobserved'],
      routeability: { available: false, reasonCodes: ['provider_authority_unverified', 'health_unobserved'] },
      health: { ...status.health, validation: 'in_progress', freshness: 'unobserved', operationalConditions: ['provider_authority_unverified', 'health_unobserved'] },
      continuation: { action: 'supply.status' },
    }}
    onRefresh={refresh}
    onRecheck={vi.fn()}
  />)

  expect(screen.getByText('Provider authority under review')).toBeTruthy()
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Refresh status'])
})

it('sends connection repair to the hosted owner handoff', () => {
  render(<AeSupplierOperationDetail
    name="Reference lookup"
    status={{
      ...status,
      state: 'Action required',
      reasonCodes: ['credential_lost'],
      routeability: { available: false, reasonCodes: ['credential_lost'] },
      health: { ...status.health, connection: 'action_required', operationalConditions: ['credential_lost'] },
      ownerHandoff: {
        action: 'supply.connection.reconnect',
        blockedCapabilities: ['supply.publish'],
        cta: '/owner/supply/connections',
        ctaLabel: 'Reconnect source',
        description: 'The source connection is unavailable. Reconnect it before continuing.',
        iconUrl: null,
        status: 'required',
        title: 'Reconnect source',
      },
    }}
  />)

  expect(screen.getByRole('link', { name: 'Reconnect source' }).getAttribute('href')).toBe('/owner/supply/connections')
  expect(screen.queryByRole('button')).toBeNull()
})
