/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  type DynamicPublishedInvocationResult,
} from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import schema from '../../../convex/schema'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const IndexSchema = z.object({
  indexDescriptor: z.string(),
  fields: z.array(z.string()),
})

const SearchIndexSchema = z.object({
  indexDescriptor: z.string(),
  searchField: z.string(),
  filterFields: z.array(z.string()),
})

const TableSchema = z.object({
  tableName: z.string(),
  indexes: z.array(IndexSchema),
  searchIndexes: z.array(SearchIndexSchema).optional(),
})

const SchemaExport = z.object({
  tables: z.array(TableSchema),
})

const durableTables = [
  'principals',
  'accounts',
  'accountOwnerships',
  'memberships',
  'accountRecoveryParticipantApprovals',
  'accountSuccessionAuthorizations',
  'accountSuccessionAuthorizationParticipants',
  'externalIdentityBindings',
  'credentials',
  'authorityDelegationGrants',
  'authorityDelegationSnapshots',
  'authorityDelegationSnapshotAncestors',
  'connections',
  'connectionShares',
  'connectionLeases',
  'connectionEffectAdmissions',
  'connectionLifecycleCommands',
  'secretPointers',
  'secretPointerCommands',
  'owners',
  'businesses',
  'businessOfferings',
  'businessOfferingRevisions',
  'offeringAccessPaths',
  'moneyAccounts',
  'moneyLedgerEntries',
  'moneyTransactions',
  'moneyCredentialBudgetStates',
  'moneyUsageEvents',
  'moneyCredentialUsageSummaries',
  'moneyExternalSpendReservations',
  'moneyX402PaymentAttempts',
  'moneyTopupCommands',
  'moneyStripeEvents',
  'moneyPayoutAccounts',
  'moneyPayouts',
  'moneyPayoutAllocations',
  'qualifiedUseReceipts',
  'capabilityContractDocuments',
  'capabilityOfferings',
  'capabilityOperationInvocations',
  'capabilityPublications',
  'capabilityTransportBindings',
  'capabilityProviderConnections',
  'capabilityProviderConnectionLeases',
  'capabilityProviderApprovals',
  'registeredOperationMappings',
  'agentAccessGrants',
  'agentAccessPrincipals',
  'agentAccessOAuthGrants',
  'agentAccessOAuthClients',
  'operationKeys',
  'sourceWriteNonces',
  'adminMemberships',
  'adminMembershipAuditEvents',
  'auditEvents',
  'registrySearchDocuments',
  'disputes',
  'chatThreads',
  'chatThreadShares',
  'actionInvocationControls',
  'actionInvocationAttempts',
  'actionInvocationHistory',
  'marketActiveOperations',
  'marketActiveSuppliers',
  'marketAggregateBackfills',
  'marketEvidenceFacts',
  'marketExternalRegistryEntries',
  'marketExternalRegistryGenerations',
  'marketExternalRegistryState',
  'marketExternalSnapshots',
  'marketOperationCategories',
  'marketOperationRatings',
] as const

const requiredIndexes = {
  principals: ['by_principalRef', 'by_kind_and_lifecycle', 'by_lifecycle_and_updatedAt'],
  accounts: [
    'by_accountRef',
    'by_creationActorPrincipalRef_and_creationIdempotencyRef',
    'by_lifecycle_and_updatedAt',
  ],
  accountOwnerships: [
    'by_ownershipRef',
    'by_accountRef_and_lifecycle',
    'by_ownerPrincipalRef_and_lifecycle',
    'by_accountRef_and_ownerPrincipalRef_and_lifecycle',
  ],
  memberships: [
    'by_membershipRef',
    'by_accountRef_and_lifecycle',
    'by_memberPrincipalRef_and_lifecycle',
    'by_accountRef_and_memberPrincipalRef_and_lifecycle',
  ],
  accountRecoveryParticipantApprovals: [
    'by_approvalRef',
    'by_accountRef_and_lifecycle',
    'by_participantPrincipalRef_and_lifecycle',
  ],
  accountSuccessionAuthorizations: [
    'by_authorizationRef',
    'by_accountRef_and_lifecycle',
    'by_accountRef_and_successorOwnerPrincipalRef_and_lifecycle',
  ],
  accountSuccessionAuthorizationParticipants: [
    'by_authorizationRef',
    'by_accountRef_and_createdAt',
    'by_participantPrincipalRef_and_createdAt',
  ],
  externalIdentityBindings: [
    'by_bindingRef',
    'by_providerNamespace_and_providerIdentifier',
    'by_principalRef_and_lifecycle',
    'by_principalRef_and_bindIdempotencyRef',
  ],
  credentials: [
    'by_credentialRef',
    'by_bindingRef_and_generation_and_lifecycle',
    'by_principalRef_and_lifecycle',
    'by_principalRef_and_issueIdempotencyRef',
    'by_predecessorCredentialRef',
  ],
  authorityDelegationGrants: [
    'by_grantRef',
    'by_subjectPrincipalRef_and_lifecycle',
    'by_accountRef_and_actorPrincipalRef_and_createdBy_idempotencyRef',
  ],
  authorityDelegationSnapshots: [
    'by_snapshotRef',
    'by_accountRef_and_actorPrincipalRef_and_idempotencyRef',
  ],
  authorityDelegationSnapshotAncestors: ['by_snapshotRef_and_position'],
  connections: [
    'by_connectionRef',
    'by_owningAccountRef_and_installAction_idempotencyRef',
  ],
  connectionShares: [
    'by_shareRef',
    'by_connectionRef_and_granteeAccountRef_and_lifecycle',
    'by_owningAccountRef_and_action_idempotencyRef',
  ],
  connectionLeases: [
    'by_leaseRef',
    'by_activeAccountRef_and_action_idempotencyRef',
  ],
  connectionEffectAdmissions: [
    'by_effectRef',
    'by_activeAccountRef_and_action_idempotencyRef',
  ],
  connectionLifecycleCommands: [
    'by_action_activeAccountRef_and_action_idempotencyRef',
  ],
  secretPointers: ['by_secretRef'],
  secretPointerCommands: [
    'by_accountRef_and_idempotencyRef',
    'by_secretRef_and_newRevision',
  ],
  moneyAccounts: ['by_accountRef', 'by_accountId_and_currency', 'by_businessId_and_currency'],
  moneyLedgerEntries: [
    'by_transactionRef',
    'by_accountRef_and_createdAt',
    'by_principalId_and_createdAt',
    'by_businessId_and_createdAt',
    'by_payoutRef_and_allocationRef',
  ],
  moneyTransactions: ['by_idempotencyKey', 'by_transactionRef', 'by_principalId_and_createdAt', 'by_externalRef', 'by_reversalOf'],
  moneyCredentialBudgetStates: ['by_principal_credential_env_generation_window', 'by_credentialId_and_environment_and_generation_and_windowKind'],
  moneyX402PaymentAttempts: [
    'by_attemptRef_and_effectGeneration',
    'by_custodyRef',
    'by_authorizationDigest',
    'by_paymentIdentifier',
  ],
  moneyUsageEvents: ['by_principalId_and_credentialId_and_currency_and_observedAt', 'by_businessId_and_observedAt', 'by_invocationRef', 'by_usageRef'],
  moneyCredentialUsageSummaries: ['by_principalId_and_credentialId_and_currency'],
  moneyTopupCommands: ['by_commandRef', 'by_idempotencyKey', 'by_externalRef'],
  moneyStripeEvents: ['by_stripeEventId'],
  moneyPayoutAccounts: ['by_businessId_and_currency', 'by_stripeAccountId'],
  moneyPayouts: ['by_businessId_and_currency_and_state', 'by_businessId_and_currency_and_state_and_updatedAt', 'by_periodStart_and_state', 'by_stripeTransferId', 'by_payoutRef', 'by_businessId_and_currency_and_updatedAt', 'by_businessId_and_currency_and_cadence_and_updatedAt'],
  moneyPayoutAllocations: ['by_allocationRef', 'by_qualifiedUseRef', 'by_transactionRef', 'by_payoutRef_and_qualifiedAt', 'by_businessId_and_currency_and_qualifiedAt'],
  qualifiedUseReceipts: ['by_qualifiedUseRef', 'by_businessId_and_qualifiedAt', 'by_invocationRef', 'by_operationRef_and_qualifiedAt'],
  owners: [
    'by_canonicalAccountRef',
    'by_canonicalPrincipalRef',
    'by_canonicalPrincipalRef_and_canonicalAccountRef',
    'by_clerkUserId',
  ],
  businesses: ['by_slug', 'by_owner_updatedAt', 'by_publicStatus_slug'],
  businessOfferings: ['by_offeringRef', 'by_businessId_and_status'],
  businessOfferingRevisions: ['by_offeringRef_and_revision', 'by_businessId_and_createdAt'],
  offeringAccessPaths: [
    'by_accessPathRef',
    'by_offeringRef_and_status',
    'by_offeringRef_and_offeringRevision',
    'by_businessId_and_status',
  ],
  operationKeys: ['by_actor_operation_key', 'by_scope_key'],
  adminMemberships: [
    'by_clerkUserId_and_state',
    'by_tokenIdentifier_and_state',
    'by_state_and_role',
  ],
  adminMembershipAuditEvents: ['by_auditEventId'],
  auditEvents: ['by_eventId'],
  registrySearchDocuments: ['by_documentId', 'by_business', 'by_offering', 'by_publicStatus_updatedAt'],
  disputes: ['by_business_status'],
  capabilityOperationInvocations: ['by_invocationRef', 'by_credentialId_and_idempotencyKey', 'by_credentialId_and_createdAt', 'by_credentialId_and_state', 'by_credentialId_and_state_and_grantExpiresAt', 'by_principalId_and_invocationRef', 'by_ownerId_and_state_and_createdAt'],
  capabilityProviderConnectionLeases: [
    'by_leaseRef',
    'by_canonicalLeaseRef',
    'by_connectionRef_and_state',
    'by_invocationRef',
    'by_connectionRef_and_authorityGeneration',
  ],
  agentAccessGrants: [
    'by_grantRef',
    'by_principalId',
    'by_credentialId_and_environment_and_generation',
    'by_credentialId_and_environment_and_lifecycle',
    'by_ownerId_and_updatedAt',
  ],
  agentAccessPrincipals: [
    'by_principalId',
    'by_credentialId',
    'by_ownerId',
    'by_ownerId_and_lastSeenAt',
    'by_ownerId_and_lifecycle',
    'by_credentialId_and_lifecycle',
  ],
  agentAccessOAuthGrants: [
    'by_grantRef',
    'by_deviceCodeHash',
    'by_userCodeHash',
    'by_authorizationCodeHash',
    'by_clientId_and_status',
    'by_status_and_expiresAt',
  ],
  agentAccessOAuthClients: ['by_clientId'],
  capabilityContractDocuments: ['by_capabilityId_and_version', 'by_status_and_capabilityId_and_version'],
  capabilityPublications: [
    'by_publicationRef_and_revision',
    'by_operationRef_and_disposition',
    'by_networkId_and_disposition',
    'by_businessId_and_disposition',
    'by_bindingId_and_disposition',
  ],
  capabilityOfferings: [
    'by_offeringId',
    'by_businessId_and_status',
    'by_networkId_status_capabilityId_version_contractDigest',
  ],
  capabilityTransportBindings: [
    'by_bindingId',
    'by_offeringId_and_admission_and_conformance',
    'by_networkId_admission_conformance',
  ],
  capabilityProviderConnections: [
    'by_connectionRef',
    'by_canonicalConnectionRef',
    'by_businessId_and_lifecycle',
    'by_providerRef_and_lifecycle',
    'by_connectionRef_and_authorityGeneration',
  ],
  capabilityProviderApprovals: [
    'by_decisionRef',
    'by_commandId',
    'by_connectionRef_and_authorityGeneration',
  ],
  registeredOperationMappings: ['by_networkId_and_mappingRef'],
} satisfies Record<string, readonly string[]>

describe('Convex schema', () => {
  const exportSchema = Reflect.get(schema, 'export')
  if (typeof exportSchema !== 'function') {
    throw new Error('Convex schema export function is unavailable')
  }
  const exported = SchemaExport.parse(JSON.parse(String(exportSchema.call(schema))))

  it('contains exactly the source-owned durable tables', () => {
    expect(durableTables).toHaveLength(73)
    expect(exported.tables.map((table) => table.tableName).sort()).toEqual([...durableTables].sort())
  })

  it('defines every required source-owned index', () => {
    const tableIndexes = Object.fromEntries(
      exported.tables.map((table) => [table.tableName, table.indexes.map((index) => index.indexDescriptor)])
    )

    for (const [tableName, indexes] of Object.entries(requiredIndexes)) {
      if (tableName === 'moneyPayoutAllocations')
        expect(tableIndexes[tableName]).toEqual(indexes)
      else expect(tableIndexes[tableName]).toEqual(expect.arrayContaining(indexes))
    }
  })

  it('accepts and indexes canonical durable admin authority records', async () => {
    const backend = convexTest(schema, convexModules)
    const result = await backend.run(async (ctx) => {
      await ctx.db.insert('adminMemberships', {
        clerkUserId: 'user_owner',
        tokenIdentifier: 'clerk|user_owner',
        role: 'owner_admin',
        state: 'active',
        grantedBy: 'bootstrap:user_owner',
        grantedAt: 1,
        evidenceRef: 'evidence:bootstrap',
      })
      await ctx.db.insert('adminMembershipAuditEvents', {
        auditEventId: 'audit:admin.membership_bootstrapped:user_owner',
        eventType: 'membership_bootstrapped',
        actorRef: 'user_owner',
        targetRef: 'user_owner',
        reasonCode: 'authorized_bootstrap',
        evidenceRefs: ['evidence:bootstrap'],
        operationKey: 'operation:bootstrap:user_owner',
        correlationId: 'correlation:bootstrap:user_owner',
        createdAt: 1,
      })
      await ctx.db.insert('auditEvents', {
        eventId: 'audit:admin.membership_bootstrapped:user_owner',
        eventType: 'admin.membership_bootstrapped',
        actorKind: 'admin',
        actorRef: 'user_owner',
        targetType: 'admin_membership',
        targetRef: 'user_owner',
        idempotencyKey: 'operation:bootstrap:user_owner',
        correlationId: 'correlation:bootstrap:user_owner',
        reasonCode: 'authorized_bootstrap',
        evidenceRefs: ['evidence:bootstrap'],
        redactedPayloadJson: '{}',
        payloadHash: 'hash:bootstrap:user_owner',
        createdAt: 1,
      })

      const membership = await ctx.db
        .query('adminMemberships')
        .withIndex('by_tokenIdentifier_and_state', (query) =>
          query.eq('tokenIdentifier', 'clerk|user_owner').eq('state', 'active')
        )
        .unique()
      const membershipAudit = await ctx.db
        .query('adminMembershipAuditEvents')
        .withIndex('by_auditEventId', (query) =>
          query.eq('auditEventId', 'audit:admin.membership_bootstrapped:user_owner')
        )
        .unique()
      const audit = await ctx.db
        .query('auditEvents')
        .withIndex('by_eventId', (query) =>
          query.eq('eventId', 'audit:admin.membership_bootstrapped:user_owner')
        )
        .unique()

      return {
        membershipRole: membership?.role,
        membershipAuditType: membershipAudit?.eventType,
        auditType: audit?.eventType,
      }
    })

    expect(result).toEqual({
      membershipRole: 'owner_admin',
      membershipAuditType: 'membership_bootstrapped',
      auditType: 'admin.membership_bootstrapped',
    })
  })
  it('pins the new ledger and payout index field order', () => {
    const index = (tableName: string, indexDescriptor: string) =>
      exported.tables
        .find((table) => table.tableName === tableName)
        ?.indexes.find((item) => item.indexDescriptor === indexDescriptor)

    expect(index('moneyLedgerEntries', 'by_payoutRef_and_allocationRef')).toEqual({
      indexDescriptor: 'by_payoutRef_and_allocationRef',
      fields: ['payoutRef', 'allocationRef'],
    })
    expect(
      index(
        'moneyPayouts',
        'by_businessId_and_currency_and_cadence_and_updatedAt',
      ),
    ).toEqual({
      indexDescriptor: 'by_businessId_and_currency_and_cadence_and_updatedAt',
      fields: ['businessId', 'currency', 'cadence', 'updatedAt'],
    })
  })
  it('accepts optional payout and allocation linkage on canonical refund ledger rows', async () => {
    const backend = convexTest(schema, convexModules)
    const rows = await backend.run(async (ctx) => {
      const linkedId = await ctx.db.insert('moneyLedgerEntries', {
        entryRef: 'refund:linked',
        accountRef: 'provider:business:USD',
        entryType: 'refund',
        direction: 'debit',
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        transactionRef: 'transaction:refund:linked',
        idempotencyKey: 'refund:linked',
        payoutRef: 'payout:daily',
        allocationRef: 'allocation:daily',
        allocationCorrectionUnits: '1',
        sourceDigest: 'sha256:refund',
        evidenceRefs: [],
        reversalOf: 'transaction:charge',
        createdAt: 1,
      })
      const unlinkedId = await ctx.db.insert('moneyLedgerEntries', {
        entryRef: 'refund:unlinked',
        accountRef: 'provider:business:USD',
        entryType: 'refund',
        direction: 'debit',
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        transactionRef: 'transaction:refund:unlinked',
        idempotencyKey: 'refund:unlinked',
        sourceDigest: 'sha256:refund',
        evidenceRefs: [],
        reversalOf: 'transaction:charge',
        createdAt: 2,
      })
      return {
        linked: await ctx.db.get(linkedId),
        unlinked: await ctx.db.get(unlinkedId),
      }
    })
    expect(rows.linked).toMatchObject({
      payoutRef: 'payout:daily',
      allocationRef: 'allocation:daily',
      allocationCorrectionUnits: '1',
    })
    expect(rows.unlinked).not.toHaveProperty('payoutRef')
    expect(rows.unlinked).not.toHaveProperty('allocationRef')
    expect(rows.unlinked).not.toHaveProperty('allocationCorrectionUnits')
  })

  it('defines the public registry search-document index used by Convex search', () => {
    const registrySearchDocuments = exported.tables.find(
      (table) => table.tableName === 'registrySearchDocuments',
    )

    expect(registrySearchDocuments?.searchIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexDescriptor: 'search_searchText_by_publicStatus',
          searchField: 'searchText',
          filterFields: ['publicStatus'],
        }),
      ]),
    )
  })


  it('refuses the obsolete aggregate registry search document envelope after the per-Offering cutover', async () => {
    const backend = convexTest(schema, convexModules)
    const businessId = await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('owners', {
        clerkUserId: 'user_registry_schema_compatibility',
        createdAt: 1_784_764_800_000,
        updatedAt: 1_784_764_800_000,
      })
      return ctx.db.insert('businesses', {
        ownerId,
        slug: 'sandbox-phase5-web-starter',
        name: 'Phase 5 Demo Website Starter',
        normalizedName: 'phase 5 demo website starter',
        category: 'Website development',
        businessContext: {
          kind: 'local_human',
          suburb: 'Perth',
          stateTerritory: 'WA',
        },
        publicStatus: 'published',
        trustTier: 'listed',
        sourceHash: 'hash:business',
        createdAt: 1_784_764_800_000,
        updatedAt: 1_784_764_800_000,
      })
    })
    const observedAt = 1_784_764_800_000
    const document = {
      businessCategory: 'Website development',
      businessId,
      businessName: 'Phase 5 Demo Website Starter',
      businessSlug: 'sandbox-phase5-web-starter',
      documentId: 'offering-v2__mx70wew6em0t0jwp35zsv4thd58b2fj4',
      generatedHash: 'hash:6643888a',
      observedAt,
      offerings: [{
        category: 'Website development',
        comparison: {
          profile: {
            priceBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: {
                amount: {
                  currency: 'AUD',
                  units: '85000',
                  exponent: 2,
                },
                description: 'Labelled demo fixed scope',
                unit: 'total',
              },
            },
            profileId: 'professional_service:v1',
            scopeBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'Five-page website, contact form, and launch handover',
            },
            serviceArea: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'Perth and remote',
            },
            timingBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'About three weeks after content is ready',
            },
          },
          schemaVersion: 'offering-comparison:v1',
        },
        name: 'Labelled demo website starter',
        offeringRef: 'offering:phase5-demo:website-starter:v1',
        revision: 1,
        summary: 'A labelled demonstration of a small-business website delivery option.',
      }],
      placeKeys: ['perth', 'perth and remote', 'perth wa', 'wa'],
      publicStatus: 'published',
      schemaVersion: 'registry-search-document:v2',
      searchText: 'phase 5 demo website starter',
      sourceDigest: 'hash:7ce338ec',
      sourceRevision: observedAt + 500,
      stateTerritory: 'WA',
      suburb: 'Perth',
      updatedAt: observedAt,
    } as const

    await expect(backend.run(async (ctx) => {
      await ctx.db.insert('registrySearchDocuments', document as never)
    })).rejects.toThrow()
  })

  it('validates current action invocation attempts and rejects removed legacy messages', async () => {
    const backend = convexTest(schema, convexModules)
    const currentAttempt = {
      invocationRef: 'invocation:schema-regression',
      attemptRef: 'attempt:current',
      attemptNumber: 1,
      effectGeneration: 1,
      actor: { callerRef: 'caller:schema-regression', principalRef: 'principal:schema-regression' },
      idempotency: {
        operationKey: 'operation:schema-regression',
        materialInputDigest: 'digest:schema-regression',
        effectIdentity: 'effect:schema-regression',
      },
      lease: { owner: 'worker:schema-regression', expiresAt: '2026-08-02T00:00:00.000Z' },
      release: { state: 'not_released' },
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        errorDigest: 'digest:schema-regression',
        reconciliationRequiredAt: '2026-08-02T00:00:00.000Z',
      },
      recordedAt: '2026-08-02T00:00:00.000Z',
    } as const
    const legacyAttempt = {
      ...currentAttempt,
      attemptRef: 'attempt:legacy-message',
      outcome: {
        ...currentAttempt.outcome,
        message: 'removed raw error message',
      },
    } as const

    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationAttempts', legacyAttempt as never)
    ))).rejects.toThrow()
    await backend.run(async (ctx) => {
      await ctx.db.insert('actionInvocationAttempts', currentAttempt)
    })
    const row = await backend.run(async (ctx) => (
      ctx.db.query('actionInvocationAttempts').unique()
    ))
    expect(row).toEqual(expect.objectContaining({
      outcome: currentAttempt.outcome,
    }))
    expect(row?.outcome).not.toHaveProperty('message')
  })
  it('validates current action invocation controls and rejects removed legacy shapes', async () => {
    const backend = convexTest(schema, convexModules)
    const acceptedAuthority = {
      kind: 'approve_each',
      authorityRef: 'authority:schema-regression',
    } as const
    const control = {
      invocationRef: 'invocation:schema-regression:current',
      invocationVersion: 1,
      origin: {
        kind: 'standalone',
        callerRef: 'caller:schema-regression',
        principalRef: 'principal:schema-regression',
      },
      owner: { callerRef: 'caller:schema-regression', principalRef: 'principal:schema-regression' },
      action: { id: 'schema.regression', contractVersion: '1' },
      desired: { state: 'invoke' },
      authority: {
        reference: 'authority:schema-regression',
        expiresAt: '2026-08-02T00:00:00.000Z',
      },
      freshness: { state: 'current', observedAt: '2026-08-02T00:00:00.000Z' },
      control: { state: 'authorized', decidedAt: '2026-08-02T00:00:00.000Z' },
      acceptedAuthority,
    } as const
    const currentControl = {
      invocationRef: control.invocationRef,
      invocationVersion: 1,
      control,
      sourceRef: 'source:schema-regression:current',
      authorityReference: 'authority:schema-regression',
      authorityDecisionAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    } as const
    const { acceptedAuthority: removedAuthority, ...legacyInnerControl } = control
    const legacyControl = {
      ...currentControl,
      invocationRef: 'invocation:schema-regression:legacy',
      control: {
        ...legacyInnerControl,
        invocationRef: 'invocation:schema-regression:legacy',
      },
      acceptedAuthority: removedAuthority,
    } as const
    const malformedGatheringControl = {
      ...currentControl,
      invocationRef: 'invocation:schema-regression:malformed-gathering',
      control: {
        ...currentControl.control,
        invocationRef: 'invocation:schema-regression:malformed-gathering',
        control: { state: 'gathering_information', missingFields: 'convert' },
      },
    } as const

    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', legacyControl as never)
    ))).rejects.toThrow()
    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', malformedGatheringControl as never)
    ))).rejects.toThrow()

    await backend.run(async (ctx) => {
      await ctx.db.insert('actionInvocationControls', currentControl)
    })
    const row = await backend.run(async (ctx) => (
      ctx.db.query('actionInvocationControls').unique()
    ))
    expect(row).toEqual(expect.objectContaining({
      control: expect.objectContaining({ acceptedAuthority }),
    }))
    expect(row).not.toHaveProperty('acceptedAuthority')
  })
  it('validates current begin and answer gathering-information writes', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const now = fixture.operation.readiness.observedAt + 1_000
    const actor = { callerRef: 'caller:schema-input', principalRef: 'principal:schema-input' }
    const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
    const adapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: createDevelopmentDynamicPublishedSource([fixture.operation]),
      runtime: {
        send: async () => { throw new Error('schema regression must not execute transport') },
        resolveCredential: () => undefined,
      },
      now: () => now,
      nextInvocationRef: () => 'invocation:schema-input',
      nextAuthorityRef: () => 'authority:schema-input',
      nextAttemptRef: () => 'attempt:schema-input',
      paymentAttemptPort: createInMemoryX402PaymentAttemptPort(),
      durablePort: createDevelopmentDurablePort(durableState),
      developmentSnapshot: durableState,
    })
    const origin = { kind: 'standalone' as const, ...actor }

    const began = await adapter.begin({ origin, actor, partial: {} })
    expect(began.state).toBe('gathering_information')
    const beginControl = adapter.exportDevelopmentSnapshot().controls.find(
      ({ invocationRef }) => invocationRef === began.invocationRef,
    )
    if (beginControl === undefined) throw new Error('begin control was not persisted')
    const toConvexControlRow = (row: Exclude<typeof beginControl, undefined>) => {
      const { control } = row
      const state = control.control
      if (state.state !== 'gathering_information') {
        throw new Error('expected gathering-information control')
      }
      return {
        invocationRef: row.invocationRef,
        invocationVersion: row.invocationVersion,
        sourceRef: row.sourceRef,
        control: {
          invocationRef: control.invocationRef,
          invocationVersion: control.invocationVersion,
          origin: control.origin,
          owner: control.owner,
          action: control.action,
          desired: control.desired,
          ...(control.authority === undefined ? {} : { authority: control.authority }),
          ...(control.acceptedAuthority === undefined ? {} : { acceptedAuthority: control.acceptedAuthority }),
          freshness: control.freshness,
          control: {
            state: 'gathering_information' as const,
            missingFields: [...state.missingFields],
          },
        },
        ...(row.sourceResultRef === undefined ? {} : { sourceResultRef: row.sourceResultRef }),
        ...(row.sourceResultDigest === undefined ? {} : { sourceResultDigest: row.sourceResultDigest }),
        ...(row.terminalBusinessOutcome === undefined ? {} : { terminalBusinessOutcome: row.terminalBusinessOutcome }),
        ...(row.terminalResultReferenceable === undefined ? {} : { terminalResultReferenceable: row.terminalResultReferenceable }),
        ...(row.preparedMaterialDigest === undefined ? {} : { preparedMaterialDigest: row.preparedMaterialDigest }),
        ...(row.preparedTargetDigest === undefined ? {} : { preparedTargetDigest: row.preparedTargetDigest }),
        ...(row.consequence === undefined ? {} : { consequence: row.consequence }),
        ...(row.dataLimitSummary === undefined ? {} : { dataLimitSummary: row.dataLimitSummary }),
        ...(row.authorityBinding === undefined ? {} : { authorityBinding: row.authorityBinding }),
        ...(row.authorityDecisionAt === undefined ? {} : { authorityDecisionAt: row.authorityDecisionAt }),
        ...(row.currentAttemptRef === undefined ? {} : { currentAttemptRef: row.currentAttemptRef }),
        ...(row.currentEffectGeneration === undefined ? {} : { currentEffectGeneration: row.currentEffectGeneration }),
        ...(row.currentLeaseOwner === undefined ? {} : { currentLeaseOwner: row.currentLeaseOwner }),
        ...(row.currentLeaseExpiresAt === undefined ? {} : { currentLeaseExpiresAt: row.currentLeaseExpiresAt }),
        updatedAt: row.updatedAt,
      }
    }
    const controlId = await backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', toConvexControlRow(beginControl))
    ))

    const answered = await adapter.answer({
      invocationRef: began.invocationRef,
      actor,
      answers: { symbol: 'BTC' },
      freshnessMs: 30_000,
    })
    if (!('state' in answered) || answered.state !== 'gathering_information') {
      throw new Error('answer should remain in gathering state')
    }
    const answerControl = adapter.exportDevelopmentSnapshot().controls.find(
      ({ invocationRef }) => invocationRef === began.invocationRef,
    )
    if (answerControl === undefined) throw new Error('answer control was not persisted')
    await backend.run(async (ctx) => {
      await ctx.db.replace(controlId, toConvexControlRow(answerControl))
    })

    const persisted = await backend.run(async (ctx) => ctx.db.get(controlId))
    expect(persisted?.control.control).toEqual({
      state: 'gathering_information',
      missingFields: ['convert'],
    })
    expect(persisted?.invocationVersion).toBe(2)
  })
})
