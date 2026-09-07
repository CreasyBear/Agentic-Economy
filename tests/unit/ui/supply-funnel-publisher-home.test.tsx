import { describe, expect, it } from 'vitest'

import { projectProviderWorkspace } from '@/components/ae/offerings/provider-workspace-projection'
import type { ProviderWorkspaceInventoryResult, ProviderWorkspaceLifecycleRow } from '@/components/ae/offerings/provider-workspace.functions'
import type { ProviderToolStatus } from '@/modules/capability-supply/provider-tool-status'

const inventory = {
  kind: 'available',
  provider: { name: 'Provider' },
  projection: 'current',
  isDone: true,
  continueCursor: '',
  tools: [{ offeringRef: 'offering:one', currentRevision: 2, name: 'One', category: 'tools', summary: 'Does one thing', status: 'published', accessPathCount: 1 }],
} as const satisfies ProviderWorkspaceInventoryResult

function operationStatus(patch: Partial<ProviderToolStatus> = {}): ProviderToolStatus {
  return {
    schemaVersion: 'provider_tools:v1',
    businessRef: 'business:one',
    providerRef: 'provider:one',
    toolRef: 'operation:one',
    revision: 2,
    state: 'Published',
    reasonCodes: [],
    observedAt: 1_000,
    source: { kind: 'openapi' },
    routeability: { available: true, reasonCodes: [] },
    authority: { kind: 'public' },
    health: {
      connection: 'not_required',
      validation: 'passed',
      publication: 'published',
      freshness: 'current',
      delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
      usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
      operationalConditions: [],
    },
    ...patch,
  }
}

function lifecycle(status = operationStatus()): ProviderWorkspaceLifecycleRow {
  return { offeringRef: 'offering:one', status }
}

describe('canonical Provider Tool directory projection', () => {
  it.each([
    ['Draft', false],
    ['Needs setup', false],
    ['Submitted', false],
    ['Under review', false],
    ['Published', true],
    ['Paused', false],
    ['Action required', false],
    ['Retired', false],
  ] as const)('renders the canonical %s state without a parallel lifecycle', (state, available) => {
    const result = projectProviderWorkspace(inventory, {
      kind: 'available',
      value: [lifecycle(operationStatus({ state, routeability: { available, reasonCodes: [] } }))],
    })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') {
      expect(result.rows[0]).toMatchObject({ lifecycleLabel: state, availability: available ? 'available' : 'unavailable' })
    }
  })

  it('uses the shared reason copy and hosted owner handoff', () => {
    const status = operationStatus({
      state: 'Action required',
      reasonCodes: ['credential_lost'],
      routeability: { available: false, reasonCodes: ['credential_lost'] },
      ownerHandoff: {
        action: 'supply.connection.reconnect',
        blockedCapabilities: ['supply.publish'],
        cta: '/owner/supply/connections',
        ctaLabel: 'Reconnect source',
        description: 'Reconnect the source.',
        iconUrl: null,
        status: 'required',
        title: 'Reconnect source',
      },
    })
    const result = projectProviderWorkspace(inventory, { kind: 'available', value: [lifecycle(status)] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') {
      expect(result.rows[0]).toMatchObject({
        lifecycleLabel: 'Action required',
        blocker: 'The source connection is no longer available. Reconnect it before publication can continue.',
        continuation: { label: 'Reconnect source', href: '/owner/supply/connections' },
      })
    }
  })

  it('fails safely for missing, stale or duplicate canonical rows', () => {
    const missing = projectProviderWorkspace(inventory, { kind: 'unavailable' })
    expect(missing.kind === 'available' ? missing.rows[0] : missing).toMatchObject({ lifecycleLabel: 'Status unavailable', availability: 'unknown' })

    const stale = projectProviderWorkspace(inventory, {
      kind: 'available',
      value: [lifecycle(operationStatus({ revision: 1 }))],
    })
    expect(stale.kind === 'available' ? stale.rows[0] : stale).toMatchObject({ lifecycleLabel: 'Updating', lifecyclePending: true })

    expect(projectProviderWorkspace({ ...inventory, tools: [...inventory.tools, ...inventory.tools] }, { kind: 'available', value: [] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_definition' })
    expect(projectProviderWorkspace(inventory, { kind: 'available', value: [lifecycle(), lifecycle()] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_supply' })
  })
})
