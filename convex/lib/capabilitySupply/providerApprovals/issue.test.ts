import { describe, expect, it } from 'vitest'

import type { MutationCtx } from '../../../_generated/server'
import { createProviderConnection } from '../../../../src/modules/capability-supply/provider-connection'
import { issueHandler } from './issue'

describe('provider approval persistence', () => {
  it('writes a valid decision once, replays its identity, and refuses a conflicting command', async () => {
    const created = createProviderConnection({
      commandId: 'command:create:approval',
      connectionRef: 'connection:approval',
      owningAccountRef: `acc_${'1'.repeat(32)}`,
      installedByPrincipalRef: `prn_${'2'.repeat(32)}`,
      authorityGrantRef: `grt_${'3'.repeat(32)}`,
      authorityGrantGeneration: 1,
      secretRef: `sec_${'6'.repeat(32)}`,
      businessId: 'business:approval',
      providerRef: 'provider:approval',
      providerAccountRef: 'account:approval',
      adapterId: 'http-json:v1',
      credentialRef: `sec_${'6'.repeat(32)}`,
      requestedScopes: ['orders:read'],
      grantedScopes: ['orders:read'],
      requestedResources: ['orders'],
      grantedResources: ['orders'],
      evidenceRefs: ['evidence:create'],
    }, 1_000)
    if (created.kind !== 'applied') throw new Error('provider_connection_fixture_invalid')

    const approvals: Array<Record<string, unknown>> = []
    const connection = created.connection
    const db = {
      query(table: string) {
        const filters: Array<[string, unknown]> = []
        const builder = {
          eq(field: string, value: unknown) { filters.push([field, value]); return builder },
        }
        const query = {
          withIndex(_index: string, apply: (index: typeof builder) => unknown) {
            apply(builder)
            return query
          },
          async unique() {
            const rows = table === 'capabilityProviderConnections' ? [connection] : approvals
            return rows.find(row => filters.every(([field, value]) => row[field] === value)) ?? null
          },
        }
        return query
      },
      async insert(_table: string, row: Record<string, unknown>) {
        approvals.push(row)
        return 'approval:1'
      },
    }
    const ctx = { db } as unknown as MutationCtx
    const args = {
      commandId: 'command:approval:one',
      decisionRef: 'decision:one',
      providerRef: connection.providerRef,
      providerAccountRef: connection.providerAccountRef,
      connectionRef: connection.connectionRef,
      authorityGeneration: connection.authorityGeneration,
      connectionAuthorityDigest: connection.authorityDigest,
      requestedScopes: ['orders:read'],
      grantedScopes: ['orders:read'],
      requestedResources: ['orders'],
      grantedResources: ['orders'],
      decision: 'granted' as const,
      decisionMakerAuthorityRef: 'mandate:one',
      reasonCode: 'provider_account_granted',
      evidenceRefs: ['evidence:approval'],
      now: 2_000,
    }
    const first = await issueHandler(ctx, args)
    expect(first).toMatchObject({ kind: 'applied', decision: { decisionRef: args.decisionRef } })
    expect(approvals).toHaveLength(1)
    expect(await issueHandler(ctx, { ...args, now: 3_000 }))
      .toMatchObject({ kind: 'duplicate', commandDigest: first.kind === 'applied' ? first.commandDigest : '' })
    expect(await issueHandler(ctx, { ...args, reasonCode: 'different' }))
      .toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(approvals).toHaveLength(1)
  })
})
