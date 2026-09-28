import { paginationOptsValidator, paginationResultValidator, type GenericDatabaseReader, type UserIdentity } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from '../../../interactiveAuthority'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { admitTaxInvoiceIssuance } from '../../../../src/modules/money/public'

const ownerInvoiceHistoryTaxInvoiceValue = v.union(
  v.object({ kind: v.literal('issued'), documentRef: v.string() }),
  v.object({
    kind: v.literal('withheld'),
    reason: v.union(
      v.literal('policy_disabled'),
      v.literal('customer_tax_facts_missing'),
      v.literal('tax_invoice_not_generated'),
    ),
  }),
)
const ownerInvoiceHistoryRowValue = v.object({
  commandRef: v.string(),
  createdAt: v.number(),
  description: v.string(),
  totalUnits: v.string(),
  status: v.union(v.literal('succeeded'), v.literal('reversed')),
  appliedTransactionRef: v.union(v.string(), v.null()),
  hasPaymentReceipt: v.boolean(),
  taxInvoice: ownerInvoiceHistoryTaxInvoiceValue,
})
export const listOwnerInvoiceHistoryArgs = { paginationOpts: paginationOptsValidator }
export const listOwnerInvoiceHistoryResult = paginationResultValidator(ownerInvoiceHistoryRowValue)
export const readOwnerFundingCommandForReceiptArgs = { commandRef: v.string() }
export const readOwnerFundingCommandForReceiptResult = v.object({
  paymentId: v.string(),
})

type InvoiceHistoryDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipalForInvoiceHistory(
  db: InvoiceHistoryDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}

async function requireOwnerAccountContextForInvoiceHistory(
  db: InvoiceHistoryDb,
  identity: UserIdentity,
): Promise<{ canonicalAccountRef: ReturnType<typeof accountRef> }> {
  const principal = await requireInteractiveHumanPrincipalForInvoiceHistory(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const res = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(res.activeAccountRef)
  const access = await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  if (access.kind !== 'ownership') {
    throw new InteractiveAuthorityError('authority_mismatch')
  }
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { canonicalAccountRef }
}

function fundingCommandInvoiceDescription(command: Doc<'moneyFundingCommands'>): string {
  const initiationKind = command.initiationKind as string | undefined
  return initiationKind === 'auto_recharge' ? 'Auto-recharge' : 'Account top-up'
}

function isTerminalFundingState(state: Doc<'moneyFundingCommands'>['state']): boolean {
  return state === 'succeeded' || state === 'reversed'
}

async function resolveFundingCommandTaxInvoice(
  ctx: QueryCtx,
  input: Readonly<{
    accountRef: string
    environment: Doc<'moneyFundingCommands'>['environment']
    appliedTransactionRef: string | undefined
  }>,
): Promise<
  | Readonly<{ kind: 'issued'; documentRef: string }>
  | Readonly<{ kind: 'withheld'; reason: 'policy_disabled' | 'customer_tax_facts_missing' | 'tax_invoice_not_generated' }>
> {
  if (input.appliedTransactionRef !== undefined) {
    const documentRef = `money-document:tax_invoice:${input.appliedTransactionRef}`
    const document = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef))
      .unique()
    if (document !== null && document.kind === 'tax_invoice' && document.state === 'issued') {
      return { kind: 'issued', documentRef: document.documentRef }
    }
  }

  const customerTaxFacts = await ctx.db.query('moneyCustomerTaxFacts')
    .withIndex('by_accountRef', (index) => index.eq('accountRef', input.accountRef))
    .unique()
  if (customerTaxFacts === null) {
    return { kind: 'withheld', reason: 'customer_tax_facts_missing' }
  }

  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: input.environment,
    now: Date.now(),
    ...(input.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') {
    return { kind: 'withheld', reason: 'policy_disabled' }
  }

  const admission = admitTaxInvoiceIssuance({
    taxControl: policy.controls.tax,
    customerTaxFacts,
  })
  if (admission.kind === 'withheld') {
    if (admission.reason === 'policy_disabled') {
      return { kind: 'withheld', reason: 'policy_disabled' }
    }
    return { kind: 'withheld', reason: 'customer_tax_facts_missing' }
  }

  return { kind: 'withheld', reason: 'tax_invoice_not_generated' }
}

export async function listOwnerInvoiceHistoryHandler(
  ctx: QueryCtx,
  args: { paginationOpts: Infer<typeof paginationOptsValidator> },
): Promise<Infer<typeof listOwnerInvoiceHistoryResult>> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  const { canonicalAccountRef } = await requireOwnerAccountContextForInvoiceHistory(ctx.db, identity)
  if (!Number.isSafeInteger(args.paginationOpts.numItems)
    || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
    throw new InteractiveAuthorityError('payload_invalid')
  }

  const commands = await ctx.db
    .query('moneyFundingCommands')
    .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', canonicalAccountRef))
    .order('desc')
    .paginate(args.paginationOpts)

  const page = []
  for (const command of commands.page) {
    if (!isTerminalFundingState(command.state)) continue
    const taxInvoice = await resolveFundingCommandTaxInvoice(ctx, {
      accountRef: canonicalAccountRef,
      environment: command.environment,
      appliedTransactionRef: command.appliedTransactionRef,
    })
    page.push({
      commandRef: command.commandRef,
      createdAt: command.createdAt,
      description: fundingCommandInvoiceDescription(command),
      totalUnits: command.totalUnits,
      status: (command.state === 'succeeded' ? 'succeeded' : 'reversed') as 'succeeded' | 'reversed',
      appliedTransactionRef: command.appliedTransactionRef ?? null,
      hasPaymentReceipt: typeof command.paymentId === 'string' && command.paymentId.length > 0,
      taxInvoice,
    })
  }

  return { ...commands, page }
}

export async function readOwnerFundingCommandForReceiptHandler(
  ctx: QueryCtx,
  args: { commandRef: string },
) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  const { canonicalAccountRef } = await requireOwnerAccountContextForInvoiceHistory(ctx.db, identity)

  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (index) => index.eq('commandRef', args.commandRef))
    .unique()
  if (command === null || command.accountRef !== canonicalAccountRef) {
    throw new InteractiveAuthorityError('funding_command_not_found')
  }
  if (!isTerminalFundingState(command.state)) {
    throw new InteractiveAuthorityError('funding_command_not_receiptable')
  }
  if (typeof command.paymentId !== 'string' || command.paymentId.length === 0) {
    throw new InteractiveAuthorityError('funding_command_not_receiptable')
  }
  return { paymentId: command.paymentId }
}
