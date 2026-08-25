import { convexTest, type TestConvex } from 'convex-test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { beginLeaseEffectHandler } from '../../../convex/capabilityProviderConnectionLeases'
import {
  abortProviderConsequenceHandler,
  authorizeProviderConsequenceX402RpcHandler,
  claimProviderConsequenceHandler,
  completeProviderConsequenceHandler,
  issueProviderConsequenceTicketHandler,
} from '../../../convex/capabilityProviderConsequenceJournal'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { issueProviderApprovalDecision } from '@/modules/capability-supply/provider-approval'
import {
  convexModules,
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const NOW = 2_000_000_000_000
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const JOURNAL_TOKEN = 'journal-token-never-persisted'
const TOKEN_DIGEST = canonicalDigest(JOURNAL_TOKEN)
const REQUEST_DIGEST = DIGEST('1')
const INVOCATION_DIGEST = DIGEST('2')
const CLAIMS_DIGEST = DIGEST('3')
const OPERATION_KEY_DIGEST = DIGEST('4')
const TICKET_REF = 'provider-ticket:test'
const EFFECT_REF = 'connection-effect:test'
const CLAIM_REF = `provider-claim:${TICKET_REF}`
const SECRET_REF = `sec_${'5'.repeat(32)}`
type Backend = TestConvex<typeof schema>
type CanonicalOwner = Readonly<{ principalRef: string; accountRef: string }>

async function canonicalOwner(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
): Promise<CanonicalOwner> {
  return await backend.run(async (ctx) => {
    const business = await ctx.db.get(businessId)
    if (business === null) throw new Error('business_missing')
    const owner = await ctx.db.get(business.ownerId)
    if (owner?.canonicalPrincipalRef === undefined || owner.canonicalAccountRef === undefined) {
      throw new Error('canonical_owner_missing')
    }
    return { principalRef: owner.canonicalPrincipalRef, accountRef: owner.canonicalAccountRef }
  })
}

async function grant(
  backend: ConvexFixtureBackend,
  owner: CanonicalOwner,
  suffix: string,
  scopes: readonly string[],
  resources: readonly string[],
) {
  const grantRef = `grt_${suffix.repeat(32)}`
  const expiresAt = NOW + 300_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      subjectPrincipalRef: owner.principalRef,
      scopes: [...scopes].sort(),
      resourceRefs: [...resources].sort(),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: NOW - 1_000,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${grantRef}`,
        idempotencyRef: `create:${grantRef}`,
      },
    })
  })
  return { grantRef, expiresAt }
}

async function freshIssueAuthority() {
  const backend = convexTestWithMarketComponents()
  const fixture = await publishedBusinessOwner(backend, 'provider-consequence-journal')
  const owner = await canonicalOwner(backend, fixture.businessId)
  const providerNamespace = 'capability-provider/http-json:v1'
  const providerAccountRef = 'account:journal'
  await grant(backend, owner, 'a', ['connection:install'], [
    `connection-provider:${providerNamespace}`,
    `connection-provider:${providerNamespace}:${providerAccountRef}`,
    `secret:${SECRET_REF}`,
  ])
  const installed = await backend.mutation(internal.capabilityProviderConnections.create, {
    commandId: 'command:install:journal',
    connectionRef: 'connection:journal',
    businessId: fixture.businessId,
    providerRef: 'provider:journal',
    providerAccountRef,
    adapterId: 'http-json:v1',
    credentialRef: SECRET_REF,
    requestedScopes: ['profile:read'],
    grantedScopes: ['profile:read'],
    requestedResources: [providerAccountRef],
    grantedResources: [providerAccountRef],
    evidenceRefs: ['evidence:install'],
    now: NOW,
  })
  if (installed.kind === 'refused' || installed.connection.canonicalConnectionRef === undefined) {
    throw new Error('canonical_install_failed')
  }
  const operationRef = 'operation:journal'
  const invocationRef = 'invocation:journal'
  const attemptRef = 'attempt:journal'
  const leaseGrant = await grant(backend, owner, 'b', [
    'connection:begin_effect',
    'connection:lease',
  ], [operationRef, `connection:${installed.connection.canonicalConnectionRef}`])
  const approval = issueProviderApprovalDecision({
    commandId: 'command:approval:journal',
    decisionRef: 'decision:approval:journal',
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    connectionRef: installed.connection.connectionRef,
    authorityGeneration: installed.connection.authorityGeneration,
    connectionAuthorityDigest: installed.connection.authorityDigest,
    requestedScopes: [...installed.connection.grantedScopes],
    grantedScopes: [...installed.connection.grantedScopes],
    requestedResources: [...installed.connection.grantedResources],
    grantedResources: [...installed.connection.grantedResources],
    decision: 'granted',
    decisionMakerAuthorityRef: 'authority:test',
    reasonCode: 'test',
    evidenceRefs: ['evidence:approval'],
  }, NOW, {
    connectionRef: installed.connection.connectionRef,
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    authorityGeneration: installed.connection.authorityGeneration,
    authorityDigest: installed.connection.authorityDigest,
  })
  if (approval.kind === 'refused') throw new Error(approval.code)
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityProviderApprovals', {
      ...approval.decision,
      requestedScopes: [...approval.decision.requestedScopes],
      grantedScopes: [...approval.decision.grantedScopes],
      requestedResources: [...approval.decision.requestedResources],
      grantedResources: [...approval.decision.grantedResources],
      evidenceRefs: [...approval.decision.evidenceRefs],
    })
    await ctx.db.insert('capabilityOperationInvocations', {
      invocationRef,
      principalId: owner.principalRef,
      ownerId: 'legacy-owner-not-authority',
      credentialId: 'credential:journal',
      applicationRef: 'application:journal',
      operationRef,
      idempotencyKey: 'idempotency:journal',
      environment: 'sandbox',
      grantRef: leaseGrant.grantRef,
      grantGeneration: 1,
      policyDigest: DIGEST('c'),
      grantExpiresAt: leaseGrant.expiresAt,
      inputDigest: DIGEST('d'),
      requestDigest: REQUEST_DIGEST,
      state: 'pending',
      attemptRef,
      updatedAt: NOW,
      createdAt: NOW,
    })
  })
  const readinessValidUntil = NOW + 120_000
  const leaseResult = await backend.mutation(internal.capabilityProviderConnections.issueLease, {
    commandId: 'command:lease:journal',
    leaseRef: 'lease:journal',
    invocationRef,
    operationRef,
    connectionRef: installed.connection.connectionRef,
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    adapterId: installed.connection.adapterId,
    expectedAuthorityGeneration: installed.connection.authorityGeneration,
    expectedAuthorityDigest: installed.connection.authorityDigest,
    requestedScopes: [...installed.connection.grantedScopes],
    grantedScopes: [...installed.connection.grantedScopes],
    requestedResources: [...installed.connection.grantedResources],
    grantedResources: [...installed.connection.grantedResources],
    approvalDecisionRef: approval.decision.decisionRef,
    readinessValidUntil,
    leaseMs: 60_000,
    evidenceRefs: ['evidence:lease'],
    now: NOW,
  })
  if (leaseResult.kind === 'refused') throw new Error(`lease_issue_failed:${leaseResult.code}`)
  const signingSecretRef = `sec_${'8'.repeat(32)}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('secretPointers', {
      secretRef: SECRET_REF,
      owningAccountRef: owner.accountRef,
      activeGeneration: `sgn_${'3'.repeat(32)}`,
      revision: 4,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        operation: 'provision',
        snapshotRef: 'snapshot:customer',
        accountRef: owner.accountRef,
        actorPrincipalRef: owner.principalRef,
        grantRef: leaseGrant.grantRef,
        grantGeneration: 1,
        correlationRef: 'correlation:customer',
        idempotencyRef: 'idempotency:customer',
        occurredAt: NOW,
      },
    })
    await ctx.db.insert('secretPointers', {
      secretRef: signingSecretRef,
      owningAccountRef: `acc_${'9'.repeat(32)}`,
      activeGeneration: `sgn_${'9'.repeat(32)}`,
      revision: 2,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        operation: 'provision',
        snapshotRef: 'snapshot:signing',
        accountRef: `acc_${'9'.repeat(32)}`,
        actorPrincipalRef: `prn_${'9'.repeat(32)}`,
        grantRef: 'grant:signing',
        grantGeneration: 1,
        correlationRef: 'correlation:signing',
        idempotencyRef: 'idempotency:signing',
        occurredAt: NOW,
      },
    })
  })
  const args = issueArgs({
    commandId: 'provider-effect:invocation:journal:attempt:journal:1',
    invocationRef,
    operationRef,
    attemptRef,
    leaseRef: 'lease:journal',
    providerRef: installed.connection.providerRef,
    adapterId: installed.connection.adapterId,
    authorityDigest: installed.connection.authorityDigest,
    grantedScopes: [...installed.connection.grantedScopes],
    grantedResources: [...installed.connection.grantedResources],
    readinessValidUntil,
    readinessDigest: undefined,
    signingSecretRef,
  })
  return { backend, args, owner, signingSecretRef }
}

async function currentEffectFixture(primaryPatch: Record<string, unknown> = {}) {
  const fixture = await freshIssueAuthority()
  const first = await fixture.backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, fixture.args))
  if (first.kind !== 'issued') throw new Error('initial_ticket_issue_failed')
  await fixture.backend.run(async (ctx) => {
    const primary = await ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
    if (primary === null) throw new Error('primary_journal_missing')
    await ctx.db.patch(primary._id, primaryPatch)
    await ctx.db.insert('providerConsequenceJournal', {
      ...journalRow({
        ticketRef: 'provider-ticket:aborted-shadow',
        effectRef: 'connection-effect:aborted-shadow',
        commandId: fixture.args.commandId,
        state: 'aborted',
        abortedAt: NOW,
      }),
    })
  })
  return fixture
}

function journalRow(overrides: Record<string, unknown> = {}) {
  return {
    ticketRef: TICKET_REF,
    effectRef: EFFECT_REF,
    commandId: 'provider-effect:invocation:test:attempt:test:1',
    state: 'pending' as const,
    journalTokenDigest: TOKEN_DIGEST,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    operationKeyDigest: OPERATION_KEY_DIGEST,
    ticketClaimsDigest: CLAIMS_DIGEST,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    leaseRef: 'lease:test',
    canonicalLeaseRef: 'lease-canonical:test',
    canonicalConnectionRef: 'connection:test',
    canonicalConnectionGeneration: 6,
    providerRef: 'provider:test',
    adapterId: 'x402-fetch:v2',
    authorityDigest: DIGEST('6'),
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil: NOW + 20_000,
    readinessDigest: DIGEST('7'),
    owningAccountRef: `acc_${'1'.repeat(32)}`,
    activeAccountRef: `acc_${'1'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`,
    grantRef: 'grant:test',
    grantGeneration: 3,
    secretRef: SECRET_REF,
    secretGeneration: `sgn_${'3'.repeat(32)}`,
    secretPointerRevision: 4,
    signingSecretRef: `sec_${'8'.repeat(32)}`,
    signingSecretGeneration: `sgn_${'9'.repeat(32)}`,
    signingSecretPointerRevision: 2,
    signingAccountRef: `acc_${'9'.repeat(32)}`,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 10_000,
    updatedAt: NOW - 1_000,
    ...overrides,
  }
}

function claimArgs(overrides: Record<string, unknown> = {}) {
  return {
    ticketRef: TICKET_REF,
    journalTokenDigest: TOKEN_DIGEST,
    effectRef: EFFECT_REF,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    ticketClaimsDigest: CLAIMS_DIGEST,
    expiresAt: NOW + 10_000,
    ...overrides,
  }
}

function issueArgs(overrides: Record<string, unknown> = {}) {
  return {
    ticketRef: TICKET_REF,
    commandId: 'provider-effect:invocation:test:attempt:test:1',
    journalTokenDigest: TOKEN_DIGEST,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    operationKeyDigest: OPERATION_KEY_DIGEST,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    leaseRef: 'lease:test',
    providerRef: 'provider:test',
    adapterId: 'x402-fetch:v2',
    authorityDigest: DIGEST('6'),
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil: NOW + 20_000,
    readinessDigest: DIGEST('7'),
    signingSecretRef: `sec_${'8'.repeat(32)}`,
    requestedExpiresAt: NOW + 10_000,
    ...overrides,
  }
}

function succeededObservation(requestDigest = REQUEST_DIGEST) {
  return {
    transport: 'x402' as const,
    disposition: 'succeeded' as const,
    releaseStarted: true,
    requestDigest,
    outputJson: JSON.stringify({ serviceReference: 'service:test' }),
    settlementEvidence: {
      kind: 'settled' as const,
      response: {
        success: true,
        transaction: '0xsettlement',
        network: 'eip155:84532',
      },
      digest: DIGEST('e'),
    },
  }
}

async function backendWithJournal(overrides: Record<string, unknown> = {}) {
  const backend = convexTest(schema, convexModules)
  await backend.run(async (ctx) => {
    await ctx.db.insert('providerConsequenceJournal', journalRow(overrides))
  })
  return backend
}

async function readJournal(backend: Backend) {
  return await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
}

describe('provider consequence durable journal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('issues a fresh ticket only from exact current lease, invocation, connection, grant, and secret authority', async () => {
    const { backend, args, owner, signingSecretRef } = await freshIssueAuthority()

    const first = await backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args))
    expect(first).toMatchObject({
      kind: 'issued',
      ticket: {
        ticketRef: TICKET_REF,
        invocationRef: args.invocationRef,
        operationRef: args.operationRef,
        leaseRef: args.leaseRef,
        providerRef: args.providerRef,
        adapterId: args.adapterId,
        owningAccountRef: owner.accountRef,
        activeAccountRef: owner.accountRef,
        actorPrincipalRef: owner.principalRef,
        secret: {
          secretRef: SECRET_REF,
          activeGeneration: `sgn_${'3'.repeat(32)}`,
          pointerRevision: 4,
        },
      },
      signingSecret: {
        secretRef: signingSecretRef,
        activeGeneration: `sgn_${'9'.repeat(32)}`,
        pointerRevision: 2,
      },
    })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual(first)
    const persisted = await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
    expect(persisted).toMatchObject({
      state: 'pending',
      commandId: args.commandId,
      journalTokenDigest: TOKEN_DIGEST,
      owningAccountRef: owner.accountRef,
      secretRef: SECRET_REF,
      signingSecretRef,
    })
    expect(JSON.stringify(persisted)).not.toContain(JOURNAL_TOKEN)
  })

  it('aborts an expired pending command and admits a fresh exact ticket from current authority', async () => {
    const { backend, args } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      await ctx.db.insert('providerConsequenceJournal', journalRow({
        ticketRef: 'provider-ticket:expired',
        commandId: args.commandId,
        state: 'pending',
        expiresAt: NOW,
      }))
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toMatchObject({ kind: 'issued', ticket: { ticketRef: TICKET_REF } })
    const rows = await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal').collect())
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.ticketRef === 'provider-ticket:expired')).toMatchObject({
      state: 'aborted',
      abortedAt: NOW,
    })
    expect(rows.find((row) => row.ticketRef === TICKET_REF)).toMatchObject({ state: 'pending' })
  })

  it.each([
    ['customer account', SECRET_REF, { owningAccountRef: `acc_${'0'.repeat(32)}` }],
    ['signing account', `sec_${'8'.repeat(32)}`, { owningAccountRef: 'customer-owner' }],
    ['customer generation', SECRET_REF, { activeGeneration: 'caller-shaped-generation' }],
    ['signing revision', `sec_${'8'.repeat(32)}`, { revision: 0 }],
  ])('denies substituted %s before effect admission', async (_label, secretRef, patch) => {
    const { backend, args, owner } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      const pointer = await ctx.db.query('secretPointers')
        .withIndex('by_secretRef', (query) => query.eq('secretRef', secretRef)).unique()
      if (pointer === null) throw new Error('pointer_fixture_missing')
      await ctx.db.patch(pointer._id, 'owningAccountRef' in patch && patch.owningAccountRef === 'customer-owner'
        ? { owningAccountRef: owner.accountRef }
        : patch)
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'secret_pointer_unavailable' })
    await expect(backend.run(async (ctx) => ctx.db.query('connectionEffectAdmissions').collect()))
      .resolves.toHaveLength(0)
    await expect(backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect()))
      .resolves.toHaveLength(0)
  })

  it('fails closed on a conflicting journal identity after exact effect admission', async () => {
    const { backend, args } = await freshIssueAuthority()
    const admission = await backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      commandId: args.commandId,
    }))
    expect(admission).toMatchObject({ kind: 'admitted' })
    if (admission.kind !== 'admitted') throw new Error('effect_admission_fixture_failed')
    await backend.run(async (ctx) => {
      await ctx.db.insert('providerConsequenceJournal', journalRow({
        ticketRef: 'provider-ticket:conflict',
        effectRef: admission.effectRef,
        commandId: 'provider-effect:conflicting-command',
      }))
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
    await expect(backend.run(async (ctx) => ctx.db.query('connectionEffectAdmissions').collect()))
      .resolves.toHaveLength(1)
    const journals = await backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect())
    expect(journals).toHaveLength(1)
    expect(journals[0]).toMatchObject({ ticketRef: 'provider-ticket:conflict' })
  })

  it('rejects every substituted persisted field after exact effect admission', async () => {
    const substitutions: Array<Record<string, unknown>> = [
      { commandId: 'provider-effect:other' }, { requestDigest: DIGEST('a') },
      { invocationDigest: DIGEST('a') }, { operationKeyDigest: DIGEST('a') },
      { invocationRef: 'invocation:other' }, { operationRef: 'operation:other' },
      { attemptRef: 'attempt:other' }, { effectGeneration: 99 }, { leaseRef: 'lease:other' },
      { canonicalLeaseRef: 'lease-canonical:other' }, { canonicalConnectionRef: 'connection:other' },
      { canonicalConnectionGeneration: 99 }, { providerRef: 'provider:other' },
      { adapterId: 'mcp-jsonrpc:v1' }, { authorityDigest: DIGEST('a') },
      { grantedScopes: ['scope:other'] }, { grantedResources: ['resource:other'] },
      { readinessValidUntil: NOW + 1 }, { readinessDigest: DIGEST('a') },
      { owningAccountRef: `acc_${'0'.repeat(32)}` }, { activeAccountRef: `acc_${'0'.repeat(32)}` },
      { actorPrincipalRef: `prn_${'0'.repeat(32)}` }, { grantRef: 'grant:other' },
      { grantGeneration: 99 }, { secretRef: `sec_${'0'.repeat(32)}` },
      { secretGeneration: `sgn_${'0'.repeat(32)}` }, { secretPointerRevision: 99 },
      { signingSecretRef: `sec_${'0'.repeat(32)}` },
      { signingSecretGeneration: `sgn_${'0'.repeat(32)}` },
      { signingSecretPointerRevision: 99 }, { signingAccountRef: `acc_${'0'.repeat(32)}` },
    ]
    for (const substitution of substitutions) {
      const { backend, args } = await currentEffectFixture(substitution)
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
        .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
    }
  })

  it.each([
    ['pending', {}, 'issued'],
    ['started', { state: 'started', claimRef: CLAIM_REF, startedAt: NOW }, 'started'],
    ['completed', {
      state: 'completed',
      claimRef: CLAIM_REF,
      startedAt: NOW,
      observationJson: JSON.stringify(succeededObservation()),
      completedAt: NOW,
    }, 'completed'],
  ] as const)('replays exact current %s state after an aborted command shadow', async (_label, patch, kind) => {
    const { backend, args } = await currentEffectFixture(patch)
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toMatchObject({ kind })
  })

  it('aborts expired current state and refuses ticket identity reuse', async () => {
    const { backend, args } = await currentEffectFixture({ expiresAt: NOW })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'ticket_identity_conflict' })
    const primary = await backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
    expect(primary).toMatchObject({ state: 'aborted', abortedAt: NOW })
  })

  it('refuses a changed current pending token without making it retryable', async () => {
    const { backend, args } = await currentEffectFixture({ journalTokenDigest: DIGEST('a') })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_unavailable' })
  })

  it('refuses an already-aborted current effect and preserves ticket identity', async () => {
    const { backend, args } = await currentEffectFixture({ state: 'aborted', abortedAt: NOW })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'ticket_identity_conflict' })
  })

  it('rejects every non-canonical ticket input before reading live authority', async () => {
    const backend = convexTest(schema, convexModules)
    for (const override of [
      { ticketRef: '' }, { commandId: '' }, { journalTokenDigest: 'raw-token' },
      { requestDigest: 'bad' }, { invocationDigest: 'bad' }, { operationKeyDigest: 'bad' },
      { invocationRef: '' }, { operationRef: '' }, { attemptRef: '' }, { effectGeneration: 0 },
      { leaseRef: '' }, { providerRef: '' }, { adapterId: '' }, { authorityDigest: 'bad' },
      { grantedScopes: [] }, { grantedScopes: [''] }, { grantedResources: [] },
      { grantedResources: [''] }, { readinessValidUntil: 1.5 }, { readinessDigest: 'bad' },
      { signingSecretRef: 'credential:caller' }, { requestedExpiresAt: 1.5 },
    ]) {
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
        ctx,
        issueArgs(override),
      ))).resolves.toEqual({ kind: 'unavailable', reason: 'ticket_input_invalid' })
    }
  })

  it.each([
    ['lease', 'lease_authority_unavailable'],
    ['invocation', 'invocation_authority_unavailable'],
    ['connection', 'connection_authority_unavailable'],
    ['lifetime', 'ticket_lifetime_unavailable'],
  ] as const)('fails closed when current %s authority changes before issue', async (kind, reason) => {
    const { backend, args } = await freshIssueAuthority()
    if (kind === 'lease') {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
        if (row === null) throw new Error('lease_fixture_missing')
        await ctx.db.patch(row._id, { state: 'invalidated' })
      })
    } else if (kind === 'invocation') {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
        if (row === null) throw new Error('invocation_fixture_missing')
        await ctx.db.patch(row._id, { principalId: `prn_${'0'.repeat(32)}` })
      })
    } else if (kind === 'connection') {
      await backend.run(async (ctx) => {
        const lease = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
        if (lease === null) throw new Error('lease_fixture_missing')
        const row = await ctx.db.query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
        if (row === null) throw new Error('connection_fixture_missing')
        await ctx.db.patch(row._id, { lifecycle: 'revoked' })
      })
    } else {
      args.requestedExpiresAt = NOW + 100
    }
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason })
  })

  it('rejects an expired provider connection before effect admission', async () => {
    const { backend, args } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      const lease = await ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
      if (lease === null) throw new Error('lease_fixture_missing')
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
      if (row === null) throw new Error('connection_fixture_missing')
      await ctx.db.patch(row._id, { expiresAt: NOW })
    })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'connection_authority_unavailable' })
  })

  it('claims once and makes every exact replay ambiguity-safe', async () => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'claimed', claimRef: CLAIM_REF })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'started' })
    await expect(readJournal(backend)).resolves.toMatchObject({
      state: 'started',
      claimRef: CLAIM_REF,
      startedAt: NOW,
    })
  })

  it('returns unavailable for missing or malformed completed journal rows', async () => {
    const missing = convexTest(schema, convexModules)
    await expect(missing.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'unavailable' })
    for (const observationJson of [undefined, '{']) {
      const backend = await backendWithJournal({
        state: 'completed',
        ...(observationJson === undefined ? {} : { observationJson }),
      })
      await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
        .resolves.toEqual({ kind: 'unavailable' })
    }
  })

  it('replays an exact pending issue without revalidating or replacing the one-time token', async () => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
      .resolves.toMatchObject({
        kind: 'issued',
        ticket: {
          ticketRef: TICKET_REF,
          effectRef: EFFECT_REF,
          invocationRef: 'invocation:test',
          owningAccountRef: `acc_${'1'.repeat(32)}`,
          activeAccountRef: `acc_${'1'.repeat(32)}`,
          secret: { secretRef: SECRET_REF, activeGeneration: `sgn_${'3'.repeat(32)}` },
        },
        ticketClaimsDigest: CLAIMS_DIGEST,
        signingSecret: { secretRef: `sec_${'8'.repeat(32)}` },
      })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs({
      journalTokenDigest: DIGEST('a'),
    })))).resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_unavailable' })
  })

  it.each(['started', 'completed'] as const)(
    'replays %s after live authority rows disappear while denying stable-identity substitution',
    async (state) => {
      const observation = succeededObservation()
      const backend = await backendWithJournal({
        state,
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        ...(state === 'completed'
          ? { observationJson: JSON.stringify(observation), completedAt: NOW - 50 }
          : {}),
      })
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
        .resolves.toMatchObject(state === 'started'
          ? { kind: 'started', ticketRef: TICKET_REF }
          : { kind: 'completed', ticketRef: TICKET_REF })
      for (const hostile of [
        { requestDigest: DIGEST('a') },
        { invocationDigest: DIGEST('b') },
        { operationKeyDigest: DIGEST('c') },
        { invocationRef: 'invocation:other' },
        { attemptRef: 'attempt:other' },
        { leaseRef: 'lease:other' },
        { providerRef: 'provider:other' },
        { signingSecretRef: `sec_${'0'.repeat(32)}` },
      ]) {
        await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
          ctx,
          issueArgs(hostile),
        ))).resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
      }
    },
  )

  it('terminally aborts an expired pending issue before any fresh authority decision', async () => {
    const backend = await backendWithJournal({ expiresAt: NOW })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
      .resolves.toEqual({ kind: 'unavailable', reason: 'lease_authority_unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({
      state: 'aborted',
      abortedAt: NOW,
    })
  })

  it.each([
    ['token', { journalTokenDigest: DIGEST('a') }],
    ['effect', { effectRef: 'connection-effect:other' }],
    ['request', { requestDigest: DIGEST('b') }],
    ['invocation', { invocationDigest: DIGEST('c') }],
    ['claims', { ticketClaimsDigest: DIGEST('d') }],
    ['expiry', { expiresAt: NOW + 10_001 }],
  ])('denies substituted %s identity without consuming the ticket', async (_label, override) => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs(override))))
      .resolves.toEqual({ kind: 'unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({ state: 'pending' })
  })

  it('terminally aborts an expired unclaimed ticket and never lets it restart', async () => {
    const backend = await backendWithJournal({ expiresAt: NOW })

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, {
      ...claimArgs(),
      expiresAt: NOW,
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({ state: 'aborted', abortedAt: NOW })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, {
      ...claimArgs(),
      expiresAt: NOW,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each(['started', 'completed'] as const)(
    'denies %s replay when the token or full ticket claims do not match',
    async (state) => {
      const observation = succeededObservation()
      const backend = await backendWithJournal({
        state,
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        ...(state === 'completed'
          ? {
              observationJson: JSON.stringify(observation),
              observationDigest: canonicalDigest(observation),
              completedAt: NOW - 50,
            }
          : {}),
      })
      for (const override of [
        { journalTokenDigest: DIGEST('a') },
        { ticketClaimsDigest: DIGEST('b') },
        { invocationDigest: DIGEST('c') },
        { requestDigest: DIGEST('d') },
      ]) {
        await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(
          ctx,
          claimArgs(override),
        ))).resolves.toEqual({ kind: 'unavailable' })
      }
    },
  )

  it('completes only the claimed request, replays the exact observation, and rejects conflicts', async () => {
    const backend = await backendWithJournal()
    await backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs()))
    const observation = succeededObservation()
    const completeArgs = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
      observationJson: JSON.stringify(observation),
    }

    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, completeArgs)))
      .resolves.toEqual({ kind: 'completed' })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, completeArgs)))
      .resolves.toEqual({ kind: 'completed' })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toMatchObject({ kind: 'completed', observation })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...completeArgs,
      observationJson: JSON.stringify(succeededObservation(DIGEST('f'))),
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('rejects completion when the journal or exact claim identity is missing', async () => {
    const missing = convexTest(schema, convexModules)
    const args = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
      observationJson: JSON.stringify(succeededObservation()),
    }
    await expect(missing.run(async (ctx) => completeProviderConsequenceHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable' })
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...args, claimRef: 'provider-claim:other',
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('aborts only before release and makes the abort exact-replay idempotent', async () => {
    const backend = await backendWithJournal()
    await backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs()))

    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: DIGEST('a'),
      claimRef: CLAIM_REF,
    }))).resolves.toEqual({ kind: 'unavailable' })
    const exact = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
    }
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'aborted' })
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'aborted' })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...exact,
      observationJson: JSON.stringify(succeededObservation()),
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('authorizes provider-direct x402 only from the started journal and exact invocation identity', async () => {
    const backend = await backendWithJournal({
      state: 'started',
      claimRef: CLAIM_REF,
      startedAt: NOW,
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityOperationInvocations', {
        invocationRef: 'invocation:test',
        principalId: `prn_${'2'.repeat(32)}`,
        ownerId: 'owner:test',
        credentialId: 'credential:test',
        applicationRef: 'application:test',
        operationRef: 'operation:test',
        idempotencyKey: 'idempotency:test',
        environment: 'sandbox',
        grantRef: 'grant:test',
        grantGeneration: 3,
        policyDigest: DIGEST('8'),
        grantExpiresAt: NOW + 20_000,
        inputDigest: DIGEST('9'),
        requestDigest: REQUEST_DIGEST,
        state: 'pending',
        attemptRef: 'attempt:test',
        updatedAt: NOW,
        createdAt: NOW,
      })
    })
    const exactArgs = {
      paymentIdentifier: OPERATION_KEY_DIGEST,
      invocationRef: 'invocation:test',
      operationRef: 'operation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 1,
      providerRef: 'provider:test',
      credentialRef: SECRET_REF,
    }

    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend',
      args: exactArgs,
    }))).resolves.toMatchObject({
      kind: 'authorized',
      principalId: `prn_${'2'.repeat(32)}`,
      credentialRef: SECRET_REF,
      environment: 'sandbox',
    })
    for (const hostile of [
      { paymentIdentifier: DIGEST('a') },
      { invocationRef: 'invocation:other' },
      { operationRef: 'operation:other' },
      { attemptRef: 'attempt:other' },
      { effectGeneration: 2 },
      { providerRef: 'provider:other' },
      { credentialRef: `sec_${'0'.repeat(32)}` },
    ]) {
      await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
        ticketRef: TICKET_REF,
        journalTokenDigest: TOKEN_DIGEST,
        operation: 'reserve_external_spend',
        args: { ...exactArgs, ...hostile },
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
    const persisted = await readJournal(backend)
    expect(JSON.stringify(persisted)).not.toContain(JOURNAL_TOKEN)
    expect(persisted).toMatchObject({ secretRef: SECRET_REF, journalTokenDigest: TOKEN_DIGEST })
  })

  it('fails closed for malformed, expired, unstored, and unbound x402 callback identity', async () => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    for (const args of [null, [], 'caller-proof']) {
      await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
        ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
        operation: 'reserve_external_spend', args,
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'read_authorization', args: {},
    }))).resolves.toEqual({ kind: 'unavailable' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('providerConsequenceJournal')
        .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
      if (row === null) throw new Error('journal_fixture_missing')
      await ctx.db.patch(row._id, { expiresAt: NOW })
    })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend', args: {},
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'observe_attempt', args: { custodyRef: 'missing', authorizationDigest: DIGEST('a') },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('denies x402 when its exact journal has no bound invocation row', async () => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend',
      args: { dispatchRef: 'invocation:test' },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })
})
