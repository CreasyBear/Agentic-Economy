import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { COMMERCIAL_POLICY_FAMILIES } from '../../../src/modules/money/public'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`

type FundingTerminalState = 'succeeded' | 'reversed' | 'pending' | 'failed' | 'outcome_unknown'

type OwnerInvoiceHistoryRow = Readonly<{
  commandRef: string
  createdAt: number
  description: string
  totalUnits: string
  status: 'succeeded' | 'reversed'
  appliedTransactionRef: string | null
  hasPaymentReceipt: boolean
  taxInvoice: Readonly<
    | { kind: 'issued'; documentRef: string }
    | { kind: 'withheld'; reason: 'customer_tax_facts_missing' | 'policy_disabled' }
  >
}>

type ListOwnerInvoiceHistoryResult = Readonly<{
  page: readonly OwnerInvoiceHistoryRow[]
}>

type ReadOwnerFundingCommandForReceiptResult = Readonly<{
  paymentId: string
}>

const listOwnerInvoiceHistoryRef = makeFunctionReference<
  'query',
  Record<string, never>,
  ListOwnerInvoiceHistoryResult
>('moneyAccountFunding:listOwnerInvoiceHistory')

const readOwnerFundingCommandForReceiptRef = makeFunctionReference<
  'query',
  { commandRef: string },
  ReadOwnerFundingCommandForReceiptResult
>('moneyAccountFunding:readOwnerFundingCommandForReceipt')

const setActiveWorkspaceRef = internal.interactiveSession.setActiveWorkspace

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

async function listOwnerInvoiceHistory(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<ListOwnerInvoiceHistoryResult> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(listOwnerInvoiceHistoryRef, {})
}

async function readOwnerFundingCommandForReceipt(
  backend: InteractiveAuthorityBackend,
  commandRef: string,
  presentedIdentity: UserIdentity = identity(),
): Promise<ReadOwnerFundingCommandForReceiptResult> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readOwnerFundingCommandForReceiptRef, { commandRef })
}

async function expectInvoiceHistoryRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function insertFundingCommand(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    commandRef: string
    accountRef: string
    state: FundingTerminalState
    createdAt: number
    paymentId?: string
    appliedTransactionRef?: string
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyFundingCommands', {
      commandRef: input.commandRef,
      accountRef: input.accountRef,
      legalCustomerRef: `legal-customer:${input.accountRef}`,
      actorPrincipalRef: PRINCIPAL_REF,
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      principalUnits: '5000000',
      serviceFeeUnits: '250000',
      taxUnits: '30000',
      totalUnits: '5280000',
      commercialPolicyDigest: canonicalDigest({ kind: 'policy', commandRef: input.commandRef }),
      commercialPolicyRefs: ['commercial-policy:sandbox'],
      idempotencyKey: input.commandRef,
      inputDigest: canonicalDigest({ kind: 'input', commandRef: input.commandRef }),
      successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: NOW + 60_000,
      initiationKind: 'owner_top_up',
      state: input.state,
      ...(input.paymentId === undefined ? {} : { paymentId: input.paymentId }),
      ...(input.appliedTransactionRef === undefined
        ? {}
        : { appliedTransactionRef: input.appliedTransactionRef }),
      ...(input.state === 'succeeded' || input.state === 'reversed'
        ? {
            externalRef: `cs_${input.commandRef}`,
            providerStatus: input.state,
            appliedStripeEventId: `evt_${input.commandRef}`,
            appliedPayloadDigest: canonicalDigest({ kind: 'applied', commandRef: input.commandRef }),
          }
        : {}),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
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
    correlationRef: `invoice-history:workspace:${accountRef}`,
  })
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
  })
}

async function seedCustomerTaxFacts(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyCustomerTaxFacts', {
      accountRef: ACCOUNT_REF,
      abn: '51824753556',
      gstRegistered: true,
      legalCustomerRef: PRINCIPAL_REF,
      legalName: 'Acme Technologies Pty Ltd',
      addressLine1: '1 Market Street',
      locality: 'Sydney',
      region: 'NSW',
      postalCode: '2000',
      country: 'AU',
      effectiveAt: NOW,
      updatedAt: NOW,
      revision: 1,
    })
  })
}

async function enableSandboxTaxInvoicePolicy(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
      const control = family === 'tax'
        ? { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, taxInvoiceIssuance: 'enabled' as const }
        : PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family]
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: `commercial-policy:${family}:w24-sandbox`,
        family,
        environment: 'sandbox',
        revision: 1,
        lifecycle: 'active',
        effectiveAt: NOW - 1,
        expiresAt: NOW + 86_400_000,
        evidenceRef: `approval:${family}:w24-sandbox`,
        evidenceDigest: `sha256:${String(index).padStart(64, '0')}`,
        control,
        approvedByPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_REF,
        authorityGeneration: 1,
        correlationRef: `correlation:${family}:w24-sandbox`,
        idempotencyRef: `idempotency:${family}:w24-sandbox`,
        commandDigest: `sha256:${String(index + 1).padStart(64, '0')}`,
        activatedAt: NOW - 1,
        updatedAt: NOW - 1,
      })
    }
  })
}

async function insertIssuedTaxInvoice(
  backend: InteractiveAuthorityBackend,
  sourceTransactionRef: string,
): Promise<string> {
  const documentRef = `money-document:tax_invoice:${sourceTransactionRef}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: ACCOUNT_REF,
      kind: 'tax_invoice',
      sourceTransactionRefs: [sourceTransactionRef],
      amountUnits: '5280000',
      residualUnits: '0',
      policyRefs: ['commercial-policy:sandbox'],
      policyDigest: canonicalDigest({ kind: 'policy', documentRef }),
      templateVersion: 'v1',
      renderInputJson: '{}',
      renderInputDigest: canonicalDigest({ kind: 'render', documentRef }),
      state: 'issued',
      environment: 'sandbox',
      sourceCount: 1,
      snapshotDigest: canonicalDigest({ kind: 'snapshot', documentRef }),
      createdAt: NOW,
    })
  })
  return documentRef
}

describe('moneyAccountFunding invoice history (W-24)', () => {
  it('H1: listOwnerInvoiceHistory returns only terminal commands for the active account, newest first', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)
    await setActiveWorkspace(backend, ACCOUNT_REF)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h1:older',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW - 2_000,
      paymentId: 'pi_h1_older',
      appliedTransactionRef: 'formance:tx:h1:older',
    })
    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h1:newer',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW - 1_000,
      paymentId: 'pi_h1_newer',
      appliedTransactionRef: 'formance:tx:h1:newer',
    })
    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h1:foreign',
      accountRef: ACCOUNT_B,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h1_foreign',
      appliedTransactionRef: 'formance:tx:h1:foreign',
    })

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page.map((row) => row.commandRef)).toEqual([
      'funding:w24:h1:newer',
      'funding:w24:h1:older',
    ])
    expect(result.page.every((row) => row.status === 'succeeded')).toBe(true)
  })

  it('H2: listOwnerInvoiceHistory omits pending, failed, and outcome_unknown commands', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h2:terminal',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h2_terminal',
      appliedTransactionRef: 'formance:tx:h2:terminal',
    })
    for (const [index, state] of (['pending', 'failed', 'outcome_unknown'] as const).entries()) {
      await insertFundingCommand(backend, {
        commandRef: `funding:w24:h2:${state}`,
        accountRef: ACCOUNT_REF,
        state,
        createdAt: NOW - index - 1,
      })
    }

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page).toHaveLength(1)
    expect(result.page[0]?.commandRef).toBe('funding:w24:h2:terminal')
  })

  it('H3: listOwnerInvoiceHistory includes reversed commands with status reversed', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h3:reversed',
      accountRef: ACCOUNT_REF,
      state: 'reversed',
      createdAt: NOW,
      paymentId: 'pi_h3_reversed',
      appliedTransactionRef: 'formance:tx:h3:reversed',
    })

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page).toEqual([
      expect.objectContaining({
        commandRef: 'funding:w24:h3:reversed',
        status: 'reversed',
      }),
    ])
  })

  it('H4: listOwnerInvoiceHistory includes issued tax invoice documentRef when tax_invoice exists', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const appliedTransactionRef = 'formance:tx:h4:issued'

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h4:issued',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h4_issued',
      appliedTransactionRef,
    })
    const documentRef = await insertIssuedTaxInvoice(backend, appliedTransactionRef)

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page[0]?.taxInvoice).toEqual({
      kind: 'issued',
      documentRef,
    })
  })

  it('H5: listOwnerInvoiceHistory withholds tax invoice when customer tax facts are missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await enableSandboxTaxInvoicePolicy(backend)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h5:withheld',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h5_withheld',
      appliedTransactionRef: 'formance:tx:h5:withheld',
    })

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page[0]?.taxInvoice).toEqual({
      kind: 'withheld',
      reason: 'customer_tax_facts_missing',
    })
  })

  it('H6: listOwnerInvoiceHistory withholds tax invoice when commercial policy disables issuance', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCustomerTaxFacts(backend)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h6:policy',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h6_policy',
      appliedTransactionRef: 'formance:tx:h6:policy',
    })

    const result = await listOwnerInvoiceHistory(backend)

    expect(result.page[0]?.taxInvoice).toEqual({
      kind: 'withheld',
      reason: 'policy_disabled',
    })
  })

  it('H7: readOwnerFundingCommandForReceipt returns paymentId for owner terminal command and refuses cross-account or pending', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)
    await setActiveWorkspace(backend, ACCOUNT_REF)

    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h7:owned',
      accountRef: ACCOUNT_REF,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h7_owned',
      appliedTransactionRef: 'formance:tx:h7:owned',
    })
    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h7:foreign',
      accountRef: ACCOUNT_B,
      state: 'succeeded',
      createdAt: NOW,
      paymentId: 'pi_h7_foreign',
      appliedTransactionRef: 'formance:tx:h7:foreign',
    })
    await insertFundingCommand(backend, {
      commandRef: 'funding:w24:h7:pending',
      accountRef: ACCOUNT_REF,
      state: 'pending',
      createdAt: NOW - 1,
    })

    await expect(readOwnerFundingCommandForReceipt(backend, 'funding:w24:h7:owned')).resolves.toEqual({
      paymentId: 'pi_h7_owned',
    })

    await expectInvoiceHistoryRefusal(
      () => readOwnerFundingCommandForReceipt(backend, 'funding:w24:h7:foreign'),
      'funding_command_not_found',
    )
    await expectInvoiceHistoryRefusal(
      () => readOwnerFundingCommandForReceipt(backend, 'funding:w24:h7:pending'),
      'funding_command_not_receiptable',
    )
  })
})
