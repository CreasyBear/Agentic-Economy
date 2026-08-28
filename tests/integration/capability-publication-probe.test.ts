import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../convex/workloadCron', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../convex/workloadCron')>()),
  reconcileWorkloadCronSnapshot: vi.fn(async (_ctx, _name, snapshot) => snapshot),
}))

import { api, internal } from '../../convex/_generated/api'
import { scheduleDueCapabilityProbesHandler } from '../../convex/capabilitySupplyProbes'
import { probeHandler } from '../../convex/capabilitySupplyReadiness'
import schema from '../../convex/schema'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  contractMetadata,
  operationContext,
  preparedPublicationArgs,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

type ReadinessEvent = Readonly<Record<string, unknown>>

const READINESS_WORKLOAD = {
  name: 'refresh capability supply readiness' as const,
  workloadKind: 'cron' as const,
  actorPrincipalRef: 'prn_f2000000000000000000000000000001',
  activeAccountRef: 'acc_f2000000000000000000000000000001',
  correlationRef: 'cron:readiness:test',
  idempotencyRef: 'cron:readiness:test',
  purpose: 'refresh capability supply readiness',
  source: 'convex/workloadCron:refreshCapabilitySupplyReadiness',
  principalRevision: 1,
  activeAccountRevision: 1,
  accessVia: 'membership' as const,
  admittedAt: 1,
}

function readinessEvents(calls: readonly (readonly unknown[])[]): ReadinessEvent[] {
  return calls.flatMap((call) => {
    if (call.length !== 1 || typeof call[0] !== 'string') return []
    try {
      const parsed: unknown = JSON.parse(call[0])
      if (typeof parsed !== 'object' || parsed === null || !('kind' in parsed)) return []
      const kind = (parsed as { kind?: unknown }).kind
      return typeof kind === 'string' && kind.startsWith('capability_readiness_')
        ? [parsed as ReadinessEvent]
        : []
    } catch {
      return []
    }
  })
}

function fakeProbeTarget() {
  return {
    publicationRef: 'publication:forbidden-raw-ref',
    revision: 7,
    bindingId: 'binding:forbidden-raw-ref',
    capabilityId: 'capability.forbidden.raw',
    endpointUrl: 'http://127.0.0.1/forbidden-endpoint',
    adapterId: 'fabricated-adapter',
    probeKind: 'ae_quote' as const,
    probeQuery: [{ parameter: 'secret-parameter', value: 'secret-value' }],
    probeMethod: 'POST' as const,
    transportConfigJson: '{malformed-private-config',
    probeInputJson: '{"private":"probe-input"}',
    outputSchemaJson: '{"private":"output-schema"}',
    targetDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authority: { kind: 'public_upstream' as const },
    resourceAuthority: {
      mode: 'human_owner' as const,
      publicationRef: 'publication:forbidden-raw-ref',
      publicationRevision: 7,
      businessId: 'business:forbidden' as never,
      publisherPrincipalRef: 'prn_forbidden',
      ownerPrincipalRef: 'prn_forbidden',
      owningAccountRef: 'acc_forbidden',
      ownershipRef: 'own_forbidden',
      accountRevision: 1,
      publisherPrincipalRevision: 1,
      authorityDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
  }
}

function fakeProbeContext(
  scheduledFunctionId: string | null,
  targetResult: unknown,
  recordResult: unknown,
) {
  return {
    meta: {
      getRequestMetadata: vi.fn(async () => ({ scheduledFunctionId })),
    },
    runQuery: vi.fn(async () => targetResult),
    runMutation: vi.fn(async () => recordResult),
  } as unknown as Parameters<typeof probeHandler>[0]
}

describe('capability publication probe', () => {
  it('logs one bounded scheduled cycle with exactly the unique returned function IDs', async () => {
    const due = Array.from({ length: 20 }, (_, index) => ({
      publicationRef: `publication:private:${index}`,
      revision: index + 1,
    }))
    const scheduledFunctionIds = due.map((_, index) => `scheduled:function:${index}`)
    const runAfter = vi.fn(async () => scheduledFunctionIds[runAfter.mock.calls.length - 1])
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({ take: vi.fn(async (limit: number) => due.slice(0, limit)) })),
        })),
      },
      scheduler: { runAfter },
    } as unknown as Parameters<typeof scheduleDueCapabilityProbesHandler>[0]
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await expect(scheduleDueCapabilityProbesHandler(ctx, {
      workload: READINESS_WORKLOAD,
    })).resolves.toBe(20)

    const events = readinessEvents(log.mock.calls)
    expect(events).toHaveLength(1)
    const event = events[0]
    if (event === undefined) throw new Error('scheduled_cycle_event_missing')
    expect(event).toEqual({
      kind: 'capability_readiness_scheduled_cycle',
      schemaVersion: 'capability-readiness-scheduled-cycle:v1',
      observedAt: expect.any(Number),
      dueCount: 20,
      scheduledFunctionIds,
    })
    expect(Number.isSafeInteger(event.observedAt)).toBe(true)
    expect(event.dueCount).toBe((event.scheduledFunctionIds as unknown[]).length)
    expect(new Set(event.scheduledFunctionIds as string[]).size).toBe(20)
    expect(event.dueCount).toBeGreaterThanOrEqual(0)
    expect(event.dueCount).toBeLessThanOrEqual(20)
    expect(JSON.stringify(event)).not.toContain('publication:private')
    log.mockRestore()
  })

  it.each([
    ['observed', {
      kind: 'observed' as const,
      publicationRef: 'publication:forbidden-result-ref',
      revision: 7,
      lifecycle: { state: 'inactive' as const, reasons: ['health_unhealthy' as const] },
    }, { terminalKind: 'observed', lifecycleState: 'inactive' }],
    ['refused', {
      kind: 'refused' as const,
      reason: 'target_changed' as const,
    }, { terminalKind: 'refused', reason: 'target_changed' }],
  ] as const)('logs a privacy-safe %s terminal joined to its scheduled ID', async (
    _label,
    recordResult,
    expectedTerminal,
  ) => {
    const scheduledFunctionId = 'scheduled:function:joined'
    const ctx = fakeProbeContext(
      scheduledFunctionId,
      { kind: 'available', target: fakeProbeTarget() },
      recordResult,
    )
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await expect(probeHandler(ctx, {
      publicationRef: 'publication:forbidden-argument-ref',
      expectedRevision: 7,
    })).resolves.toEqual(recordResult)

    const events = readinessEvents(log.mock.calls)
    expect(events).toEqual([
      {
        kind: 'capability_readiness_probe_started',
        schemaVersion: 'capability-readiness-probe-event:v1',
        observedAt: expect.any(Number),
        scheduledFunctionId,
      },
      {
        kind: 'capability_readiness_probe_terminal',
        schemaVersion: 'capability-readiness-probe-event:v1',
        observedAt: expect.any(Number),
        scheduledFunctionId,
        ...expectedTerminal,
      },
    ])
    for (const event of events) {
      expect(Number.isSafeInteger(event.observedAt)).toBe(true)
      const serialized = JSON.stringify(event)
      for (const forbidden of [
        'publication:forbidden',
        'binding:forbidden',
        'capability.forbidden',
        '127.0.0.1',
        'secret-parameter',
        'secret-value',
        'private-config',
        'probe-input',
        'output-schema',
        'aaaaaaaaaaaaaaaa',
        'health_unhealthy',
      ]) expect(serialized).not.toContain(forbidden)
    }
    log.mockRestore()
  })

  it('logs unavailable without evidence refs and does not swallow unexpected probe errors', async () => {
    const scheduledFunctionId = 'scheduled:function:unavailable'
    const unavailable = fakeProbeContext(
      scheduledFunctionId,
      {
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['forbidden-private-evidence-ref'],
      },
      undefined,
    )
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await expect(probeHandler(unavailable, {
      publicationRef: 'publication:forbidden-unavailable-ref',
      expectedRevision: 7,
    })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'effectful_probe_unsupported',
      evidenceRefs: ['forbidden-private-evidence-ref'],
    })
    expect(readinessEvents(log.mock.calls).at(-1)).toEqual({
      kind: 'capability_readiness_probe_terminal',
      schemaVersion: 'capability-readiness-probe-event:v1',
      observedAt: expect.any(Number),
      scheduledFunctionId,
      terminalKind: 'unavailable',
      reason: 'effectful_probe_unsupported',
    })
    expect(JSON.stringify(readinessEvents(log.mock.calls))).not.toContain('forbidden-private')

    log.mockClear()
    const failed = fakeProbeContext(
      'scheduled:function:failed',
      undefined,
      undefined,
    )
    vi.mocked(failed.runQuery).mockRejectedValueOnce(new Error('fabricated_probe_failure'))
    await expect(probeHandler(failed, {
      publicationRef: 'publication:forbidden-failure-ref',
      expectedRevision: 7,
    })).rejects.toThrow('fabricated_probe_failure')
    expect(readinessEvents(log.mock.calls)).toEqual([{
      kind: 'capability_readiness_probe_started',
      schemaVersion: 'capability-readiness-probe-event:v1',
      observedAt: expect.any(Number),
      scheduledFunctionId: 'scheduled:function:failed',
    }])
    log.mockRestore()
  })
  it.each([
    'owner',
    'member',
    'workload',
    'missing_workload',
    'stranger',
    'wrong_account',
    'stale_generation',
  ] as const)(
    'evaluates readCurrentCapabilityProbeAuthority %s through the registered readiness action',
    async (caseKind) => {
      const backend = convexTest(schema, modules)
      const caseSuffix = {
        owner: 'own', member: 'mem', workload: 'wrk', missing_workload: 'mis',
        stranger: 'str', wrong_account: 'acc', stale_generation: 'stl',
      } as const
      const suffix = `pi-${caseSuffix[caseKind]}`
      const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
      await seedCatalogOffering(backend, businessId, suffix)
      await registerProviderConnection(backend, businessId, suffix)
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(
          backend,
          capabilityPublicationInput(businessId, suffix),
        ),
      )
      if (published.kind !== 'published') {
        throw new Error(`probe_isolation_publication_${published.kind}`)
      }
      await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => query
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision))
          .unique()
        const business = await ctx.db.get(businessId)
        if (publication === null || business === null) {
          throw new Error('probe_isolation_rows_missing')
        }
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
          .unique()
        if (account === null) throw new Error('probe_isolation_account_missing')
        const ownership = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
          .unique()
        if (ownership === null) throw new Error('probe_isolation_ownership_missing')
        const publisher = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', publication.publisherRef))
          .unique()
        if (publisher === null) throw new Error('probe_isolation_publisher_missing')

        if (caseKind === 'member') {
          const replacementRef = `prn_${canonicalDigest({ suffix, role: 'replacement-owner' })
            .slice('sha256:'.length, 'sha256:'.length + 32)}`
          const membershipRef = `mem_${canonicalDigest({ suffix, role: 'former-owner-member' })
            .slice('sha256:'.length, 'sha256:'.length + 32)}`
          await ctx.db.insert('principals', {
            principalRef: replacementRef,
            kind: 'human',
            displayName: 'Replacement probe owner',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          await ctx.db.patch(ownership._id, {
            ownerPrincipalRef: replacementRef,
            revision: ownership.revision + 1,
          })
          await ctx.db.insert('memberships', {
            membershipRef,
            accountRef: business.owningAccountRef,
            memberPrincipalRef: publication.publisherRef,
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            createdBy: {
              actorPrincipalRef: replacementRef,
              activeAccountRef: business.owningAccountRef,
              correlationRef: `create:${membershipRef}`,
              idempotencyRef: `create:${membershipRef}`,
            },
          })
        } else if (caseKind === 'workload') {
          await ctx.db.patch(publisher._id, { kind: 'workload' })
        } else if (caseKind === 'missing_workload') {
          await ctx.db.delete(publisher._id)
        } else if (caseKind === 'stranger') {
          await ctx.db.patch(publication._id, {
            publisherRef: `prn_${'e'.repeat(32)}`,
          })
        } else if (caseKind === 'wrong_account') {
          const foreignAccountRef = `acc_${'f'.repeat(32)}`
          const foreignPrincipalRef = `prn_${'f'.repeat(32)}`
          await ctx.db.insert('principals', {
            principalRef: foreignPrincipalRef,
            kind: 'agent',
            displayName: 'Foreign probe publisher',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          await ctx.db.insert('agentAccessPrincipals', {
            principalId: foreignPrincipalRef,
            ownerId: foreignAccountRef,
            credentialId: 'credential:foreign-probe-publisher',
            applicationRef: 'application:foreign-probe-publisher',
            environment: 'production',
            scopes: ['capability_supply:publish'],
            authorityMode: 'bounded_mandate',
            grantGeneration: 1,
            policyDigest: 'sha256:foreign-probe-publisher',
            lifecycle: 'active',
            recordedAt: 2,
            lastSeenAt: 2,
          })
          await ctx.db.patch(publication._id, { publisherRef: foreignPrincipalRef })
        } else if (caseKind === 'stale_generation') {
          const agentRef = `prn_${'d'.repeat(32)}`
          await ctx.db.insert('principals', {
            principalRef: agentRef,
            kind: 'agent',
            displayName: 'Stale probe agent',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          await ctx.db.insert('agentAccessPrincipals', {
            principalId: agentRef,
            ownerId: business.owningAccountRef,
            credentialId: 'credential:stale-probe-agent',
            applicationRef: 'application:stale-probe-agent',
            environment: 'production',
            scopes: ['capability_supply:publish'],
            authorityMode: 'bounded_mandate',
            grantGeneration: 2,
            policyDigest: 'sha256:stale-probe-agent',
            lifecycle: 'active',
            recordedAt: 2,
            lastSeenAt: 2,
          })
          await ctx.db.patch(publication._id, { publisherRef: agentRef })
        }
      })

      const protectedState = async () => await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => query
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision))
          .unique()
        if (publication === null) throw new Error('probe_isolation_publication_missing')
        return {
          credentialState: publication.credentialState,
          healthState: publication.healthState,
          readinessObservedAt: publication.readinessObservedAt,
          readinessValidUntil: publication.readinessValidUntil,
          readinessEvidenceRefs: publication.readinessEvidenceRefs,
        }
      })
      const before = await protectedState()
      const result = await backend.action(internal.capabilitySupplyReadiness.probe, {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
      })

      if (caseKind === 'owner') {
        expect(result).toMatchObject({ kind: 'observed' })
        await expect(protectedState()).resolves.toMatchObject({
          credentialState: 'unavailable',
          healthState: 'unhealthy',
        })
      } else {
        expect(result).toEqual({
          kind: 'unavailable',
          reason: 'authority_stale',
          evidenceRefs: ['probe-target:authority-stale'],
        })
        await expect(protectedState()).resolves.toEqual(before)
      }
    },
  )

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for an OpenAPI %s operation before network execution',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `openapi-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(backend, businessId, suffix)
      const contractDocument = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.openapi.${effectClass.replaceAll('_', '-')}`,
          name: `OpenAPI ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const { inputSchema, outputSchema } = contractDocument
      const input = {
        businessId,
        source: {
          kind: 'openapi_http' as const,
          document: {
            openapi: '3.1.0',
            servers: [{ url: `https://${suffix}.example.test` }],
            components: {
              securitySchemes: {
                ProviderKey: {
                  type: 'apiKey',
                  in: 'header',
                  name: 'X-Provider-Key',
                },
              },
            },
            paths: {
              '/lookup': {
                post: {
                  security: [{ ProviderKey: [] }],
                  requestBody: {
                    content: { 'application/json': { schema: inputSchema } },
                  },
                  responses: {
                    200: {
                      content: { 'application/json': { schema: outputSchema } },
                    },
                  },
                },
              },
            },
          },
          operation: { path: '/lookup' as const, method: 'post' as const },
          contract: contractMetadata(contractDocument),
          commercial: {
            offering: direct.offering,
            bindingId: direct.binding.bindingId,
            authority: direct.binding.authority,
            registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
            requestTimeoutMs: 5_000,
          },
          evidenceRefs: ['business:openapi-description'],
        },
        ...operationContext(`publish-${suffix}`),
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, input),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        offeringId: direct.offering.offeringId,
        bindingId: direct.binding.bindingId,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')
      const fetch = vi.spyOn(globalThis, 'fetch')
      const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
      expect(fetch).not.toHaveBeenCalled()
      expect(readinessEvents(log.mock.calls)).toEqual([
        {
          kind: 'capability_readiness_probe_started',
          schemaVersion: 'capability-readiness-probe-event:v1',
          observedAt: expect.any(Number),
          scheduledFunctionId: null,
        },
        {
          kind: 'capability_readiness_probe_terminal',
          schemaVersion: 'capability-readiness-probe-event:v1',
          observedAt: expect.any(Number),
          scheduledFunctionId: null,
          terminalKind: 'unavailable',
          reason: 'effectful_probe_unsupported',
        },
      ])
      fetch.mockRestore()
      log.mockRestore()
    },
  )

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for effectful MCP %s before tools/call',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `mcp-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(
        backend,
        businessId,
        suffix,
        'mcp-jsonrpc:v1',
      )
      const document = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.mcp.${effectClass.replaceAll('_', '-')}`,
          name: `MCP ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const commercial = {
        offering: direct.offering,
        bindingId: direct.binding.bindingId,
        authority: direct.binding.authority,
        registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
        requestTimeoutMs: 5_000,
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, {
          businessId,
          source: {
            kind: 'mcp' as const,
            serverUrl: `https://${suffix}.example.test/rpc`,
            tool: {
              name: 'reference_lookup',
              inputSchema: document.inputSchema,
              outputSchema: document.outputSchema,
            },
            protocolVersion: '2025-06-18',
            contract: contractMetadata(document),
            commercial,
            evidenceRefs: ['business:mcp-description'],
          },
          ...operationContext(`publish-${suffix}`),
        }),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')

      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
    },
  )
})
