import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceAction: vi.fn((name: string) => ({ name })),
  previewOwnerMcpProviderConnection: vi.fn(),
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

import { resumeOwnerSupplySourceDraft } from '@/modules/capability-supply/source-first-owner'
import { stableStringify } from '@/modules/common/stable-hash'

describe('owner source-first resumption', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
