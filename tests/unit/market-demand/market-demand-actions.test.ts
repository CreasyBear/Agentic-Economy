import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMarketDemandService,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import { registryOperationsSearchAction } from '@/modules/registry/operations.actions'

const principal = {
  principalId: 'prn_00000000000040008000000000000072',
  ownerId: 'acc_00000000000040008000000000000072',
  credentialId: 'credential:market-demand',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'inspect_only' as const,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('market demand action contract', () => {
  it('refuses to store demand when a current canonical Operation already matches', async () => {
    vi.spyOn(registryOperationsSearchAction, 'run').mockResolvedValue({ kind: 'ok' } as never)
    const service = createMarketDemandService(
      new Request('https://ae.example/api/v1/market-requests', { method: 'POST', body: '{}' }),
      '{}',
    )

    await expect(service.create({
      input: { query: 'current job', idempotencyKey: 'one' },
      principal,
      correlationId: 'correlation:one',
    })).resolves.toEqual({ kind: 'refused', code: 'current_match_exists' })
  })

  it('keeps create, list, and status on the same private credential-owned surface contract', () => {
    for (const action of [marketRequestCreateAction, marketRequestListAction, marketRequestStatusAction]) {
      expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
      expect(action.credentialAdmission?.scope).toBe('market_operations:invoke')
      expect(action.boundaries.join(' ')).toMatch(/exact|private|credential/iu)
    }
    expect(marketRequestCreateAction.readOnly).toBe(false)
    expect(marketRequestListAction.readOnly).toBe(true)
    expect(marketRequestStatusAction.readOnly).toBe(true)
  })
})
