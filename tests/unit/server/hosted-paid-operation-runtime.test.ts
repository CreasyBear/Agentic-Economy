import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('hosted paid-operation authenticated runtime closure', () => {
  it('has one server composition root over token-owned Convex gateway functions', () => {
    const runtime = readFileSync('src/lib/server/hosted-paid-operation-runtime.ts', 'utf8')
    const gateway = readFileSync('convex/hostedPaidOperation.ts', 'utf8')
    expect(runtime).toContain('createHostedPaidOperationRuntime')
    expect(runtime).toContain('createHostedPaidOperationComposition')
    expect(runtime).toContain('createAuthenticatedConvexClient')
    expect(gateway).toContain('ctx.auth.getUserIdentity()')
    expect(gateway).toContain('identity.tokenIdentifier')
    expect(gateway).toContain('export const authenticatedLoadComplete = query({')
    expect(gateway).toContain('export const authenticatedCreateInitial = mutation({')
    expect(gateway).toContain('export const authenticatedTransact = mutation({')
  })

  it('mounts the five accepted paid-operation routes', () => {
    const tree = readFileSync('src/routeTree.gen.ts', 'utf8')
    for (const route of [
      '/actions/paid/new',
      '/actions/paid/$invocationRef',
      '/api/v1/paid-operations',
      '/api/v1/paid-operations/$invocationRef',
      '/api/v1/paid-operations/$invocationRef/commands',
    ]) expect(tree).toContain(route)
  })
})
