import { paginationOptsValidator, paginationResultValidator, type GenericDatabaseReader, type UserIdentity } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from '../../../interactiveAuthority'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { fundingTaxDocumentStatusValue, readFundingTaxDocuments } from '../documents/taxInvoices'

const ownerInvoiceHistoryRowValue = v.object({
  commandRef: v.string(),
  createdAt: v.number(),
  description: v.string(),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  status: v.union(v.literal('succeeded'), v.literal('reversed')),
  appliedTransactionRef: v.union(v.string(), v.null()),
  hasPaymentReceipt: v.boolean(),
  taxInvoice: fundingTaxDocumentStatusValue,
  adjustmentNote: v.optional(fundingTaxDocumentStatusValue),
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
  const res = await resolveActiveAccountRefForPrincipal(db, canonicalPrincipalRef, identity)
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

function fundingCommandInvoiceDescription(): string {
  return 'Account top-up'
}

function isTerminalFundingState(state: Doc<'moneyFundingCommands'>['state']): boolean {
  return state === 'succeeded' || state === 'reversed'
}

export async function listOwnerInvoiceHistoryHandler(
  ctx: QueryCtx,
  args: { paginationOpts: Infer<typeof paginationOptsValidator> },
): Promise<Infer<typeof listOwnerInvoiceHistoryResult>> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { page: [], isDone: true, continueCursor: '' }
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
    const documents = await readFundingTaxDocuments(ctx, command, Date.now())
    page.push({
      commandRef: command.commandRef,
      createdAt: command.createdAt,
      description: fundingCommandInvoiceDescription(),
      principalUnits: command.principalUnits,
      serviceFeeUnits: command.serviceFeeUnits,
      taxUnits: command.taxUnits,
      totalUnits: command.totalUnits,
      status: (command.state === 'succeeded' ? 'succeeded' : 'reversed') as 'succeeded' | 'reversed',
      appliedTransactionRef: command.appliedTransactionRef ?? null,
      hasPaymentReceipt: typeof command.paymentId === 'string' && command.paymentId.length > 0,
      ...documents,
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
