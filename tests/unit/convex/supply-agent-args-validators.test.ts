/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

// Regression coverage for the correlationId/argument-shape mismatch between
// src/modules/capability-supply/supply-actions.ts (the caller, via
// sourceMutation + the shared `mutate` helper that always attaches
// `operationKey`, `correlationId`, `sourceWrite`, and `sourceWriteRequest`)
// and the Convex `args` validators these three functions declare.
// Handler-level unit tests (e.g. capability-call-supply-listing.test.ts)
// stub `ctx.db` directly and never go through Convex's real argument
// validation, so they cannot catch an ArgumentValidationError like this.
// These tests call the public mutations through `convex-test`, which runs
// the same validator the production backend enforces.
function agentPrincipal(overrides: Record<string, unknown> = {}) {
  return {
    principalId: 'prn_test_supply_args',
    ownerId: 'acc_test_supply_args',
    credentialId: 'crd_test_supply_args',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_supply:manage'],
    authorityMode: 'spending_policy' as const,
    ...overrides,
  }
}

describe('supply agent mutation argument validators', () => {
  it('accepts the exact args shape supply-actions.ts builds for readAgentProviderEarnings', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(backend.mutation(api.moneyLedger.readAgentProviderEarnings, {
      agentPrincipal: agentPrincipal(),
      currency: 'AUD',
      operationKey: 'sha256:test-operation-key',
      correlationId: 'test-correlation-id',
    })).resolves.toMatchObject({ kind: 'error', code: 'source_unavailable' })
  })

  it('accepts the exact args shape supply-actions.ts builds for capabilityProviderTools:listAgent', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId } = await publishedBusinessOwner(backend, 'supply-args-tools')
    await expect(backend.mutation(api.capabilityProviderTools.listAgent, {
      businessId,
      paginationOpts: { numItems: 20, cursor: null },
      agentPrincipal: agentPrincipal(),
      operationKey: 'sha256:test-operation-key',
      correlationId: 'test-correlation-id',
    })).resolves.toMatchObject({ kind: 'not_found' })
  })

  it('accepts the exact args shape supply-actions.ts builds for capabilityProviderConnectionAgents:list', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId } = await publishedBusinessOwner(backend, 'supply-args-connections')
    await expect(backend.mutation(api.capabilityProviderConnectionAgents.list, {
      businessId,
      limit: 20,
      agentPrincipal: agentPrincipal(),
      operationKey: 'sha256:test-operation-key',
      correlationId: 'test-correlation-id',
    })).resolves.toMatchObject({ kind: 'error', code: 'unauthenticated' })
  })
})
