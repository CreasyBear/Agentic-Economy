import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceAction: vi.fn((name: string) => ({ name })),
  previewOwnerMcpProviderConnection: vi.fn(),
  previewSupplySource: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callSourceQuery: mocks.callSourceQuery,
  callSourceMutation: vi.fn(),
  sourceQuery: mocks.sourceQuery,
  sourceMutation: mocks.sourceMutation,
  sourceAction: mocks.sourceAction,
}))
vi.mock('@/lib/server/clerk-consequence-proof', () => ({
  requireStrictClerkConsequenceProof: vi.fn(),
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: vi.fn(),
}))
vi.mock('@/modules/security/source-write-admission', () => ({
  sourceWriteRequestFromAdmission: vi.fn(),
}))
vi.mock('@/modules/capability-supply/internal/supply-funnel/provider-connection-handoff', () => ({
  loadOwnerConnectedOpenApi: vi.fn(),
  previewOwnerMcpProviderConnection: mocks.previewOwnerMcpProviderConnection,
}))
vi.mock('@/modules/capability-supply/source-preview', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/capability-supply/source-preview')>()
  return {
    ...original,
    previewSupplySource: async (...args: Parameters<typeof original.previewSupplySource>) => {
      if (args[0].kind === 'x402') return await mocks.previewSupplySource(...args)
      return await original.previewSupplySource(...args)
    },
  }
})

import {
  resumeOwnerSupplySourceDraft,
  startOwnerSupplySourceConnection,
} from '@/modules/capability-supply/source-first-owner'
import { stableStringify } from '@/modules/common/stable-hash'

describe('owner source-first resumption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.previewSupplySource.mockReset()
  })

  it('returns an exact bounded x402 connection handoff without reserving an HTTP attempt', async () => {
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const sourceDigest = `sha256:${'1'.repeat(64)}`
    const candidateRef = `sha256:${'2'.repeat(64)}`
    mocks.callSourceQuery.mockResolvedValue({ kind: 'available' })
    mocks.previewSupplySource.mockResolvedValue({
      kind: 'ready',
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef,
        sourceSelector: { resourceUrl: source.resourceUrl, method: source.method },
        title: 'Paid operation',
        description: 'A paid operation.',
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: false,
        disposition: { kind: 'supported' },
      }],
    })

    const result = await startOwnerSupplySourceConnection({
      data: {
        businessId: 'business:one',
        source,
        expectedSourceDigest: sourceDigest,
        candidateRef,
        idempotencyKey: 'x402-source-start',
      },
      context: {},
    })

    const query = new URLSearchParams({
      connect: 'x402',
      draft: candidateRef,
      resourceUrl: source.resourceUrl,
      method: source.method,
      environment: source.environment,
    })
    expect(result).toMatchObject({
      kind: 'action_required',
      requiredAction: {
        title: 'Connect service',
        cta: `/owner/operations?${query.toString()}`,
      },
    })
    expect(mocks.callSourceQuery).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'a changed live digest', sourceDigest: `sha256:${'3'.repeat(64)}`, authentication: { kind: 'x402_wallet' as const } },
    { name: 'an unsupported candidate', sourceDigest: `sha256:${'1'.repeat(64)}`, authentication: { kind: 'unsupported' as const } },
  ])('refuses x402 start when $name', async ({ sourceDigest, authentication }) => {
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'GET' as const,
      environment: 'production' as const,
    }
    const expectedSourceDigest = `sha256:${'1'.repeat(64)}`
    const candidateRef = `sha256:${'2'.repeat(64)}`
    mocks.callSourceQuery.mockResolvedValue({ kind: 'available' })
    mocks.previewSupplySource.mockResolvedValue({
      kind: 'ready',
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef,
        sourceSelector: { resourceUrl: source.resourceUrl, method: source.method },
        title: 'Paid operation',
        description: 'A paid operation.',
        authentication,
        validationExampleAvailable: false,
        disposition: { kind: 'supported' },
      }],
    })

    await expect(startOwnerSupplySourceConnection({
      data: {
        businessId: 'business:one',
        source,
        expectedSourceDigest,
        candidateRef,
        idempotencyKey: 'x402-source-refused',
      },
      context: {},
    })).resolves.toMatchObject({ kind: 'action_required', requiredAction: { title: 'Business unavailable' } })
  })

  it('resumes only the exact source draft bound to the completed connection', async () => {
    const source = {
      kind: 'mcp' as const,
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production' as const,
    }
    mocks.callSourceQuery.mockImplementation(async (reference, args) => {
      expect(reference).toEqual({ name: 'capabilityProviderConnectionAttempts:readOwnerSourceDraft' })
      expect(args).toEqual({ draftRef: 'sds_exact_source' })
      return {
        kind: 'available',
        draft: {
          draftRef: 'sds_exact_source',
          businessRef: 'business:one',
          sourceDescriptorJson: stableStringify(source),
          expectedSourceDigest: `sha256:${'1'.repeat(64)}`,
          sourceRevision: `source-selection:sha256:${'1'.repeat(64)}`,
          sourceUrl: source.serverUrl,
          environment: source.environment,
          state: 'connected',
          connectionRef: 'connection:mcp',
          expiresAt: Date.now() + 60_000,
        },
      }
    })
    mocks.previewOwnerMcpProviderConnection.mockResolvedValue({
      kind: 'ready',
      serverUrl: source.serverUrl,
      protocolVersion: '2026-07-28',
      sourceDigest: `sha256:${'2'.repeat(64)}`,
      tools: [{
        name: 'lookup',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      }],
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: 'sds_exact_source',
        connectionRef: 'connection:mcp',
      },
    })).resolves.toMatchObject({
      kind: 'available',
      source,
      candidateRef: '',
      connectionRef: 'connection:mcp',
      preview: { kind: 'ready', candidates: [{ title: 'lookup' }] },
    })
    expect(mocks.callSourceQuery).toHaveBeenCalledTimes(1)
  })

  it('does not resume an exact source draft through another connection', async () => {
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      draft: {
        draftRef: 'sds_exact_source',
        businessRef: 'business:one',
        sourceDescriptorJson: '{}',
        expectedSourceDigest: `sha256:${'1'.repeat(64)}`,
        sourceRevision: `source-selection:sha256:${'1'.repeat(64)}`,
        sourceUrl: 'https://mcp.provider.example/mcp',
        environment: 'production',
        state: 'connected',
        connectionRef: 'connection:mcp',
        expiresAt: Date.now() + 60_000,
      },
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: 'sds_exact_source',
        connectionRef: 'connection:other',
      },
    })).resolves.toEqual({ kind: 'not_found' })
    expect(mocks.previewOwnerMcpProviderConnection).not.toHaveBeenCalled()
  })

  it.each(['pending', 'cancelled', 'expired'] as const)('restores the exact owner-bound MCP source after a %s handoff without claiming a connection', async (state) => {
    const source = {
      kind: 'mcp' as const,
      registryName: 'example/provider',
      remoteRef: `sha256:${'6'.repeat(64)}`,
      environment: 'production' as const,
    }
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      draft: {
        draftRef: 'sds_exact_source',
        businessRef: 'business:one',
        sourceDescriptorJson: stableStringify(source),
        expectedSourceDigest: `sha256:${'1'.repeat(64)}`,
        sourceRevision: `source-selection:sha256:${'1'.repeat(64)}`,
        sourceUrl: 'https://mcp.provider.example/mcp',
        environment: 'production',
        state,
        expiresAt: Date.now() + 60_000,
      },
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: { businessId: 'business:one', draftRef: 'sds_exact_source' },
    })).resolves.toEqual({ kind: 'available', source, candidateRef: '' })
    expect(mocks.previewOwnerMcpProviderConnection).not.toHaveBeenCalled()
  })

  it('re-previews an owner-bound x402 draft and returns its candidate and source', async () => {
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const sourceDigest = `sha256:${'7'.repeat(64)}`
    const candidateRef = `sha256:${'8'.repeat(64)}`
    mocks.callSourceQuery.mockImplementation(async (reference) => reference.name === 'capabilitySupplyOwnerFunnel:readOwnerSupplyIntegrationDraft'
      ? {
          kind: 'available',
          draft: {
            sourceDescriptorJson: stableStringify(source),
            sourceDigest,
            candidateRef,
          },
        }
      : { kind: 'not_found' })
    mocks.previewSupplySource.mockResolvedValue({
      kind: 'ready',
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef,
        sourceSelector: { resourceUrl: source.resourceUrl, method: source.method },
        title: 'Paid operation',
        description: 'A paid operation.',
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: false,
        disposition: { kind: 'supported' },
      }],
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: candidateRef,
        environment: source.environment,
      },
    })).resolves.toMatchObject({ kind: 'available', source, candidateRef, preview: { sourceDigest } })
  })

  it.each([
    { name: 'an explicit sourceEnvironment', sourceEnvironment: 'sandbox' as const },
    { name: 'an omitted sourceEnvironment', sourceEnvironment: undefined },
  ])('requires the exact available x402 connection and environment when resuming with $name', async ({ sourceEnvironment }) => {
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'GET' as const,
      environment: 'sandbox' as const,
    }
    const sourceDigest = `sha256:${'9'.repeat(64)}`
    const candidateRef = `sha256:${'a'.repeat(64)}`
    const connection = {
      connectionRef: 'connection:x402',
      businessId: 'business:one',
      adapterId: 'x402-fetch:v2',
      available: true,
      lifecycle: 'active' as const,
      grantedResources: [source.resourceUrl],
      x402Method: source.method,
      ...(sourceEnvironment === undefined ? {} : { sourceEnvironment }),
    }
    mocks.callSourceQuery.mockImplementation(async (reference) => {
      if (reference.name === 'capabilityProviderConnectionAttempts:readOwnerSourceDraft') return { kind: 'not_found' }
      if (reference.name === 'capabilitySupplyOwnerFunnel:readOwnerSupplyIntegrationDraft') {
        return { kind: 'available', draft: { sourceDescriptorJson: stableStringify(source), sourceDigest, candidateRef } }
      }
      if (reference.name === 'capabilityProviderConnections:listOwner') return [connection]
      throw new Error(`unexpected query ${reference.name}`)
    })
    mocks.previewSupplySource.mockResolvedValue({
      kind: 'ready',
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef,
        sourceSelector: { resourceUrl: source.resourceUrl, method: source.method },
        title: 'Paid operation',
        description: 'A paid operation.',
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: false,
        disposition: { kind: 'supported' },
      }],
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: candidateRef,
        connectionRef: connection.connectionRef,
        environment: source.environment,
      },
    })).resolves.toMatchObject({ kind: 'available', source, candidateRef, connectionRef: connection.connectionRef })
    expect(mocks.previewSupplySource).toHaveBeenCalledTimes(1)

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: candidateRef,
        connectionRef: 'connection:foreign',
        environment: source.environment,
      },
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it.each([
    { name: 'the requested environment differs from the saved source', kind: 'none' as const, requestedEnvironment: 'production' as const, expected: 'source_changed' as const },
    { name: 'the explicit connection environment differs', kind: 'environment-mismatch' as const, requestedEnvironment: 'sandbox' as const, expected: 'not_found' as const },
    { name: 'the connection resource differs', kind: 'wrong-resource' as const, requestedEnvironment: 'sandbox' as const, expected: 'not_found' as const },
    { name: 'the connection method differs', kind: 'wrong-method' as const, requestedEnvironment: 'sandbox' as const, expected: 'not_found' as const },
    { name: 'the connection is unavailable', kind: 'unavailable' as const, requestedEnvironment: 'sandbox' as const, expected: 'not_found' as const },
    { name: 'the connection is foreign', kind: 'foreign' as const, requestedEnvironment: 'sandbox' as const, expected: 'not_found' as const },
    { name: 'the live source digest changed', kind: 'changed-digest' as const, requestedEnvironment: 'sandbox' as const, expected: 'source_changed' as const },
  ])('rejects x402 resumption when $name', async ({ kind, requestedEnvironment, expected }) => {
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const savedDigest = `sha256:${'b'.repeat(64)}`
    const candidateRef = `sha256:${'c'.repeat(64)}`
    const requestConnectionRef = kind === 'none' ? undefined : kind === 'foreign' ? 'connection:foreign' : 'connection:x402'
    const connection = kind === 'none' ? undefined : {
      connectionRef: kind === 'foreign' ? 'connection:other' : 'connection:x402',
      businessId: 'business:one',
      adapterId: 'x402-fetch:v2',
      available: kind !== 'unavailable',
      lifecycle: 'active' as const,
      grantedResources: [kind === 'wrong-resource' ? 'https://seller.example/other' : source.resourceUrl],
      x402Method: kind === 'wrong-method' ? 'GET' as const : source.method,
      sourceEnvironment: kind === 'environment-mismatch' ? 'production' as const : source.environment,
    }
    const liveDigest = kind === 'changed-digest' ? `sha256:${'d'.repeat(64)}` : savedDigest
    mocks.callSourceQuery.mockImplementation(async (reference) => {
      if (reference.name === 'capabilitySupplyOwnerFunnel:readOwnerSupplyIntegrationDraft') {
        return {
          kind: 'available',
          draft: { sourceDescriptorJson: stableStringify(source), sourceDigest: savedDigest, candidateRef },
        }
      }
      if (reference.name === 'capabilityProviderConnections:listOwner') return connection === undefined ? [] : [connection]
      return { kind: 'not_found' }
    })
    mocks.previewSupplySource.mockResolvedValue({
      kind: 'ready',
      sourceDigest: liveDigest,
      sourceRevision: `x402:${liveDigest}`,
      provenance: { sourceKind: 'x402', sourceUrl: source.resourceUrl, authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [{
        candidateRef,
        sourceSelector: { resourceUrl: source.resourceUrl, method: source.method },
        title: 'Paid operation',
        description: 'A paid operation.',
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: false,
        disposition: { kind: 'supported' },
      }],
    })

    await expect(resumeOwnerSupplySourceDraft({
      data: {
        businessId: 'business:one',
        draftRef: candidateRef,
        ...(requestConnectionRef === undefined ? {} : { connectionRef: requestConnectionRef }),
        environment: requestedEnvironment,
      },
    })).resolves.toEqual({ kind: expected })
    if (kind === 'changed-digest') {
      expect(mocks.previewSupplySource).toHaveBeenCalledTimes(1)
    } else {
      expect(mocks.previewSupplySource).not.toHaveBeenCalled()
    }
  })
})
