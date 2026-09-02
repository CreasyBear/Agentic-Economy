import { v, type Infer } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { env, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { exactAmount, serverFunctionAuth, stripeMoneyWebhookEventArg } from './moneyLedgerValues'
import { eventRowFields, eventRowMatches } from './moneyStripeEvents'
import {
  resolveAndBindLegalCustomer,
} from './lib/moneyLegalCustomer'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  compareExactAmounts,
  quoteAudAccountFunding,
} from '../src/modules/money/public'

const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
const fundingStateValue = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
const fundingProviderEvidenceArg = v.object({
  externalRef: v.string(),
  amount: exactAmount,
  status: fundingStateValue,
  evidenceRef: v.string(),
  requestDigest: v.string(),
  metadataDigest: v.string(),
  checkoutSessionDigest: v.string(),
  paymentIntentDigest: v.optional(v.string()),
  evidenceDigest: v.string(),
  paymentId: v.optional(v.string()),
})
const fundingCommandValue = v.object({
  commandRef: v.string(),
  accountRef: v.string(),
  legalCustomerRef: v.string(),
  actorPrincipalRef: v.string(),
  environment: environmentValue,
  currency: v.literal('AUD'),
  exponent: v.literal(6),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  commercialPolicyDigest: v.string(),
  commercialPolicyRefs: v.array(v.string()),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  successReturnRef: v.string(),
  providerRecoveryDeadlineAt: v.number(),
  state: fundingStateValue,
  externalRef: v.optional(v.string()),
  providerStatus: v.optional(fundingStateValue),
  providerEvidenceRef: v.optional(v.string()),
  requestDigest: v.optional(v.string()),
  metadataDigest: v.optional(v.string()),
  checkoutSessionDigest: v.optional(v.string()),
  paymentIntentDigest: v.optional(v.string()),
  evidenceDigest: v.optional(v.string()),
  paymentId: v.optional(v.string()),
  appliedStripeEventId: v.optional(v.string()),
  appliedPayloadDigest: v.optional(v.string()),
  appliedTransactionRef: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const fundingResultValue = v.union(
  v.object({ kind: v.literal('accepted'), command: fundingCommandValue }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)
const reserveFundingArgsValue = v.object({
  amountUnits: v.string(),
  environment: environmentValue,
  commandRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  successReturnRef: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
const bindFundingArgsValue = v.object({
  commandRef: v.string(),
  evidence: fundingProviderEvidenceArg,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
const applyFundingEventArgsValue = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: fundingProviderEvidenceArg,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
const readFundingArgsValue = v.object({
  commandRef: v.optional(v.string()),
  externalRef: v.optional(v.string()),
  idempotencyKey: v.string(),
})
const markFundingUnknownArgsValue = v.object({
  commandRef: v.string(),
  idempotencyKey: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
const readWebhookFundingArgsValue = v.object({
  commandRef: v.string(),
  externalRef: v.string(),
  serviceAuth: serverFunctionAuth,
})
const applyFundingEventResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    appliedRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)
const fundingBookingValue = v.object({
  commandRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  processorRef: v.string(),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  policyDigest: v.string(),
  externalEvidenceDigest: v.string(),
})
const prepareFundingEventResultValue = v.union(
  v.object({ kind: v.literal('prepared'), booking: fundingBookingValue }),
  applyFundingEventResultValue,
)

type ReserveFundingArgs = Infer<typeof reserveFundingArgsValue>
type BindFundingArgs = Infer<typeof bindFundingArgsValue>
type ApplyFundingEventArgs = Infer<typeof applyFundingEventArgsValue>
type FundingResult = Infer<typeof fundingResultValue>
type ApplyFundingEventResult = Infer<typeof applyFundingEventResultValue>

const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1_000
const POSITIVE_UNITS = /^[1-9]\d{0,29}$/u
const SHA256 = /^sha256:[a-f0-9]{64}$/u
const FUNDING_WEBHOOK_LOOKUP_OPERATION = 'moneyAccountFunding:readWebhookCommand'
const FUNDING_WEBHOOK_LOOKUP_SCOPE = 'money:funding_webhook_read'

async function recordFundingDocuments(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  transactionRef: string,
  occurredAt: number,
): Promise<void> {
  const definitions = [
    {
      kind: 'funding_receipt' as const,
      amountUnits: command.principalUnits,
      detail: {
        principalUnits: command.principalUnits,
        serviceFeeUnits: command.serviceFeeUnits,
        taxUnits: command.taxUnits,
        totalUnits: command.totalUnits,
      },
    },
    {
      kind: 'service_fee_document' as const,
      amountUnits: (BigInt(command.serviceFeeUnits) + BigInt(command.taxUnits)).toString(),
      detail: { serviceFeeUnits: command.serviceFeeUnits, taxUnits: command.taxUnits },
    },
  ]
  for (const definition of definitions) {
    const documentRef = `money-document:${definition.kind}:${transactionRef}`
    const existing = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (query) => query.eq('documentRef', documentRef))
      .unique()
    if (existing !== null) continue
    const renderInput = {
      format: 'ae.money-document-render-input:v1',
      documentRef,
      accountRef: command.accountRef,
      kind: definition.kind,
      currency: 'AUD',
      exponent: AUD_EXPONENT,
      amountUnits: definition.amountUnits,
      detail: definition.detail,
      transactionRef,
      occurredAt,
      policyRefs: command.commercialPolicyRefs,
      policyDigest: command.commercialPolicyDigest,
    } as const satisfies StableHashValue
    const renderInputJson = stableStringify(renderInput)
    const renderInputDigest = canonicalDigest(renderInput)
    await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: command.accountRef,
      kind: definition.kind,
      sourceTransactionRefs: [transactionRef],
      amountUnits: definition.amountUnits,
      residualUnits: '0',
      policyRefs: [...command.commercialPolicyRefs],
      policyDigest: command.commercialPolicyDigest,
      templateVersion: 'ae.money-document:html:v1',
      renderInputJson,
      renderInputDigest,
      state: 'rendering',
      environment: command.environment,
      sourceCount: 1,
      snapshotDigest: renderInputDigest,
      createdAt: occurredAt,
    })
  }
}

function fundingCommandView(row: Doc<'moneyFundingCommands'>) {
  const { _id, _creationTime, ...view } = row
  return view
}

function refused(code: string, retryable = false) {
  return { kind: 'refused' as const, code, retryable }
}

async function reserveFundingHandler(
  ctx: MutationCtx,
  args: ReserveFundingArgs,
): Promise<FundingResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  if (!POSITIVE_UNITS.test(args.amountUnits)
    || !SHA256.test(args.inputDigest)) return refused('funding_amount_invalid')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')

  const prior = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_idempotencyKey', (builder) => builder.eq('idempotencyKey', args.idempotencyKey))
    .unique()
  if (prior !== null) {
    return prior.commandRef === args.commandRef
      && prior.accountRef === actor.canonicalAccountRef
      && prior.inputDigest === args.inputDigest
      && prior.principalUnits === args.amountUnits
      && prior.environment === args.environment
      ? { kind: 'accepted', command: fundingCommandView(prior) }
      : refused('funding_idempotency_conflict')
  }
  const now = Date.now()
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: args.environment,
    now,
    ...(args.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return refused('commercial_policy_required')
  const fundingPolicy = audFundingPolicyFromCommercialControls(policy.controls)
  const quote = quoteAudAccountFunding(BigInt(args.amountUnits), fundingPolicy)
  if (quote === undefined) return refused('funding_amount_invalid')
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, actor.canonicalAccountRef, now)
  if (legalCustomer.kind === 'refused') return refused(legalCustomer.code)

  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'funding.top_up',
    target: {
      targetType: 'account_aud_prepayment',
      targetRef: actor.canonicalAccountRef,
      targetRevision: Math.max(1, actor.authorityRevision.account),
    },
    requiredScopes: ['billing'],
    resourceRefs: [`account:${actor.canonicalAccountRef}`],
    budgetAmount: 0,
    consequenceSummary: 'Fund this Account AUD prepayment through Stripe.',
    statusReadbackRef: '/owner/credit',
    command: {
      version: 'ae.account-funding-command:v1',
      commandRef: args.commandRef,
      accountRef: actor.canonicalAccountRef,
      legalCustomerRef: legalCustomer.legalCustomerRef,
      environment: args.environment,
      principalUnits: quote.principalUnits.toString(),
      serviceFeeUnits: quote.serviceFeeUnits.toString(),
      taxUnits: quote.taxUnits.toString(),
      totalUnits: quote.totalUnits.toString(),
      commercialPolicyDigest: policy.policyDigest,
      inputDigest: args.inputDigest,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    now,
  })
  if (consequence.kind === 'refused') return refused(consequence.code)
  const row = {
    commandRef: args.commandRef,
    accountRef: actor.canonicalAccountRef,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    actorPrincipalRef: actor.canonicalPrincipalRef,
    environment: args.environment,
    currency: 'AUD' as const,
    exponent: AUD_EXPONENT,
    principalUnits: quote.principalUnits.toString(),
    serviceFeeUnits: quote.serviceFeeUnits.toString(),
    taxUnits: quote.taxUnits.toString(),
    totalUnits: quote.totalUnits.toString(),
    commercialPolicyDigest: policy.policyDigest,
    commercialPolicyRefs: [...policy.policyRefs],
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    successReturnRef: args.successReturnRef,
    providerRecoveryDeadlineAt: now + RECOVERY_WINDOW_MS,
    state: 'pending' as const,
    providerStatus: 'pending' as const,
    metadataDigest: canonicalDigest({ ae_command_ref: args.commandRef }),
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyFundingCommands', row)
  return { kind: 'accepted', command: row }
}

async function bindFundingHandler(
  ctx: MutationCtx,
  args: BindFundingArgs,
): Promise<FundingResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command === null || command.accountRef !== actor.canonicalAccountRef) {
    return refused('funding_pending', true)
  }
  if (compareExactAmounts(args.evidence.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) !== 0
    || (command.externalRef !== undefined && command.externalRef !== args.evidence.externalRef)
    || (command.metadataDigest !== undefined && command.metadataDigest !== args.evidence.metadataDigest)) {
    return refused('payment_binding_invalid')
  }
  await ctx.db.patch(command._id, {
    externalRef: args.evidence.externalRef,
    providerStatus: args.evidence.status,
    providerEvidenceRef: args.evidence.evidenceRef,
    requestDigest: args.evidence.requestDigest,
    metadataDigest: args.evidence.metadataDigest,
    checkoutSessionDigest: args.evidence.checkoutSessionDigest,
    ...(args.evidence.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: args.evidence.paymentIntentDigest }),
    evidenceDigest: args.evidence.evidenceDigest,
    ...(args.evidence.paymentId === undefined ? {} : { paymentId: args.evidence.paymentId }),
    updatedAt: Date.now(),
  })
  const updated = await ctx.db.get(command._id)
  return updated === null ? refused('funding_pending', true) : { kind: 'accepted', command: fundingCommandView(updated) }
}

async function readFundingHandler(
  ctx: QueryCtx,
  args: Infer<typeof readFundingArgsValue>,
): Promise<FundingResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  if ((args.commandRef === undefined) === (args.externalRef === undefined)) {
    return refused('payment_binding_invalid')
  }
  const command = args.commandRef !== undefined
    ? await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef!))
      .unique()
    : await ctx.db.query('moneyFundingCommands')
      .withIndex('by_externalRef', (builder) => builder.eq('externalRef', args.externalRef!))
      .unique()
  return command === null
    || command.accountRef !== actor.canonicalAccountRef
    || command.idempotencyKey !== args.idempotencyKey
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}

async function fundingWebhookLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion,
  commandRef: string,
  externalRef: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined
    || key.length < 32
    || !serviceAuth.scopes.includes(FUNDING_WEBHOOK_LOOKUP_SCOPE)) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: FUNDING_WEBHOOK_LOOKUP_OPERATION,
    command: { commandRef, externalRef },
    assertion: serviceAuth,
  })
}

async function readWebhookFundingHandler(
  ctx: QueryCtx,
  args: Infer<typeof readWebhookFundingArgsValue>,
): Promise<FundingResult> {
  if (!await fundingWebhookLookupAuthorized(
    args.serviceAuth,
    args.commandRef,
    args.externalRef,
  )) return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  return command === null
    || (command.externalRef !== undefined && command.externalRef !== args.externalRef)
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}

async function markFundingUnknownHandler(
  ctx: MutationCtx,
  args: Infer<typeof markFundingUnknownArgsValue>,
): Promise<FundingResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command === null
    || command.accountRef !== actor.canonicalAccountRef
    || command.idempotencyKey !== args.idempotencyKey) return refused('funding_pending', true)
  if (command.state === 'failed') return refused('funding_idempotency_conflict')
  if (command.state === 'pending') {
    await ctx.db.patch(command._id, {
      state: 'outcome_unknown',
      providerStatus: 'outcome_unknown',
      updatedAt: Date.now(),
    })
  }
  const updated = await ctx.db.get(command._id)
  return updated === null ? refused('funding_outcome_unknown', true) : { kind: 'accepted', command: fundingCommandView(updated) }
}

async function readAccountBalanceSubjectHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const openCase = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_scopeType_and_scopeRef_and_status', (builder) => builder
      .eq('scopeType', 'account')
      .eq('scopeRef', actor.canonicalAccountRef)
      .eq('status', 'open'))
    .first()
  return {
    kind: 'resolved' as const,
    accountRef: actor.canonicalAccountRef,
    locked: openCase !== null,
  }
}

async function prepareFundingEventHandler(
  ctx: MutationCtx,
  args: ApplyFundingEventArgs,
): Promise<Infer<typeof prepareFundingEventResultValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  if (args.event.kind !== 'checkout') return refused('payment_binding_invalid')
  const event = args.event
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', event.commandRef))
    .unique()
  if (command === null) return refused('funding_pending', true)
  const priorEvent = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', event.stripeEventId))
    .unique()
  if (priorEvent !== null) {
    if (!eventRowMatches(priorEvent, event)) return refused('payment_binding_invalid')
    if (priorEvent.status === 'applied' && priorEvent.appliedRef === command.appliedTransactionRef) {
      return {
        kind: 'accepted',
        status: 'replayed',
        ...(priorEvent.appliedRef === undefined ? {} : { appliedRef: priorEvent.appliedRef }),
      }
    }
    if (priorEvent.status !== 'received') return refused('payment_binding_invalid')
  }
  const bound = event.externalRef === args.readback.externalRef
    && compareExactAmounts(event.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) === 0
    && compareExactAmounts(args.readback.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) === 0
    && event.metadataDigest === command.metadataDigest
    && args.readback.metadataDigest === command.metadataDigest
    && event.checkoutSessionDigest === args.readback.checkoutSessionDigest
    && event.paymentIntentDigest === args.readback.paymentIntentDigest
    && event.paymentId === args.readback.paymentId
  if (!bound) return refused('payment_binding_invalid')

  if (event.status !== 'paid') {
    if (command.state === 'succeeded') {
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'ignored',
      })
      return { kind: 'accepted', status: 'ignored' }
    }
    await ctx.db.patch(command._id, {
      state: 'failed',
      providerStatus: 'failed',
      updatedAt: event.observedAt,
    })
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event), status: 'ignored',
    })
    return { kind: 'accepted', status: 'ignored' }
  }
  if (args.readback.status !== 'succeeded') return refused('funding_pending', true)
  if (command.state === 'failed') return refused('funding_state_conflict')
  if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
    ...eventRowFields(event), status: 'received',
  })
  return {
    kind: 'prepared',
    booking: {
      commandRef: command.commandRef,
      accountRef: command.accountRef,
      processorRef: event.externalRef,
      idempotencyKey: command.idempotencyKey,
      principalUnits: command.principalUnits,
      serviceFeeUnits: command.serviceFeeUnits,
      taxUnits: command.taxUnits,
      totalUnits: command.totalUnits,
      policyDigest: command.commercialPolicyDigest,
      externalEvidenceDigest: args.readback.evidenceDigest,
    },
  }
}

async function finalizeFundingEventHandler(
  ctx: MutationCtx,
  args: ApplyFundingEventArgs & Readonly<{ formanceTransactionRef: string }>,
): Promise<ApplyFundingEventResult> {
  if (args.event.kind !== 'checkout' || args.event.status !== 'paid') {
    return refused('payment_binding_invalid')
  }
  const fundingEvent = args.event
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', fundingEvent.commandRef))
    .unique()
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', fundingEvent.stripeEventId))
    .unique()
  if (command === null || event === null || !eventRowMatches(event, args.event)) {
    return refused('payment_binding_invalid')
  }
  if (command.state === 'succeeded') {
    return command.appliedTransactionRef === args.formanceTransactionRef
      ? { kind: 'accepted', status: 'replayed', appliedRef: args.formanceTransactionRef }
      : refused('funding_idempotency_conflict')
  }
  if (event.status !== 'received') return refused('payment_binding_invalid')
  await recordFundingDocuments(ctx, command, args.formanceTransactionRef, args.event.observedAt)
  await ctx.db.patch(command._id, {
    state: 'succeeded',
    providerStatus: 'succeeded',
    externalRef: args.event.externalRef,
    providerEvidenceRef: args.readback.evidenceRef,
    requestDigest: args.readback.requestDigest,
    checkoutSessionDigest: args.readback.checkoutSessionDigest,
    paymentIntentDigest: args.readback.paymentIntentDigest,
    evidenceDigest: args.readback.evidenceDigest,
    paymentId: args.readback.paymentId,
    appliedStripeEventId: args.event.stripeEventId,
    appliedPayloadDigest: args.event.payloadDigest,
    appliedTransactionRef: args.formanceTransactionRef,
    updatedAt: args.event.observedAt,
  })
  await ctx.db.patch(event._id, {
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
    appliedAt: args.event.observedAt,
  })
  return {
    kind: 'accepted',
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
  }
}

async function markFundingBookingUnknownHandler(
  ctx: MutationCtx,
  args: Readonly<{ commandRef: string; stripeEventId: string; observedAt: number }>,
): Promise<void> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command !== null && command.state !== 'succeeded' && command.state !== 'failed') {
    await ctx.db.patch(command._id, {
      state: 'outcome_unknown', providerStatus: 'outcome_unknown', updatedAt: args.observedAt,
    })
  }
}

export const reserve = mutation({
  args: reserveFundingArgsValue.fields,
  returns: fundingResultValue,
  handler: reserveFundingHandler,
})

export const bind = mutation({
  args: bindFundingArgsValue.fields,
  returns: fundingResultValue,
  handler: bindFundingHandler,
})

export const read = query({
  args: readFundingArgsValue.fields,
  returns: fundingResultValue,
  handler: readFundingHandler,
})

export const readWebhookCommand = query({
  args: readWebhookFundingArgsValue.fields,
  returns: fundingResultValue,
  handler: readWebhookFundingHandler,
})

export const markOutcomeUnknown = mutation({
  args: markFundingUnknownArgsValue.fields,
  returns: fundingResultValue,
  handler: markFundingUnknownHandler,
})

export const readBalanceSubject = internalQuery({
  args: {},
  returns: v.union(
    v.object({ kind: v.literal('resolved'), accountRef: v.string(), locked: v.boolean() }),
    v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
  ),
  handler: readAccountBalanceSubjectHandler,
})

export const prepareVerifiedEvent = internalMutation({
  args: applyFundingEventArgsValue.fields,
  returns: prepareFundingEventResultValue,
  handler: prepareFundingEventHandler,
})

export const finalizeVerifiedEvent = internalMutation({
  args: { ...applyFundingEventArgsValue.fields, formanceTransactionRef: v.string() },
  returns: applyFundingEventResultValue,
  handler: finalizeFundingEventHandler,
})

export const markFundingBookingUnknown = internalMutation({
  args: { commandRef: v.string(), stripeEventId: v.string(), observedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markFundingBookingUnknownHandler(ctx, args)
    return null
  },
})
