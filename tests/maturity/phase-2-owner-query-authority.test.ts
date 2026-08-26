import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { accountRefForProvider } from '@/modules/money/public'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  installCanonicalProviderConnectionFixture,
  providerAuthority,
  seedCatalogOffering,
} from '../integration/capability-publication-harness'

const EXPECTED_QUERY_CALLERS = [
  'agentAccessPolicy:listOwnerGrantReadbacks',
  'capabilityProviderConnections:listOwner',
  'capabilityProviderConnections:readOwner',
  'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel',
  'catalog:getCurrentOwnerOfferingSupply',
  'catalog:getCurrentOwnerPublicCatalog',
  'chatMessages:listMessages',
  'chatShares:getShareState',
  'chatThreads:getThread',
  'chatThreads:listThreads',
  'chatThreads:searchThreads',
  'moneyLedger:readOwnerPayoutAccount',
  'moneyLedger:readOwnerPayoutTransfer',
  'moneyLedger:readOwnerProviderEarnings',
  'qualifiedUse:readOwnerQualifiedUse',
] as const

const CURRENCY = 'USD'
const EXPIRY_NOW = 10_000

type OwnerClient = Awaited<ReturnType<typeof publishedBusinessOwner>>['owner']

type QueryFixture = Readonly<{
  backend: ConvexFixtureBackend
  businessId: Id<'businesses'>
  businessRef: string
  connectionRef: string
  owner: OwnerClient
  otherBusinessId: Id<'businesses'>
  otherOwner: OwnerClient
  credential: Readonly<{
    bindingRef: string
    credentialRef: string
    generation: number
    expiresAt: number
    scheduleNonce: string
  }>
}>

type QueryClient = Pick<OwnerClient, 'query'>

function ownerQueries(input: Readonly<{
  businessId: Id<'businesses'>
  businessRef: string
  connectionRef: string
}>) {
  return [
    {
      ref: 'agentAccessPolicy:listOwnerGrantReadbacks',
      run: (client: QueryClient) =>
        client.query(api.agentAccessPolicy.listOwnerGrantReadbacks, {}),
    },
    {
      ref: 'catalog:getCurrentOwnerPublicCatalog',
      run: (client: QueryClient) =>
        client.query(api.catalog.getCurrentOwnerPublicCatalog, {}),
    },
    {
      ref: 'catalog:getCurrentOwnerOfferingSupply',
      run: (client: QueryClient) =>
        client.query(api.catalog.getCurrentOwnerOfferingSupply, {}),
    },
    {
      ref: 'capabilityProviderConnections:readOwner',
      run: (client: QueryClient) =>
        client.query(api.capabilityProviderConnections.readOwner, {
          connectionRef: input.connectionRef,
        }),
    },
    {
      ref: 'capabilityProviderConnections:listOwner',
      run: (client: QueryClient) =>
        client.query(api.capabilityProviderConnections.listOwner, {}),
    },
    {
      ref: 'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel',
      run: (client: QueryClient) =>
        client.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
          businessId: input.businessId,
        }),
    },
    {
      ref: 'moneyLedger:readOwnerPayoutAccount',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerPayoutAccount, {
          businessId: input.businessRef,
          currency: CURRENCY,
        }),
    },
    {
      ref: 'moneyLedger:readOwnerPayoutTransfer',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerPayoutTransfer, {
          businessId: input.businessRef,
          currency: CURRENCY,
          payoutRef: 'payout:owner-query-authority',
          idempotencyKey: 'idempotency:owner-query-authority',
        }),
    },
    {
      ref: 'moneyLedger:readOwnerProviderEarnings',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerProviderEarnings, {}),
    },
    {
      ref: 'qualifiedUse:readOwnerQualifiedUse',
      run: (client: QueryClient) =>
        client.query(api.qualifiedUse.readOwnerQualifiedUse, { limit: 10 }),
    },
  ] as const
}

describe('Phase 2 public owner-query authority', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mechanically inventories all fifteen public query callers of resolveBusinessActor', () => {
    expect(discoverPublicBusinessActorQueryCallers()).toEqual(
      EXPECTED_QUERY_CALLERS,
    )
  })

  it('preserves current account-scoped reads through the original nine and grant readback callers', async () => {
    const fixture = await currentQueryFixture('current')
    const queries = ownerQueries(fixture)
    const results = Object.fromEntries(
      await Promise.all(
        queries.map(async ({ ref, run }) => [ref, await run(fixture.owner)]),
      ),
    )

    expect(results).toMatchObject({
      'agentAccessPolicy:listOwnerGrantReadbacks': [
        { credentialId: `credential:owner-query:current` },
      ],
      'catalog:getCurrentOwnerPublicCatalog': { kind: 'available' },
      'catalog:getCurrentOwnerOfferingSupply': { kind: 'available' },
      'capabilityProviderConnections:readOwner': {
        connectionRef: fixture.connectionRef,
      },
      'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
        kind: 'available',
        businessId: fixture.businessRef,
      },
      'moneyLedger:readOwnerPayoutAccount': {
        businessId: fixture.businessRef,
        currency: CURRENCY,
        state: 'ready',
      },
      'moneyLedger:readOwnerPayoutTransfer': {
        kind: 'refused',
        code: 'payout_not_ready',
      },
      'moneyLedger:readOwnerProviderEarnings': {
        kind: 'available',
        businessId: fixture.businessRef,
      },
      'qualifiedUse:readOwnerQualifiedUse': {
        kind: 'found',
        businessId: fixture.businessRef,
      },
    })
    expect(results['capabilityProviderConnections:listOwner']).toEqual([
      expect.objectContaining({ connectionRef: fixture.connectionRef }),
    ])
  })

  it('denies exact materialized credential expiry through all owner query callers under test', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(EXPIRY_NOW)
    const fixture = await currentQueryFixture('expired', {
      credentialExpiresAt: EXPIRY_NOW + 1_000,
    })
    await expect(
      fixture.owner.query(api.agentAccessPolicy.listOwnerGrantReadbacks, {}),
    ).resolves.toEqual([
      expect.objectContaining({ credentialId: 'credential:owner-query:expired' }),
    ])

    vi.setSystemTime(fixture.credential.expiresAt)
    await expect(
      fixture.backend.mutation(
        internal.interactiveCredentialLifecycle.expireInteractiveCredential,
        {
          bindingRef: fixture.credential.bindingRef,
          credentialRef: fixture.credential.credentialRef,
          expectedGeneration: fixture.credential.generation,
          expectedExpiresAt: fixture.credential.expiresAt,
          scheduleNonce: fixture.credential.scheduleNonce,
        },
      ),
    ).resolves.toEqual({ kind: 'expired' })

    await expectAllOwnerQueriesDenied(fixture.owner, fixture)
  })

  it('denies exact credential revocation through all owner query callers under test', async () => {
    const fixture = await currentQueryFixture('revoked')
    await fixture.backend.run(async (ctx) => {
      const credential = await ctx.db
        .query('credentials')
        .withIndex('by_credentialRef', (query) =>
          query.eq('credentialRef', fixture.credential.credentialRef),
        )
        .unique()
      if (credential === null) throw new Error('credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: Date.now(),
        revision: credential.revision + 1,
        updatedAt: Date.now(),
      })
    })

    await expectAllOwnerQueriesDenied(fixture.owner, fixture)
  })

  it('does not disclose one Account through another authenticated Account', async () => {
    const fixture = await currentQueryFixture('cross-account')
    const results = Object.fromEntries(
      await Promise.all(
        ownerQueries(fixture).map(async ({ ref, run }) => [
          ref,
          await run(fixture.otherOwner),
        ]),
      ),
    )
    const serialized = JSON.stringify(results)

    expect(serialized).not.toContain(fixture.businessRef)
    expect(serialized).not.toContain(fixture.connectionRef)
    expect(results).toMatchObject({
      'agentAccessPolicy:listOwnerGrantReadbacks': [],
      'catalog:getCurrentOwnerPublicCatalog': { kind: 'not_found' },
      'capabilityProviderConnections:readOwner': null,
      'capabilityProviderConnections:listOwner': [],
      'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
        kind: 'not_found',
      },
      'moneyLedger:readOwnerPayoutAccount': null,
      'moneyLedger:readOwnerPayoutTransfer': {
        kind: 'refused',
        code: 'billing_identity_missing',
      },
      'moneyLedger:readOwnerProviderEarnings': {
        kind: 'available',
        businessId: String(fixture.otherBusinessId),
      },
      'qualifiedUse:readOwnerQualifiedUse': {
        kind: 'found',
        businessId: String(fixture.otherBusinessId),
      },
    })
  })

  it('rejects caller-shaped Clerk, provider, credential, Account, and proof fields at every query validator', async () => {
    const fixture = await currentQueryFixture('caller-shaped')
    const hostile = {
      clerkUserId: 'user_forged',
      providerIdentifier: 'https://identity.example|user_forged',
      credentialRef: fixture.credential.credentialRef,
      accountRef: fixture.credential.bindingRef,
      authorityProof: { kind: 'caller_shaped', accepted: true },
    }

    for (const query of hostileOwnerQueries(fixture, hostile)) {
      await expect(query.run()).rejects.toThrow(/extra field|Unexpected field|Object contains extra field/u)
    }
  })
})

async function expectAllOwnerQueriesDenied(
  owner: OwnerClient,
  fixture: Pick<QueryFixture, 'businessId' | 'businessRef' | 'connectionRef'>,
) {
  const results = Object.fromEntries(
    await Promise.all(
      ownerQueries(fixture).map(async ({ ref, run }) => [ref, await run(owner)]),
    ),
  )
  expect(results).toEqual({
    'agentAccessPolicy:listOwnerGrantReadbacks': [],
    'catalog:getCurrentOwnerPublicCatalog': {
      kind: 'not_found',
      reason: 'not_public',
    },
    'catalog:getCurrentOwnerOfferingSupply': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'capabilityProviderConnections:readOwner': null,
    'capabilityProviderConnections:listOwner': [],
    'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'moneyLedger:readOwnerPayoutAccount': null,
    'moneyLedger:readOwnerPayoutTransfer': {
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    },
    'moneyLedger:readOwnerProviderEarnings': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'qualifiedUse:readOwnerQualifiedUse': {
      kind: 'error',
      code: 'unauthenticated',
    },
  })
}

async function currentQueryFixture(
  suffix: string,
  options: Readonly<{ credentialExpiresAt?: number }> = {},
): Promise<QueryFixture> {
  const backend = convexTestWithMarketComponents()
  const primary = await publishedBusinessOwner(backend, `owner-query-${suffix}`)
  const other = await publishedBusinessOwner(backend, `owner-query-${suffix}-other`)
  const businessRef = String(primary.businessId)
  const authority = providerAuthority(`owner-query-${suffix}`)
  const providerAccountRef = `account:owner-query:${suffix}`
  const installed = await installCanonicalProviderConnectionFixture(backend, {
    businessId: primary.businessId,
    ...authority,
    providerAccountRef,
    adapterId: 'http-json:v1',
    secretRef: null,
    scopes: [`capability:owner-query:${suffix}`],
    resources: [`resource:owner-query:${suffix}`],
    evidenceRefs: [`test:owner-query:${suffix}`],
    commandId: `command:owner-query:${suffix}`,
  })
  if (installed.kind !== 'applied') {
    throw new Error(`owner_query_connection_fixture_${installed.kind}`)
  }
  await seedCatalogOffering(backend, primary.businessId, `owner-query-${suffix}`)
  await backend.run(async (ctx) => {
    const exactAmount = {
      currency: CURRENCY,
      units: '1000',
      exponent: 2,
    }
    const budgetPolicyRef = `budget-policy:owner-query:${suffix}`
    const ratePolicyRef = `rate-policy:owner-query:${suffix}`
    await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v1',
      grantRef: `grant:owner-query:${suffix}`,
      principalId: `principal:owner-query:${suffix}`,
      ownerId: primary.canonicalAccountRef,
      applicationRef: `application:owner-query:${suffix}`,
      credentialId: `credential:owner-query:${suffix}`,
      environment: 'production',
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy: {
        format: 'ae.agent-access-policy:v1',
        operationAccess: 'all_admitted',
        environment: 'production',
        budget: {
          budgetPolicyRef,
          generation: 1,
          currency: CURRENCY,
          exponent: 2,
          maximumSpendPerInvocation: exactAmount,
          maximumDailySpend: exactAmount,
          maximumMonthlySpend: exactAmount,
          maximumConcurrentInvocations: 1,
        },
        rate: {
          ratePolicyRef,
          generation: 1,
          maximumCallsPerMinute: 10,
          maximumCallsPerHour: 100,
        },
      },
      budgetPolicyRef,
      ratePolicyRef,
      lifecycle: 'active',
      generation: 1,
      policyDigest: `sha256:owner-query-policy:${suffix}`,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 8_000_000_000_000,
    })
    await ctx.db.insert('moneyPayoutAccounts', {
      businessId: businessRef,
      currency: CURRENCY,
      exponent: 2,
      stripeAccountId: `acct_owner_query_${suffix}`,
      state: 'ready',
      detailsSubmitted: true,
      recipientCapabilityActive: true,
      requirementsDigest: 'sha256:owner-query-requirements',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('moneyAccounts', {
      accountRef: accountRefForProvider(businessRef, CURRENCY),
      accountKind: 'provider_earnings',
      businessId: businessRef,
      currency: CURRENCY,
      exponent: 2,
      balanceUnits: '0',
      heldUnits: '0',
      recoveryDueUnits: '0',
      version: 1,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    })
  })

  const credential = await backend.run(async (ctx) => {
    const business = await ctx.db.get(primary.businessId)
    if (business === null) throw new Error('owner_query_business_missing')
    const owner = await ctx.db.get(business.ownerId)
    if (owner?.canonicalPrincipalRef === undefined) {
      throw new Error('owner_query_canonical_owner_missing')
    }
    const binding = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_principalRef_and_lifecycle', (query) =>
        query
          .eq('principalRef', owner.canonicalPrincipalRef as string)
          .eq('lifecycle', 'active'),
      )
      .unique()
    if (binding === null) throw new Error('owner_query_binding_missing')
    const row = await ctx.db
      .query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) =>
        query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'),
      )
      .unique()
    if (row === null) throw new Error('owner_query_credential_missing')
    const expiresAt = options.credentialExpiresAt ?? row.expiresAt
    const scheduleNonce = canonicalDigest({
      kind: 'interactive_credential_expiry:v1',
      bindingRef: binding.bindingRef,
      credentialRef: row.credentialRef,
      generation: row.generation,
      expiresAt,
    })
    if (options.credentialExpiresAt !== undefined) {
      await ctx.db.patch(row._id, {
        expiresAt,
        expiryMaterialization: {
          state: 'scheduled',
          credentialGeneration: row.generation,
          credentialExpiresAt: expiresAt,
          scheduleNonce,
          scheduleRef: `scheduled:${row.credentialRef}:${expiresAt}`,
          materializedAt: Date.now(),
        },
        updatedAt: Date.now(),
      })
    }
    return {
      bindingRef: binding.bindingRef,
      credentialRef: row.credentialRef,
      generation: row.generation,
      expiresAt,
      scheduleNonce,
    }
  })

  const owner = options.credentialExpiresAt === undefined
    ? primary.owner
    : backend.withIdentity({
        subject: `user_owner-query-${suffix}`,
        issuer: 'https://identity.example',
        exp: credential.expiresAt / 1_000,
      })

  return {
    backend,
    businessId: primary.businessId,
    businessRef,
    connectionRef: authority.connectionRef,
    owner,
    otherBusinessId: other.businessId,
    otherOwner: other.owner,
    credential,
  }
}

function hostileOwnerQueries(
  fixture: QueryFixture,
  hostile: Record<string, unknown>,
) {
  return [
    {
      run: () =>
        fixture.backend.query(
          api.agentAccessPolicy.listOwnerGrantReadbacks,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.catalog.getCurrentOwnerPublicCatalog,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.catalog.getCurrentOwnerOfferingSupply,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.capabilityProviderConnections.readOwner, {
          connectionRef: fixture.connectionRef,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(
          api.capabilityProviderConnections.listOwner,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
          { businessId: fixture.businessId, ...hostile } as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readOwnerPayoutAccount, {
          businessId: fixture.businessRef,
          currency: CURRENCY,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readOwnerPayoutTransfer, {
          businessId: fixture.businessRef,
          currency: CURRENCY,
          payoutRef: 'payout:owner-query-authority',
          idempotencyKey: 'idempotency:owner-query-authority',
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(
          api.moneyLedger.readOwnerProviderEarnings,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.qualifiedUse.readOwnerQualifiedUse, {
          limit: 10,
          ...hostile,
        } as never),
    },
  ]
}

function discoverPublicBusinessActorQueryCallers(): string[] {
  const convexRoot = fileURLToPath(new URL('../../convex/', import.meta.url))
  const files = collectTypeScriptFiles(convexRoot).filter(
    (path) => !path.includes('/_generated/'),
  )
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
  })
  const checker = program.getTypeChecker()
  const callers: string[] = []

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(convexRoot) || source.fileName.includes('/_generated/')) {
      continue
    }
    source.forEachChild((node) => {
      if (!ts.isVariableStatement(node) || !hasExportModifier(node)) return
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
          continue
        }
        if (!isPublicQueryInitializer(declaration.initializer)) continue
        const handler = queryHandler(declaration.initializer)
        if (handler === undefined) continue
        if (!reachesResolveBusinessActor(handler, checker, convexRoot, new Set())) {
          continue
        }
        const moduleName = relative(convexRoot, source.fileName).replace(/\.ts$/u, '')
        callers.push(`${moduleName}:${declaration.name.text}`)
      }
    })
  }
  return callers.sort()
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTypeScriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [path]
      : []
  })
}

function hasExportModifier(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
}

function isPublicQueryInitializer(node: ts.Expression): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === 'query' || node.expression.text === 'queryGeneric')
}

function queryHandler(call: ts.CallExpression): ts.Expression | undefined {
  const config = call.arguments[0]
  if (config === undefined || !ts.isObjectLiteralExpression(config)) return undefined
  const property = config.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate)
      && ts.isIdentifier(candidate.name)
      && candidate.name.text === 'handler',
  )
  return property?.initializer
}

function reachesResolveBusinessActor(
  root: ts.Node,
  checker: ts.TypeChecker,
  convexRoot: string,
  visited: Set<ts.Node>,
): boolean {
  if (visited.has(root)) return false
  visited.add(root)
  if (ts.isIdentifier(root)) {
    if (root.text === 'resolveBusinessActor') return true
    return declarationsFor(root, checker).some(
      (declaration) =>
        declaration.getSourceFile().fileName.startsWith(convexRoot)
        && reachesResolveBusinessActor(
          declaration,
          checker,
          convexRoot,
          visited,
        ),
    )
  }
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'resolveBusinessActor') {
        found = true
        return
      }
      for (const declaration of declarationsFor(node.expression, checker)) {
        if (
          declaration.getSourceFile().fileName.startsWith(convexRoot)
          && reachesResolveBusinessActor(declaration, checker, convexRoot, visited)
        ) {
          found = true
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

function declarationsFor(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): readonly ts.Declaration[] {
  const symbol = checker.getSymbolAtLocation(identifier)
  if (symbol === undefined) return []
  const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol
  return resolved.declarations ?? []
}
