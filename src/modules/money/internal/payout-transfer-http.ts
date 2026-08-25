import { setResponseHeader } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import {
  accountRefForProvider,
  exactAmountSchema,
  isMoneyRefusal,
  payoutTransferCommand,
  type ExactAmount,
  type MoneyRefusal,
} from '../public'
import type {
  PayoutTransferEvidence,
  PayoutTransferNotReleasedEvidence,
  PayoutTransferRequest,
} from './ports'
import { readOwnerPayoutAccountQuery } from './payout-connect-http'
import {
  ownerBusiness,
  ownerCurrency,
  optionalProperty,
  payoutProvider,
  readOptionalNumber,
  readOptionalString,
  sourceWriteOrRefusal,
  type OwnerMoneyServerRuntime,
} from './payout-http-runtime'

type OwnerMoneyActionRefusal = MoneyRefusal

type OwnerPayoutTransferView = Readonly<{
  businessId: string
  payoutRef: string
  payoutCommandId: string
  state: string
  idempotencyKey: string
  inputDigest: string
  amount: ExactAmount
  destinationAccountId: string
  stripeTransferId?: string
  transferStatus?: PayoutTransferEvidence['status']
  requestDigest?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  providerRecoveryDeadlineAt?: number
  recoveryState?: 'provider_id' | 'idempotency_key' | 'admin_intervention'
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}>

export type OwnerPayoutTransferResult =
  | Readonly<{ kind: 'ok'; transfer: OwnerPayoutTransferView }>
  | OwnerMoneyActionRefusal

export type OwnerPayoutTransferInput = Readonly<{
  businessId: string
  currency: string
  payoutRef: string
  amount: ExactAmount
  idempotencyKey: string
}>

export type OwnerPayoutTransferReadInput = Readonly<{
  businessId: string
  currency: string
  payoutRef: string
  idempotencyKey: string
}>

const ownerPayoutTransferInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  payoutRef: z.string().trim().min(1).max(500),
  amount: exactAmountSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
})
const ownerPayoutTransferReadInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  payoutRef: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
})

const readOwnerPayoutTransferQuery = sourceQuery<
  Record<string, string>,
  Readonly<{ kind: 'accepted'; transfer: unknown } | OwnerMoneyActionRefusal>
>('moneyLedger:readOwnerPayoutTransfer')
const beginPayoutTransferMutation = sourceMutation<
  Record<string, unknown>,
  unknown
>('moneyLedger:beginPayoutTransfer')
const completePayoutTransferMutation = sourceMutation<
  Record<string, unknown>,
  Readonly<{ kind: 'accepted'; transfer: unknown } | OwnerMoneyActionRefusal>
>('moneyLedger:completePayoutTransfer')
const reconcilePayoutTransferMutation = sourceMutation<
  Record<string, unknown>,
  Readonly<{ kind: 'accepted'; transfer: unknown } | OwnerMoneyActionRefusal>
>('moneyLedger:reconcilePayoutTransfer')
const markPayoutTransferOutcomeUnknownMutation = sourceMutation<
  Record<string, unknown>,
  Readonly<{ kind: 'accepted'; transfer: unknown } | OwnerMoneyActionRefusal>
>('moneyLedger:markPayoutTransferOutcomeUnknown')

export const beginOwnerPayoutTransferServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPayoutTransferInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await runOwnerPayoutTransferThroughSource(data, context)
  })

export const recoverOwnerPayoutTransferServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerPayoutTransferInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await runOwnerPayoutTransferThroughSource(data, context, {
      recovery: true,
    })
  })

export const readOwnerPayoutTransferServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPayoutTransferReadInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await readOwnerPayoutTransferThroughSource(data, context)
  })

export async function runOwnerPayoutTransferThroughSource(
  input: OwnerPayoutTransferInput,
  context?: unknown,
  options: Readonly<{ recovery?: boolean }> = {},
  runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerPayoutTransferResult> {
  const owner = await ownerBusiness(input.businessId, context)
  if (owner.kind === 'refused') return owner
  if (options.recovery !== true) {
    const currency = ownerCurrency(owner.value, input.currency)
    if (currency === undefined || currency.payout.payoutRef !== input.payoutRef)
      return { kind: 'refused', code: 'payout_not_ready', retryable: false }
  }
  const command = options.recovery
    ? await readBoundPayoutCommand(input, context)
    : await beginPayoutCommand(input, context, runtime)
  if (isMoneyRefusal(command)) return command
  return await executePayoutTransfer(
    command,
    context,
    runtime,
    options.recovery === true,
  )
}

async function readBoundPayoutCommand(
  input: OwnerPayoutTransferReadInput,
  _context?: unknown,
): Promise<OwnerPayoutTransferView | MoneyRefusal> {
  const stored = await callSourceQuery(readOwnerPayoutTransferQuery, {
    businessId: input.businessId,
    currency: input.currency,
    payoutRef: input.payoutRef,
    idempotencyKey: input.idempotencyKey,
  })
  if (isMoneyRefusal(stored)) return stored
  const command = readTransferView(stored, input.businessId)
  return command === undefined
    ? { kind: 'refused', code: 'payout_reconciliation_required', retryable: true }
    : command
}

export async function readOwnerPayoutTransferThroughSource(
  input: OwnerPayoutTransferReadInput,
  context?: unknown,
  runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerPayoutTransferResult> {
  const owner = await ownerBusiness(input.businessId, context)
  if (owner.kind === 'refused') return owner
  const stored = await callSourceQuery(readOwnerPayoutTransferQuery, {
    businessId: input.businessId,
    currency: input.currency,
    payoutRef: input.payoutRef,
    idempotencyKey: input.idempotencyKey,
  })
  if (isMoneyRefusal(stored)) return stored
  const command = readTransferView(stored, input.businessId)
  if (command === undefined)
    return { kind: 'refused', code: 'payout_reconciliation_required', retryable: true }
  if (command.stripeTransferId === undefined)
    return {
      kind: 'ok',
      transfer: withRecoveryState(command, runtime.now ?? Date.now()),
    }
  const providerResult = payoutProvider(runtime)
  if (isMoneyRefusal(providerResult)) return providerResult
  const evidence = await providerResult.provider.readTransfer({
    externalRef: command.stripeTransferId,
    idempotencyKey: command.idempotencyKey,
  })
  if (isMoneyRefusal(evidence)) return evidence
  return await applyPayoutEvidence(command, evidence, context, runtime)
}

async function beginPayoutCommand(
  input: OwnerPayoutTransferInput,
  context: unknown,
  runtime: OwnerMoneyServerRuntime,
): Promise<OwnerPayoutTransferView | MoneyRefusal> {
  const gate = payoutProvider(runtime)
  if (isMoneyRefusal(gate)) return gate
  const providerAccountRef = accountRefForProvider(
    input.businessId,
    input.currency,
  )
  const operationKey = 'moneyLedger:beginPayoutTransfer'
  const binding = await callSourceQuery(readOwnerPayoutAccountQuery, {
    businessId: input.businessId,
    currency: input.currency,
  })
  if (binding === null || binding.stripeAccountId.length === 0)
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  const observedAt = runtime.now ?? Date.now()
  const minted = payoutTransferCommand({
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    amount: input.amount,
    providerAccountRef,
    destinationAccountId: binding.stripeAccountId,
    idempotencyKey: input.idempotencyKey,
    observedAt,
  })
  if (minted === undefined)
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  const correlationId = minted.commandId
  const command = {
    authority: { principalId: `business:${input.businessId}` },
    ...minted,
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteOrRefusal(
    context,
    command,
    operationKey,
    correlationId,
  )
  if (isMoneyRefusal(sourceWrite)) return sourceWrite
  const begun = await callSourceMutation(beginPayoutTransferMutation, {
    ...command,
    ...sourceWrite,
  })
  if (isMoneyRefusal(begun)) return begun
  const transfer = readTransferView(begun, input.businessId)
  return transfer === undefined
    ? { kind: 'refused', code: 'payout_reconciliation_required', retryable: true }
    : transfer
}

async function executePayoutTransfer(
  command: OwnerPayoutTransferView,
  context: unknown,
  runtime: OwnerMoneyServerRuntime,
  recovery: boolean,
): Promise<OwnerPayoutTransferResult> {
  const now = runtime.now ?? Date.now()
  if (
    command.state !== 'transfer_pending' &&
    command.state !== 'outcome_unknown'
  )
    return { kind: 'ok', transfer: withRecoveryState(command, now) }
  const request: PayoutTransferRequest = {
    payoutRef: command.payoutRef,
    commandId: command.payoutCommandId,
    destinationAccountId: command.destinationAccountId,
    amount: command.amount,
    inputDigest: command.requestDigest ?? command.inputDigest,
    idempotencyKey: command.idempotencyKey,
  }
  if (
    command.stripeTransferId === undefined &&
    command.providerRecoveryDeadlineAt !== undefined &&
    now >= command.providerRecoveryDeadlineAt
  ) {
    if (!recovery)
      return { kind: 'ok', transfer: withRecoveryState(command, now) }
    const providerResult = payoutProvider(runtime)
    if (isMoneyRefusal(providerResult)) return providerResult
    const evidence = await providerResult.provider.readTransfersByIdentity(request)
    if (isMoneyRefusal(evidence))
      return { kind: 'ok', transfer: withRecoveryState(command, now) }
    if (evidence.length === 0) {
      if (command.requestDigest === undefined)
        return { kind: 'ok', transfer: withRecoveryState(command, now) }
      return await applyPayoutEvidence(
        command,
        {
          provider: 'stripe',
          resolution: 'not_released',
          destinationAccountId: command.destinationAccountId,
          amount: command.amount,
          status: 'failed',
          requestDigest: command.requestDigest,
          evidenceDigest: canonicalDigest({
            format: 'stripe-transfer-group-empty:v1',
            transferGroup: command.payoutRef,
            payoutCommandId: command.payoutCommandId,
            idempotencyKey: command.idempotencyKey,
            requestDigest: command.requestDigest,
            destinationAccountId: command.destinationAccountId,
            amount: command.amount,
          }),
          observedAt: now,
        },
        context,
        runtime,
      )
    }
    if (evidence.length !== 1 || evidence[0] === undefined)
      return { kind: 'ok', transfer: withRecoveryState(command, now) }
    return await applyPayoutEvidence(command, evidence[0], context, runtime)
  }
  const providerResult = payoutProvider(runtime)
  if (isMoneyRefusal(providerResult)) return providerResult
  const evidence =
    await providerResult.provider.createOrRecoverTransfer({
      ...request,
      ...(command.stripeTransferId === undefined
        ? {}
        : { boundExternalRef: command.stripeTransferId }),
    })
  if (isMoneyRefusal(evidence)) {
    return evidence.code === 'payout_outcome_unknown'
      ? await markPayoutOutcomeUnknown(command, evidence.code, context, runtime)
      : evidence
  }
  return await applyPayoutEvidence(command, evidence, context, runtime)
}

async function applyPayoutEvidence(
  command: OwnerPayoutTransferView,
  evidence: PayoutTransferEvidence | PayoutTransferNotReleasedEvidence,
  context: unknown,
  runtime: OwnerMoneyServerRuntime,
): Promise<OwnerPayoutTransferResult> {
  const noTransferId = 'resolution' in evidence
  const reconcile =
    noTransferId ||
    (command.state === 'outcome_unknown' && evidence.status === 'failed')
  const operationKey = reconcile
    ? 'moneyLedger:reconcilePayoutTransfer'
    : 'moneyLedger:completePayoutTransfer'
  const correlationId = command.payoutCommandId
  const sourceDigest = canonicalDigest({
    format: 'money-payout-evidence:v1',
    evidence: evidence.evidenceDigest,
  })
  const commandArgs = {
    authority: { principalId: `business:${command.businessId}` },
    businessId: command.businessId,
    payoutRef: command.payoutRef,
    providerAccountRef: accountRefForProvider(
      command.businessId,
      command.amount.currency,
    ),
    destinationAccountId: command.destinationAccountId,
    commandId: command.payoutCommandId,
    amount: command.amount,
    inputDigest: command.inputDigest,
    idempotencyKey: command.idempotencyKey,
    evidence,
    sourceDigest,
    evidenceRefs: [evidence.evidenceDigest],
    observedAt: runtime.now ?? Date.now(),
    operationKey,
    correlationId,
  }
  const mutationCommand = reconcile
    ? { ...commandArgs, outcome: 'not_released' as const }
    : commandArgs
  const sourceWrite = await sourceWriteOrRefusal(
    context,
    mutationCommand,
    operationKey,
    correlationId,
  )
  if (isMoneyRefusal(sourceWrite)) return sourceWrite
  const result = reconcile
    ? await callSourceMutation(reconcilePayoutTransferMutation, {
        ...mutationCommand,
        ...sourceWrite,
      })
    : await callSourceMutation(completePayoutTransferMutation, {
        ...mutationCommand,
        ...sourceWrite,
      })
  if (isMoneyRefusal(result)) return result
  const transfer = readTransferView(result, command.businessId)
  return transfer === undefined
    ? { kind: 'refused', code: 'payout_reconciliation_required', retryable: true }
    : {
        kind: 'ok',
        transfer: withRecoveryState(transfer, runtime.now ?? Date.now()),
      }
}

async function markPayoutOutcomeUnknown(
  command: OwnerPayoutTransferView,
  failureCode: string,
  context: unknown,
  runtime: OwnerMoneyServerRuntime,
): Promise<OwnerPayoutTransferResult> {
  if (
    command.providerRecoveryDeadlineAt === undefined ||
    command.requestDigest === undefined
  )
    return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
  const operationKey = 'moneyLedger:markPayoutTransferOutcomeUnknown'
  const correlationId = command.payoutCommandId
  const mutationCommand = {
    authority: { principalId: `business:${command.businessId}` },
    businessId: command.businessId,
    payoutRef: command.payoutRef,
    amount: command.amount,
    providerAccountRef: accountRefForProvider(
      command.businessId,
      command.amount.currency,
    ),
    destinationAccountId: command.destinationAccountId,
    commandId: command.payoutCommandId,
    inputDigest: command.inputDigest,
    requestDigest: command.requestDigest,
    idempotencyKey: command.idempotencyKey,
    providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
    failureCode,
    observedAt: runtime.now ?? Date.now(),
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteOrRefusal(
    context,
    mutationCommand,
    operationKey,
    correlationId,
  )
  if (isMoneyRefusal(sourceWrite)) return sourceWrite
  const result = await callSourceMutation(
    markPayoutTransferOutcomeUnknownMutation,
    {
      ...mutationCommand,
      ...sourceWrite,
    },
  )
  if (isMoneyRefusal(result)) return result
  const transfer = readTransferView(result, command.businessId)
  return transfer === undefined
    ? { kind: 'refused', code: 'payout_reconciliation_required', retryable: true }
    : {
        kind: 'ok',
        transfer: withRecoveryState(transfer, runtime.now ?? Date.now()),
      }
}

function withRecoveryState(
  transfer: OwnerPayoutTransferView,
  now: number,
): OwnerPayoutTransferView {
  const state = recoveryState(transfer, now)
  return state === undefined ? transfer : { ...transfer, recoveryState: state }
}

function recoveryState(
  transfer: OwnerPayoutTransferView,
  now: number,
): OwnerPayoutTransferView['recoveryState'] {
  if (
    transfer.state !== 'transfer_pending' &&
    transfer.state !== 'outcome_unknown'
  )
    return undefined
  if (transfer.stripeTransferId !== undefined) return 'provider_id'
  return transfer.providerRecoveryDeadlineAt !== undefined &&
    now < transfer.providerRecoveryDeadlineAt
    ? 'idempotency_key'
    : 'admin_intervention'
}

function readTransferView(
  value: unknown,
  businessId: string,
): OwnerPayoutTransferView | undefined {
  if (
    !isRecord(value) ||
    value.kind !== 'accepted' ||
    !isRecord(value.transfer)
  )
    return undefined
  const transfer = value.transfer
  const amount = exactAmountSchema.safeParse(transfer.amount)
  const providerHeldBefore = readOptionalExactAmount(
    transfer,
    'providerHeldBefore',
  )
  const providerHeldAfter = readOptionalExactAmount(
    transfer,
    'providerHeldAfter',
  )
  const providerPaidBefore = readOptionalExactAmount(
    transfer,
    'providerPaidBefore',
  )
  const providerPaidAfter = readOptionalExactAmount(
    transfer,
    'providerPaidAfter',
  )
  if (
    !amount.success ||
    typeof transfer.payoutRef !== 'string' ||
    typeof transfer.payoutCommandId !== 'string' ||
    typeof transfer.state !== 'string' ||
    typeof transfer.idempotencyKey !== 'string' ||
    typeof transfer.inputDigest !== 'string' ||
    typeof transfer.destinationAccountId !== 'string'
  )
    return undefined
  if (
    (transfer.state === 'paid' || transfer.state === 'reversed') &&
    (providerHeldBefore === undefined ||
      providerHeldAfter === undefined ||
      providerPaidBefore === undefined ||
      providerPaidAfter === undefined)
  )
    return undefined
  return {
    businessId,
    payoutRef: transfer.payoutRef,
    payoutCommandId: transfer.payoutCommandId,
    state: transfer.state,
    idempotencyKey: transfer.idempotencyKey,
    inputDigest: transfer.inputDigest,
    amount: amount.data,
    destinationAccountId: transfer.destinationAccountId,
    ...optionalProperty(
      'stripeTransferId',
      readOptionalString(transfer, 'stripeTransferId'),
    ),
    ...optionalProperty(
      'transferStatus',
      readOptionalTransferStatus(transfer, 'transferStatus'),
    ),
    ...optionalProperty(
      'requestDigest',
      readOptionalString(transfer, 'requestDigest'),
    ),
    ...optionalProperty(
      'evidenceDigest',
      readOptionalString(transfer, 'evidenceDigest'),
    ),
    ...optionalProperty(
      'reversalEvidenceDigest',
      readOptionalString(transfer, 'reversalEvidenceDigest'),
    ),
    ...optionalProperty(
      'providerRecoveryDeadlineAt',
      readOptionalNumber(transfer, 'providerRecoveryDeadlineAt'),
    ),
    ...optionalProperty('providerHeldBefore', providerHeldBefore),
    ...optionalProperty('providerHeldAfter', providerHeldAfter),
    ...optionalProperty('providerPaidBefore', providerPaidBefore),
    ...optionalProperty('providerPaidAfter', providerPaidAfter),
  }
}

function readOptionalExactAmount(
  value: unknown,
  key: string,
): ExactAmount | undefined {
  if (!isRecord(value)) return undefined
  const parsed = exactAmountSchema.safeParse(value[key])
  return parsed.success ? parsed.data : undefined
}
function readOptionalTransferStatus(
  value: unknown,
  key: string,
): PayoutTransferEvidence['status'] | undefined {
  const status = readOptionalString(value, key)
  return status === 'pending' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'reversed' ||
    status === 'outcome_unknown'
    ? status
    : undefined
}
