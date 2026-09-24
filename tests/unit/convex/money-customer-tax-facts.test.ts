import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import { readCustomerTaxFactsForAccount } from '../../../convex/lib/money/documents/issue'
import {
  admitTaxInvoiceIssuance,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
} from '../../../src/modules/money/public'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`

const enabledTaxControl = Object.freeze({
  ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.tax,
  taxInvoiceIssuance: 'enabled' as const,
})

type CustomerTaxFactsRead =
  | Readonly<{
      kind: 'missing'
      accountRef: string
      revision: 0
    }>
  | Readonly<{
      kind: 'available'
      accountRef: string
      abn: string
      gstRegistered: boolean
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      legalCustomerRef: string
      effectiveAt: number
      updatedAt: number
      revision: number
    }>

type UpsertCustomerTaxFactsArgs = Readonly<{
  abn: string
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country: 'AU'
  gstRegistered?: boolean
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

type UpsertCustomerTaxFactsReceipt = Readonly<
  | { kind: 'updated'; revision: number; effectiveAt: number }
  | { kind: 'replayed'; revision: number; effectiveAt: number }
>

type TaxFactsRow = Readonly<{
  accountRef: string
  abn: string
  gstRegistered: boolean
  legalCustomerRef: string
  legalName?: string
  addressLine1?: string
  locality?: string
  postalCode?: string
  country?: string
  effectiveAt: number
  updatedAt: number
  revision?: number
  lastCorrelationRef?: string
}>

const readCustomerTaxFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  CustomerTaxFactsRead
>('moneyCustomerTaxFacts:readCustomerTaxFacts')

const upsertCustomerTaxFactsRef = makeFunctionReference<
  'mutation',
  UpsertCustomerTaxFactsArgs,
  UpsertCustomerTaxFactsReceipt
>('moneyCustomerTaxFacts:upsertCustomerTaxFacts')

const setActiveWorkspaceRef = makeFunctionReference<
  'mutation',
  { accountRef: string; correlationRef: string },
  { principalRef: string; activeAccountRef: string; revision: number; selectedAt: number }
>('interactiveSession:setActiveWorkspace')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:money-customer-tax-facts:${label}`

const idempotencyRef = (label: string) => `idem:money-customer-tax-facts:${label}`

async function readCustomerTaxFacts(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<CustomerTaxFactsRead> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readCustomerTaxFactsRef, {})
}

async function upsertCustomerTaxFacts(
  backend: InteractiveAuthorityBackend,
  input: UpsertCustomerTaxFactsArgs,
  presentedIdentity: UserIdentity = identity(),
): Promise<UpsertCustomerTaxFactsReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(upsertCustomerTaxFactsRef, input)
}

async function expectTaxFactsRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function listTaxFactsRows(backend: InteractiveAuthorityBackend): Promise<TaxFactsRow[]> {
  return await backend.run(async (ctx) =>
    (await (ctx.db as { query: (table: string) => { collect: () => Promise<TaxFactsRow[]> } })
      .query('moneyCustomerTaxFacts')
      .collect()))
}

function upsertPayload(
  overrides: Partial<UpsertCustomerTaxFactsArgs> = {},
): UpsertCustomerTaxFactsArgs {
  return {
    abn: '51824753556',
    legalName: 'Acme Technologies Pty Ltd',
    addressLine1: '1 Market Street',
    locality: 'Sydney',
    region: 'NSW',
    postalCode: '2000',
    country: 'AU',
    expectedRevision: 0,
    correlationRef: correlationRef('default'),
    idempotencyRef: idempotencyRef('default'),
    ...overrides,
  }
}

async function seedSecondOwnedAccount(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: ACCOUNT_B,
      displayName: 'Workspace B',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: `account:${ACCOUNT_B}`,
      initialOwnershipRef: OWNERSHIP_B,
      currentOwnershipRef: OWNERSHIP_B,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `account:${ACCOUNT_B}`,
        idempotencyRef: `account:${ACCOUNT_B}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: OWNERSHIP_B,
      accountRef: ACCOUNT_B,
      ownerPrincipalRef: PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `ownership:${OWNERSHIP_B}`,
        idempotencyRef: `ownership:${OWNERSHIP_B}`,
      },
    })
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      revision: 1,
      selectedAt: NOW,
      lastCorrelationRef: `session:${ACCOUNT_REF}`,
    })
  })
}

async function setActiveWorkspace(
  backend: InteractiveAuthorityBackend,
  accountRef: string,
  presentedIdentity: UserIdentity = identity(),
): Promise<void> {
  const session = backend.withIdentity(presentedIdentity)
  await session.mutation(setActiveWorkspaceRef, {
    accountRef,
    correlationRef: correlationRef(`workspace:${accountRef}`),
  })
}

describe('moneyCustomerTaxFacts', () => {
  it('C1: unauthenticated readCustomerTaxFacts refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => backend.query(readCustomerTaxFactsRef, {}),
      'identity_invalid',
    )
  })

  it('C2: unauthenticated upsertCustomerTaxFacts refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => backend.mutation(upsertCustomerTaxFactsRef, upsertPayload()),
      'identity_invalid',
    )
  })

  it('C3: seeded owner with no row returns missing view', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readCustomerTaxFacts(backend)).resolves.toEqual({
      kind: 'missing',
      accountRef: ACCOUNT_REF,
      revision: 0,
    })
  })

  it('C4: valid upsert persists digits-only ABN and bound legalCustomerRef', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: correlationRef('c4'),
      idempotencyRef: idempotencyRef('c4'),
    }))

    expect(receipt).toMatchObject({ kind: 'updated', revision: 1 })
    expect(receipt.effectiveAt).toEqual(expect.any(Number))

    const rows = await listTaxFactsRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      accountRef: ACCOUNT_REF,
      abn: '51824753556',
      gstRegistered: true,
      legalCustomerRef: PRINCIPAL_REF,
      legalName: 'Acme Technologies Pty Ltd',
      country: 'AU',
    })
  })

  it('C5: spaced ABN input stores digits-only ABN', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      abn: '51 824 753 556',
      correlationRef: correlationRef('c5'),
      idempotencyRef: idempotencyRef('c5'),
    }))

    expect(await listTaxFactsRows(backend)).toMatchObject([{
      accountRef: ACCOUNT_REF,
      abn: '51824753556',
    }])
  })

  it('C6: invalid ABN refuses customer_abn_invalid and creates no row', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        abn: '12345678901',
        correlationRef: correlationRef('c6'),
        idempotencyRef: idempotencyRef('c6'),
      })),
      'customer_abn_invalid',
    )
    expect(await listTaxFactsRows(backend)).toHaveLength(0)
  })

  it.each([
    ['   ', 'whitespace legal name'],
    ['', 'empty legal name'],
  ] as const)('C7: %s refuses legal_name_invalid', async (legalName, _label) => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        legalName,
        correlationRef: correlationRef(`c7-${legalName.length}`),
        idempotencyRef: idempotencyRef(`c7-${legalName.length}`),
      })),
      'legal_name_invalid',
    )
    expect(await listTaxFactsRows(backend)).toHaveLength(0)
  })

  it.each([
    [{ addressLine1: '   ' }, 'empty address line'],
    [{ locality: '' }, 'empty locality'],
    [{ postalCode: '200' }, 'invalid AU postcode'],
  ] as const)('C8: %s refuses billing_address_invalid', async (patch, _label) => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        correlationRef: correlationRef(`c8-${JSON.stringify(patch)}`),
        idempotencyRef: idempotencyRef(`c8-${JSON.stringify(patch)}`),
        ...patch,
      })),
      'billing_address_invalid',
    )
    expect(await listTaxFactsRows(backend)).toHaveLength(0)
  })

  it('C8: omitted country refuses billing_address_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const { country: _country, ...withoutCountry } = upsertPayload({
      correlationRef: correlationRef('c8-no-country'),
      idempotencyRef: idempotencyRef('c8-no-country'),
    })

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, withoutCountry as UpsertCustomerTaxFactsArgs),
      'billing_address_invalid',
    )
    expect(await listTaxFactsRows(backend)).toHaveLength(0)
  })

  it('C8: non-AU country refuses billing_address_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        country: 'US' as 'AU',
        correlationRef: correlationRef('c8-non-au'),
        idempotencyRef: idempotencyRef('c8-non-au'),
      })),
      'billing_address_invalid',
    )
    expect(await listTaxFactsRows(backend)).toHaveLength(0)
  })

  it('C9: same correlationRef and payload replays without bumping effectiveAt', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const payload = upsertPayload({
      correlationRef: correlationRef('c9'),
      idempotencyRef: idempotencyRef('c9'),
    })
    const first = await upsertCustomerTaxFacts(backend, payload)
    const replay = await upsertCustomerTaxFacts(backend, payload)

    expect(replay).toEqual({
      kind: 'replayed',
      revision: 1,
      effectiveAt: first.effectiveAt,
    })
    expect(await listTaxFactsRows(backend)).toHaveLength(1)
  })

  it('C10: same correlationRef with changed facts refuses correlation reuse', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const sharedCorrelation = correlationRef('c10')
    await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: sharedCorrelation,
      idempotencyRef: idempotencyRef('c10-first'),
    }))
    const rowsBefore = await listTaxFactsRows(backend)

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        abn: '53004085616',
        expectedRevision: 1,
        correlationRef: sharedCorrelation,
        idempotencyRef: idempotencyRef('c10-second'),
      })),
      'tax_facts_correlation_mismatch',
    )
    expect(await listTaxFactsRows(backend)).toEqual(rowsBefore)
  })

  it('C11: stale expectedRevision refuses tax_facts_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: correlationRef('c11-first'),
      idempotencyRef: idempotencyRef('c11-first'),
    }))

    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload({
        expectedRevision: 0,
        correlationRef: correlationRef('c11-stale'),
        idempotencyRef: idempotencyRef('c11-stale'),
      })),
      'tax_facts_revision_conflict',
    )
  })

  it('C12: second upsert with expectedRevision 1 advances to revision 2', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: correlationRef('c12-first'),
      idempotencyRef: idempotencyRef('c12-first'),
    }))

    const receipt = await upsertCustomerTaxFacts(backend, upsertPayload({
      legalName: 'Acme Research Pty Ltd',
      expectedRevision: 1,
      correlationRef: correlationRef('c12-second'),
      idempotencyRef: idempotencyRef('c12-second'),
    }))

    expect(receipt).toMatchObject({ kind: 'updated', revision: 2 })
    expect(await listTaxFactsRows(backend)).toMatchObject([{
      legalName: 'Acme Research Pty Ltd',
      revision: 2,
    }])
  })

  it('C13: active member can read and upsert tax facts', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expect(readCustomerTaxFacts(backend)).resolves.toMatchObject({
      kind: 'missing',
      accountRef: ACCOUNT_REF,
    })

    const receipt = await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: correlationRef('c13'),
      idempotencyRef: idempotencyRef('c13'),
    }))

    expect(receipt).toMatchObject({ kind: 'updated', revision: 1 })
    await expect(readCustomerTaxFacts(backend)).resolves.toMatchObject({
      kind: 'available',
      abn: '51824753556',
    })
  })

  it('C14: principal with no access fact refuses account_access_missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { omit: 'access' })

    await expectTaxFactsRefusal(
      () => readCustomerTaxFacts(backend),
      'account_access_missing',
    )
    await expectTaxFactsRefusal(
      () => upsertCustomerTaxFacts(backend, upsertPayload()),
      'account_access_missing',
    )
  })

  it('C15: upserts bind strictly to the active account selection', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      legalName: 'Workspace A Tax Profile',
      correlationRef: correlationRef('c15-a'),
      idempotencyRef: idempotencyRef('c15-a'),
    }))

    await setActiveWorkspace(backend, ACCOUNT_B)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      legalName: 'Workspace B Tax Profile',
      correlationRef: correlationRef('c15-b'),
      idempotencyRef: idempotencyRef('c15-b'),
    }))

    const rows = await listTaxFactsRows(backend)
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.accountRef === ACCOUNT_REF)).toMatchObject({
      legalName: 'Workspace A Tax Profile',
      abn: '51824753556',
    })
    expect(rows.find((row) => row.accountRef === ACCOUNT_B)).toMatchObject({
      legalName: 'Workspace B Tax Profile',
      abn: '51824753556',
    })
  })

  it('C16: persisted facts admit tax invoice issuance when policy is enabled', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await upsertCustomerTaxFacts(backend, upsertPayload({
      correlationRef: correlationRef('c16'),
      idempotencyRef: idempotencyRef('c16'),
    }))

    const customerTaxFacts = await backend.run(async (ctx) =>
      readCustomerTaxFactsForAccount(ctx, ACCOUNT_REF))

    expect(customerTaxFacts).toBeDefined()
    if (customerTaxFacts === undefined) throw new Error('expected customerTaxFacts')
    expect(admitTaxInvoiceIssuance({
      taxControl: enabledTaxControl,
      customerTaxFacts,
    })).toEqual({ kind: 'admitted' })
  })
})
