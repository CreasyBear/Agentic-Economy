/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { readAdminAgentView } from '../../../convex/lib/adminConsole/reads/agent'
import { readAdminToolVersionView } from '../../../convex/lib/adminConsole/reads/toolVersion'
import { readAdminWorkspaceView } from '../../../convex/lib/adminConsole/reads/workspace'
import { accountRef } from '@/modules/principal-account/account/public'
import { principalRef } from '@/modules/principal-account/principal/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}')).map(([path, module]) => [
    path.replace('../../../convex/', './'),
    module,
  ]),
)

const ACCOUNT_REF = accountRef('acc_00000000000000000000000000000001')
const PRINCIPAL_REF = principalRef('prn_00000000000000000000000000000001')
const MEMBER_REF = principalRef('prn_00000000000000000000000000000002')
const TOOL_REF_VALUE = `operation:v1:${'a'.repeat(64)}`
if (!isPublicToolRef(TOOL_REF_VALUE)) throw new Error('test_tool_ref_invalid')
const TOOL_REF = TOOL_REF_VALUE
const CALL_REF = `operation-invocation:v1:${'b'.repeat(64)}`
const NOW = Date.UTC(2026, 8, 22, 1)

const actionContext = {
  actorPrincipalRef: PRINCIPAL_REF,
  activeAccountRef: ACCOUNT_REF,
  correlationRef: 'correlation:admin-view-test',
  idempotencyRef: 'idempotency:admin-view-test',
}

function deepKeys(value: unknown): readonly string[] {
  if (value === null || typeof value !== 'object') return []
  return [
    ...Object.keys(value),
    ...Object.values(value).flatMap((child) => deepKeys(child)),
  ]
}

describe('admin object view redaction', () => {
  it('projects Workspace, Agent, and Tool version views without PII or credential material', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: PRINCIPAL_REF,
        kind: 'agent',
        displayName: 'private-agent@example.com',
        lifecycle: 'active',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      })
      await ctx.db.insert('accounts', {
        accountRef: ACCOUNT_REF,
        displayName: 'Private Workspace',
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: PRINCIPAL_REF,
        creationIdempotencyRef: 'account:create:test',
        initialOwnershipRef: 'own_00000000000000000000000000000001',
        currentOwnershipRef: 'own_00000000000000000000000000000001',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        lastAction: actionContext,
      })
      await ctx.db.insert('memberships', {
        membershipRef: 'mem_00000000000000000000000000000001',
        accountRef: ACCOUNT_REF,
        memberPrincipalRef: PRINCIPAL_REF,
        role: 'org:admin',
        lifecycle: 'active',
        revision: 1,
        createdAt: NOW,
        createdBy: actionContext,
      })
      await ctx.db.insert('memberships', {
        membershipRef: 'mem_00000000000000000000000000000002',
        accountRef: ACCOUNT_REF,
        memberPrincipalRef: MEMBER_REF,
        role: 'org:member',
        lifecycle: 'active',
        revision: 1,
        createdAt: NOW,
        createdBy: actionContext,
      })
      await ctx.db.insert('accountExternalOrganizationBindings', {
        bindingRef: 'binding:private@example.com',
        accountRef: ACCOUNT_REF,
        providerNamespace: 'clerk/organization',
        providerIdentifier: 'org_private@example.com',
        lifecycle: 'active',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      })
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: PRINCIPAL_REF,
        ownerId: ACCOUNT_REF,
        ownerTokenIdentifier: 'private-token@example.com',
        credentialId: 'credential:private-secret',
        applicationRef: 'application:test',
        environment: 'sandbox',
        scopes: ['operations:invoke'],
        authorityMode: 'spending_policy',
        grantGeneration: 1,
        spendingPolicyDigest: 'sha256:private-hash',
        lifecycle: 'active',
        recordedAt: NOW,
        lastSeenAt: NOW,
      })
      await ctx.db.insert('agentAccessGrants', {
        format: 'ae.agent-access-grant:v2',
        grantRef: 'grant:admin-view-test',
        principalId: PRINCIPAL_REF,
        ownerId: ACCOUNT_REF,
        applicationRef: 'application:test',
        credentialId: 'credential:private-secret',
        environment: 'sandbox',
        authorityMode: 'spending_policy',
        budgetPolicyRef: 'budget:admin-view-test',
        ratePolicyRef: 'rate:admin-view-test',
        lifecycle: 'active',
        generation: 1,
        spendingPolicyDigest: 'sha256:private-hash',
        createdAt: NOW,
        updatedAt: NOW,
        expiresAt: NOW + 60_000,
        toolAccess: 'all_admitted',
        toolRefs: [],
        spendingPolicy: {
          format: 'ae.agent-access-policy:v2',
          toolAccess: 'all_admitted',
          toolRefs: [],
          environment: 'sandbox',
          budget: {
            budgetPolicyRef: 'budget:admin-view-test',
            generation: 1,
            currency: 'AUD',
            exponent: 2,
            maximumSpendPerCall: { currency: 'AUD', units: '100', exponent: 2 },
            maximumDailySpend: { currency: 'AUD', units: '1000', exponent: 2 },
            maximumMonthlySpend: { currency: 'AUD', units: '10000', exponent: 2 },
            maximumConcurrentCalls: 2,
          },
          rate: {
            ratePolicyRef: 'rate:admin-view-test',
            generation: 1,
            maximumCallsPerMinute: 2,
            maximumCallsPerHour: 20,
          },
        },
      })
      await ctx.db.insert('capabilityCalls', {
        callRef: CALL_REF,
        principalId: PRINCIPAL_REF,
        ownerId: ACCOUNT_REF,
        credentialId: 'credential:private-secret',
        applicationRef: 'application:test',
        toolRef: TOOL_REF,
        idempotencyKey: 'idempotency:call:test',
        environment: 'sandbox',
        grantRef: 'grant:admin-view-test',
        grantGeneration: 1,
        policyDigest: 'sha256:private-hash',
        grantExpiresAt: NOW + 60_000,
        inputDigest: 'sha256:input',
        requestDigest: 'sha256:request',
        state: 'pending',
        updatedAt: NOW,
        createdAt: NOW,
      })
      const businessId = await ctx.db.insert('businesses', {
        owningAccountRef: ACCOUNT_REF,
        slug: 'private-provider',
        name: 'Private Provider',
        normalizedName: 'private provider',
        category: 'software',
        businessContext: {
          kind: 'programmable_provider',
          website: 'https://private.example.com',
          providerIdentifier: 'private@example.com',
        },
        publicStatus: 'published',
        trustTier: 'claimed',
        sourceHash: 'sha256:private-business-hash',
        createdAt: NOW,
        updatedAt: NOW,
      })
      const currentPublicationId = await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:admin-view-test',
        toolRef: TOOL_REF,
        revision: 3,
        businessId,
        networkId: 'base-sepolia',
        runtimeEnvironment: 'sandbox',
        capabilityId: 'capability:admin-view-test',
        version: 1,
        contractDigest: 'sha256:contract',
        sourceKind: 'openapi_http',
        sourceRevision: '1',
        sourceDigest: 'sha256:source',
        sourceAuthorityState: 'review_required',
        publisherRef: PRINCIPAL_REF,
        authorityMode: 'provider_owned',
        provenanceDigest: 'sha256:provenance',
        offeringId: 'offering:admin-view-test',
        bindingId: 'binding:admin-view-test',
        disposition: 'current',
        credentialState: 'ready',
        healthState: 'healthy',
        readinessValidUntil: NOW + 60_000,
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: [],
        createdAt: NOW,
        updatedAt: NOW,
      })
      const currentPublication = await ctx.db.get(currentPublicationId)
      if (currentPublication === null) throw new Error('current_publication_fixture_missing')
      const { _id, _creationTime, ...supersededPublication } = currentPublication
      void _id
      void _creationTime
      await ctx.db.insert('capabilityPublications', {
        ...supersededPublication,
        publicationRef: 'publication:admin-view-superseded',
        revision: 2,
        disposition: 'superseded',
        updatedAt: NOW - 1_000,
      })
      await ctx.db.insert('capabilityPublications', {
        ...supersededPublication,
        publicationRef: 'publication:admin-view-older-current',
        revision: 1,
        updatedAt: NOW + 1_000,
      })
      await ctx.db.insert('capabilitySupplyAdmissionCases', {
        caseRef: 'admission-case:admin-view-test',
        commandRef: 'command:admin-view-test',
        commandDigest: 'sha256:command',
        owningAccountRef: ACCOUNT_REF,
        businessId,
        providerRef: 'provider:admin-view-test',
        toolRef: TOOL_REF,
        toolVersion: 3,
        publicationRef: 'publication:admin-view-test',
        publicationRevision: 3,
        sourceKind: 'openapi_http',
        sourceDigest: 'sha256:source',
        sourceRevision: '1',
        sourceRouteRef: 'source-route:admin-view-test',
        sourceAuthorityState: 'review_required',
        contractDigest: 'sha256:contract',
        scheduledReadbackRefs: [],
        state: 'under_review',
        terminalDecision: 'pending',
        blockerRefs: [],
        evidenceRefs: [],
        submittedAt: NOW,
        reviewStartedAt: NOW,
        updatedAt: NOW,
      })
    })

    const views = await backend.run(async (ctx) => await Promise.all([
      readAdminWorkspaceView(ctx, ACCOUNT_REF),
      readAdminAgentView(ctx, PRINCIPAL_REF),
      readAdminToolVersionView(ctx, TOOL_REF),
    ]))

    expect(views).toMatchObject([
      { kind: 'workspace', ownerCount: 1, memberCount: 2, externalOrganizationBound: true, hasActiveSpendingPolicy: true },
      { kind: 'agent', credentialLifecycle: 'active', spendingPolicyRef: 'agent-access-grant:grant:admin-view-test', recentCallRefs: [CALL_REF] },
      { kind: 'tool_version', revision: 3, admissionCaseRef: 'admission-case:admin-view-test' },
    ])
    expect(JSON.stringify(views)).not.toContain('@')
    const forbidden = ['displayName', 'email', 'secretRef', 'tokenIdentifier', 'clerkUserId']
    expect(deepKeys(views).filter((key) => forbidden.includes(key))).toEqual([])
  })

  it('returns object_not_found for every absent object kind', async () => {
    const backend = convexTest(schema, convexModules)
    await expect(backend.run(async (ctx) => await Promise.all([
      readAdminWorkspaceView(ctx, ACCOUNT_REF),
      readAdminAgentView(ctx, PRINCIPAL_REF),
      readAdminToolVersionView(ctx, TOOL_REF),
    ]))).resolves.toEqual([
      { kind: 'object_not_found' },
      { kind: 'object_not_found' },
      { kind: 'object_not_found' },
    ])
  })
})
