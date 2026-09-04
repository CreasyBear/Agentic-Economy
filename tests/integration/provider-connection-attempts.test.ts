import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { createCustomerRequestServiceAssertion } from '../../src/modules/agent-access/service-auth-envelope'
import { stableStringify } from '../../src/modules/common/stable-hash'
import {
  createPublishedBusinessOwner,
  seedSupplyAgentPrincipal,
} from './capability-supply-owner-funnel-harness'

describe('Provider connection attempts', () => {
  it('lets the authenticated Business owner reserve the same credential-free OAuth handoff', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await createPublishedBusinessOwner(backend, 'provider-owner-oauth-attempt')
    const sourceDescriptorJson = stableStringify({
      environment: 'production',
      kind: 'mcp',
      registryName: 'example/provider',
      remoteRef: `sha256:${'6'.repeat(64)}`,
    })
    const command = {
      businessId: fixture.businessId,
      sourceKind: 'mcp_oauth' as const,
      sourceUrl: 'https://mcp.provider.example/mcp',
      sourceDescriptorJson,
      authentication: { kind: 'mcp_oauth' as const },
      environment: 'production' as const,
      inputDigest: `sha256:${'7'.repeat(64)}`,
      commandId: 'provider-owner-oauth-attempt:one',
      operationKey: 'provider-owner-oauth-attempt:one',
      correlationId: 'provider-owner-oauth-attempt:one',
    }

    const reserved = await fixture.owner.mutation(
      api.capabilityProviderConnectionAttempts.reserveOwner,
      await withSourceWrite('catalog_publish', command),
    )

    expect(reserved).toMatchObject({
      kind: 'reserved',
      attemptRef: expect.stringMatching(/^pca_/u),
      draftRef: expect.stringMatching(/^sds_/u),
    })
    const row = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityProviderConnectionAttempts')
        .withIndex('by_commandId', (query) => query.eq('commandId', command.commandId))
        .unique()
    ))
    expect(row).toMatchObject({
      owningAccountRef: fixture.canonicalAccountRef,
      installedByPrincipalRef: fixture.canonicalPrincipalRef,
      businessId: fixture.businessId,
      sourceKind: 'mcp_oauth',
      lifecycle: 'pending',
      draftRef: reserved.kind === 'reserved' ? reserved.draftRef : undefined,
      expectedSourceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
    expect(row).not.toHaveProperty('sourceDescriptorJson')
    if (reserved.kind === 'refused' || reserved.draftRef === undefined) {
      throw new Error('expected exact source draft')
    }
    await expect(fixture.owner.query(
      api.capabilityProviderConnectionAttempts.readOwnerSourceDraft,
      { draftRef: reserved.draftRef },
    )).resolves.toMatchObject({
      kind: 'available',
      draft: {
        draftRef: reserved.draftRef,
        businessRef: String(fixture.businessId),
        sourceDescriptorJson,
        sourceUrl: 'https://mcp.provider.example/mcp',
        state: 'pending',
      },
    })
  })

  it('reserves one expiring credential-free handoff and replays it exactly', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    const serviceKey = 'provider-http-runtime-service-key-00000000000000000000000'
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    try {
      const backend = convexTest(schema, modules)
      const fixture = await createPublishedBusinessOwner(backend, 'provider-connection-attempt')
      const principal = await seedSupplyAgentPrincipal(
        backend,
        fixture.canonicalAccountRef,
        'provider-connection-attempt',
      )
      const command = {
        businessId: fixture.businessId,
        sourceKind: 'http_credential' as const,
        sourceUrl: 'https://provider.example/openapi.yaml',
        authentication: { kind: 'api_key' as const, location: 'header' as const, name: 'X-API-Key' },
        environment: 'production' as const,
        inputDigest: `sha256:${'a'.repeat(64)}`,
        commandId: 'provider-connection-attempt:one',
        operationKey: 'provider-connection-attempt:one',
        correlationId: 'provider-connection-attempt:one',
        agentPrincipal: principal,
      }

      const reserved = await backend.mutation(
        api.capabilityProviderConnectionAttempts.reserveAgent,
        await withSourceWrite('catalog_publish', command),
      )
      expect(reserved).toEqual({
        kind: 'reserved',
        attemptRef: expect.stringMatching(/^pca_/u),
        expiresAt: 1_600_000,
      })
      if (reserved.kind === 'refused') throw new Error('expected Provider connection attempt')
      const replay = await backend.mutation(
        api.capabilityProviderConnectionAttempts.reserveAgent,
        await withSourceWrite('catalog_publish', command),
      )
      expect(replay).toMatchObject({ kind: 'replayed', expiresAt: 1_600_000 })

      const rows = await backend.run(async (ctx) => (
        await ctx.db.query('capabilityProviderConnectionAttempts').collect()
      ))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        owningAccountRef: fixture.canonicalAccountRef,
        installedByPrincipalRef: principal.principalId,
        businessId: fixture.businessId,
        sourceKind: 'http_credential',
        sourceOrigin: 'https://provider.example',
        authentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
        lifecycle: 'pending',
      })
      expect(JSON.stringify(rows[0])).not.toContain('must-not-be-stored')
      expect(rows[0]).not.toHaveProperty('credential')
      expect(rows[0]).not.toHaveProperty('token')
      expect(rows[0]).not.toHaveProperty('authorizationUrl')

      await expect(fixture.owner.query(
        api.capabilityProviderConnectionAttempts.readOwner,
        { attemptRef: reserved.attemptRef },
      )).resolves.toEqual({
        kind: 'available',
        attempt: {
          attemptRef: reserved.attemptRef,
          businessRef: String(fixture.businessId),
          sourceKind: 'http_credential',
          sourceUrl: 'https://provider.example/openapi.yaml',
          sourceOrigin: 'https://provider.example',
          authentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
          environment: 'production',
          state: 'pending',
          expiresAt: 1_600_000,
        },
      })

      const prepareCommand = {
        attemptRef: reserved.attemptRef,
        commandId: 'provider-connection-attempt:prepare',
        operationKey: 'provider-connection-attempt:prepare',
        correlationId: 'provider-connection-attempt:prepare',
        proof: {
          reverificationId: 'rev_provider_connection_attempt_prepare',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }
      const prepared = await fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.prepareOwner,
        await withSourceWrite('catalog_publish', prepareCommand),
      )
      expect(prepared).toMatchObject({
        kind: 'prepared',
        attemptRef: reserved.attemptRef,
        secretRef: expect.stringMatching(/^sec_[0-9a-f]{32}$/u),
        authority: {
          operation: 'provision',
          accountRef: fixture.canonicalAccountRef,
          actorPrincipalRef: fixture.canonicalPrincipalRef,
          correlationRef: prepareCommand.commandId,
          idempotencyRef: prepareCommand.commandId,
          occurredAt: 1_000_000,
        },
      })
      if (prepared.kind !== 'prepared') throw new Error('expected prepared secret authority')
      const snapshots = await backend.run(async (ctx) => (
        await ctx.db.query('authorityDelegationSnapshots').collect()
      ))
      expect(snapshots).toContainEqual(expect.objectContaining({
        snapshotRef: prepared.authority.snapshotRef,
        scopes: ['secret:provision'],
        resourceRefs: [`secret:${prepared.secretRef}`],
      }))
      await backend.mutation(internal.secretLifecycleOperations.initializeSecretPointer, {
        authority: prepared.authority,
        secretRef: prepared.secretRef,
        activeGeneration: 'sgn_00000000000040008000000000000061',
      })
      const finalizeCommand = {
        attemptRef: reserved.attemptRef,
        secretRef: prepared.secretRef,
        provisionCommandId: prepareCommand.commandId,
        commandId: 'provider-connection-attempt:finalize',
        operationKey: 'provider-connection-attempt:finalize',
        correlationId: 'provider-connection-attempt:finalize',
      }
      const finalized = await fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.finalizeOwner,
        await withSourceWrite('catalog_publish', finalizeCommand),
      )
      expect(finalized).toMatchObject({
        kind: 'connected',
        connection: {
          adapterId: 'http-json:v1',
          businessId: String(fixture.businessId),
          credentialConfigured: true,
          grantedResources: ['https://provider.example/openapi.yaml'],
          lifecycle: 'active',
          sourceOrigin: 'https://provider.example',
          sourceEnvironment: 'production',
          sourceAuthentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
        },
      })
      const connected = await backend.run(async (ctx) => (
        await ctx.db.query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (query) => query.eq(
            'connectionRef',
            finalized.kind === 'connected' ? finalized.connection.connectionRef : '',
          ))
          .unique()
      ))
      expect(connected).toMatchObject({
        sourceOrigin: 'https://provider.example',
        sourceEnvironment: 'production',
        sourceAuthentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
      })
      const lifecycleAudits = await backend.run(async (ctx) => (
        (await ctx.db.query('auditEvents').collect())
          .filter((event) => event.eventType === 'connection.connected')
      ))
      expect(lifecycleAudits).toHaveLength(1)
      expect(lifecycleAudits[0]).toMatchObject({
        actorRef: fixture.canonicalPrincipalRef,
        activeAccountRef: fixture.canonicalAccountRef,
        targetRef: finalized.kind === 'connected' ? finalized.connection.connectionRef : '',
        afterState: 'connected',
      })
      expect(JSON.parse(lifecycleAudits[0]!.redactedPayloadJson)).toEqual({
        adapterId: 'http-json:v1',
        resourceUrl: 'https://provider.example/openapi.yaml',
      })
      await expect(fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.finalizeOwner,
        await withSourceWrite('catalog_publish', finalizeCommand),
      )).resolves.toMatchObject({
        kind: 'replayed',
        connection: { connectionRef: finalized.kind === 'connected' ? finalized.connection.connectionRef : '' },
      })
      const completedAttempt = await backend.run(async (ctx) => (
        await ctx.db.query('capabilityProviderConnectionAttempts')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', reserved.attemptRef))
          .unique()
      ))
      expect(completedAttempt).toMatchObject({
        lifecycle: 'consumed',
        credentialSecretRef: prepared.secretRef,
        connectionRef: finalized.kind === 'connected' ? finalized.connection.connectionRef : '',
      })

      if (finalized.kind !== 'connected') throw new Error('expected connected HTTP source')
      const runtimeCommand = {
        connectionRef: finalized.connection.connectionRef,
        correlationRef: 'provider-http-runtime:restart',
      }
      const serviceAuth = await createCustomerRequestServiceAssertion({
        key: serviceKey,
        operation: 'capabilityProviderConnections.prepareOwnerHttpRuntimeForServer',
        command: runtimeCommand,
        principal: {
          principalId: 'ae:server-function',
          ownerId: 'ae:server-function',
          credentialId: 'ae:server-function',
          scopes: ['market_supply:manage'],
        },
        issuedAt: 1_000_000,
      })
      await expect(fixture.owner.mutation(
        api.capabilityProviderConnections.prepareOwnerHttpRuntimeForServer,
        { ...runtimeCommand, serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] } },
      )).resolves.toEqual({
        kind: 'available',
        connection: {
          connectionRef: finalized.connection.connectionRef,
          businessRef: String(fixture.businessId),
          sourceUrl: 'https://provider.example/openapi.yaml',
          sourceOrigin: 'https://provider.example',
          environment: 'production',
          authentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
          secretRef: prepared.secretRef,
          activeGeneration: 'sgn_00000000000040008000000000000061',
          pointerRevision: 1,
        },
      })
    } finally {
      vi.useRealTimers()
      if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
      else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
    }
  })

  it('fails closed for changed replay input, unsafe sources, or another Account', async () => {
    const backend = convexTest(schema, modules)
    const fixture = await createPublishedBusinessOwner(backend, 'provider-connection-attempt-owner')
    const foreign = await createPublishedBusinessOwner(backend, 'provider-connection-attempt-foreign')
    const principal = await seedSupplyAgentPrincipal(
      backend,
      fixture.canonicalAccountRef,
      'provider-connection-attempt-owner',
    )
    const foreignPrincipal = await seedSupplyAgentPrincipal(
      backend,
      foreign.canonicalAccountRef,
      'provider-connection-attempt-foreign',
    )
    const base = {
      businessId: fixture.businessId,
      sourceKind: 'mcp_oauth' as const,
      sourceUrl: 'https://mcp.provider.example/mcp',
      authentication: { kind: 'mcp_oauth' as const },
      environment: 'production' as const,
      inputDigest: `sha256:${'b'.repeat(64)}`,
      commandId: 'provider-connection-attempt:conflict',
      operationKey: 'provider-connection-attempt:conflict',
      correlationId: 'provider-connection-attempt:conflict',
      agentPrincipal: principal,
    }
    const reserved = await backend.mutation(
      api.capabilityProviderConnectionAttempts.reserveAgent,
      await withSourceWrite('catalog_publish', base),
    )
    expect(reserved).toMatchObject({ kind: 'reserved' })
    if (reserved.kind === 'refused') throw new Error('expected Provider connection attempt')
    await expect(foreign.owner.query(
      api.capabilityProviderConnectionAttempts.readOwner,
      { attemptRef: reserved.attemptRef },
    )).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.mutation(
      api.capabilityProviderConnectionAttempts.reserveAgent,
      await withSourceWrite('catalog_publish', {
        ...base,
        inputDigest: `sha256:${'c'.repeat(64)}`,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    await expect(backend.mutation(
      api.capabilityProviderConnectionAttempts.reserveAgent,
      await withSourceWrite('catalog_publish', {
        ...base,
        commandId: 'provider-connection-attempt:unsafe',
        operationKey: 'provider-connection-attempt:unsafe',
        correlationId: 'provider-connection-attempt:unsafe',
        sourceUrl: 'https://127.0.0.1/mcp',
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'invalid_source' })
    await expect(backend.mutation(
      api.capabilityProviderConnectionAttempts.reserveAgent,
      await withSourceWrite('catalog_publish', {
        ...base,
        commandId: 'provider-connection-attempt:foreign',
        operationKey: 'provider-connection-attempt:foreign',
        correlationId: 'provider-connection-attempt:foreign',
        agentPrincipal: foreignPrincipal,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
  })

  it('binds an MCP OAuth callback by state hash and accepts only the rotated Infisical generation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    const serviceKey = 'provider-mcp-runtime-service-key-000000000000000000000000'
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = serviceKey
    try {
      const backend = convexTest(schema, modules)
      const fixture = await createPublishedBusinessOwner(backend, 'provider-mcp-oauth')
      const foreign = await createPublishedBusinessOwner(backend, 'provider-mcp-oauth-foreign')
      const principal = await seedSupplyAgentPrincipal(
        backend,
        fixture.canonicalAccountRef,
        'provider-mcp-oauth',
      )
      const command = {
        businessId: fixture.businessId,
        sourceKind: 'mcp_oauth' as const,
        sourceUrl: 'https://mcp.provider.example/mcp',
        authentication: { kind: 'mcp_oauth' as const },
        environment: 'production' as const,
        inputDigest: `sha256:${'e'.repeat(64)}`,
        commandId: 'provider-mcp-oauth:reserve',
        operationKey: 'provider-mcp-oauth:reserve',
        correlationId: 'provider-mcp-oauth:reserve',
        agentPrincipal: principal,
      }
      const reserved = await backend.mutation(
        api.capabilityProviderConnectionAttempts.reserveAgent,
        await withSourceWrite('catalog_publish', command),
      )
      if (reserved.kind === 'refused') throw new Error('expected MCP OAuth attempt')

      const prepared = await fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.prepareOAuthOwner,
        await withSourceWrite('catalog_publish', {
          attemptRef: reserved.attemptRef,
          commandId: 'provider-mcp-oauth:prepare',
          operationKey: 'provider-mcp-oauth:prepare',
          correlationId: 'provider-mcp-oauth:prepare',
          proof: {
            reverificationId: 'rev_provider_mcp_oauth_prepare',
            firstFactorAgeMinutes: 0,
            secondFactorAgeMinutes: -1,
          },
        }),
      )
      expect(prepared).toMatchObject({
        kind: 'prepared',
        secretRef: expect.stringMatching(/^sec_[0-9a-f]{32}$/u),
        provisionAuthority: { operation: 'provision' },
        rotationAuthority: { operation: 'rotate' },
      })
      if (prepared.kind !== 'prepared') throw new Error('expected OAuth secret authority')
      await backend.mutation(internal.secretLifecycleOperations.initializeSecretPointer, {
        authority: prepared.provisionAuthority,
        secretRef: prepared.secretRef,
        activeGeneration: 'sgn_00000000000040008000000000000071',
      })

      const stateHash = `sha256:${'f'.repeat(64)}`
      const bound = await fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.bindOAuthOwner,
        await withSourceWrite('catalog_publish', {
          attemptRef: reserved.attemptRef,
          stateHash,
          secretRef: prepared.secretRef,
          provisionCommandId: prepared.provisionAuthority.idempotencyRef,
          commandId: 'provider-mcp-oauth:bind',
          operationKey: 'provider-mcp-oauth:bind',
          correlationId: 'provider-mcp-oauth:prepare',
        }),
      )
      expect(bound).toEqual({ kind: 'bound' })

      await expect(foreign.owner.query(
        api.capabilityProviderConnectionAttempts.readOAuthCallbackOwner,
        { attemptRef: reserved.attemptRef, stateHash, observedAt: 2_000_001 },
      )).resolves.toEqual({ kind: 'not_found' })
      await expect(fixture.owner.query(
        api.capabilityProviderConnectionAttempts.readOAuthCallbackOwner,
        { attemptRef: reserved.attemptRef, stateHash: `sha256:${'0'.repeat(64)}`, observedAt: 2_000_001 },
      )).resolves.toEqual({ kind: 'not_found' })
      await expect(fixture.owner.query(
        api.capabilityProviderConnectionAttempts.readOAuthCallbackOwner,
        { attemptRef: reserved.attemptRef, stateHash, observedAt: 2_000_001 },
      )).resolves.toEqual({
        kind: 'available',
        attempt: {
          attemptRef: reserved.attemptRef,
          sourceUrl: 'https://mcp.provider.example/mcp',
          environment: 'production',
          secretRef: prepared.secretRef,
          activeGeneration: 'sgn_00000000000040008000000000000071',
          pointerRevision: 1,
        },
      })

      await backend.mutation(internal.secretLifecycleOperations.advanceSecretPointer, {
        authority: prepared.rotationAuthority,
        secretRef: prepared.secretRef,
        expectedActiveGeneration: 'sgn_00000000000040008000000000000071',
        expectedRevision: 1,
        newGeneration: 'sgn_00000000000040008000000000000072',
      })
      const finalized = await fixture.owner.mutation(
        api.capabilityProviderConnectionAttempts.finalizeOwner,
        await withSourceWrite('catalog_publish', {
          attemptRef: reserved.attemptRef,
          secretRef: prepared.secretRef,
          provisionCommandId: prepared.rotationAuthority.idempotencyRef,
          commandId: 'provider-mcp-oauth:finalize',
          operationKey: 'provider-mcp-oauth:finalize',
          correlationId: 'provider-mcp-oauth:prepare',
        }),
      )
      expect(finalized).toMatchObject({
        kind: 'connected',
        connection: {
          adapterId: 'mcp-jsonrpc:v1',
          connectionRef: expect.stringContaining('connection:'),
          lifecycle: 'active',
          sourceOrigin: 'https://mcp.provider.example',
          sourceEnvironment: 'production',
          sourceAuthentication: { kind: 'mcp_oauth' },
        },
      })
      const row = await backend.run(async (ctx) => (
        await ctx.db.query('capabilityProviderConnectionAttempts')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', reserved.attemptRef))
          .unique()
      ))
      expect(row).toMatchObject({
        lifecycle: 'consumed',
        stateHash,
        pkceSecretRef: prepared.secretRef,
        credentialSecretRef: prepared.secretRef,
      })
      expect(JSON.stringify(row)).not.toContain('authorization-code')
      expect(JSON.stringify(row)).not.toContain('refresh-token')

      if (finalized.kind !== 'connected') throw new Error('expected connected MCP source')
      const runtimeCommand = {
        connectionRef: finalized.connection.connectionRef,
        correlationRef: 'provider-mcp-runtime:restart',
      }
      const serviceAuth = await createCustomerRequestServiceAssertion({
        key: serviceKey,
        operation: 'capabilityProviderConnections.prepareOwnerMcpRuntimeForServer',
        command: runtimeCommand,
        principal: {
          principalId: 'ae:server-function',
          ownerId: 'ae:server-function',
          credentialId: 'ae:server-function',
          scopes: ['market_supply:manage'],
        },
        issuedAt: 2_000_000,
      })
      await expect(fixture.owner.mutation(
        api.capabilityProviderConnections.prepareOwnerMcpRuntimeForServer,
        { ...runtimeCommand, serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] } },
      )).resolves.toMatchObject({
        kind: 'available',
        connection: {
          connectionRef: finalized.connection.connectionRef,
          businessRef: String(fixture.businessId),
          sourceUrl: 'https://mcp.provider.example/mcp',
          secretRef: prepared.secretRef,
          activeGeneration: 'sgn_00000000000040008000000000000072',
          pointerRevision: 2,
          rotationAuthority: {
            operation: 'rotate',
            accountRef: fixture.canonicalAccountRef,
            actorPrincipalRef: fixture.canonicalPrincipalRef,
          },
        },
      })
    } finally {
      vi.useRealTimers()
      if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
      else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
    }
  })
})
