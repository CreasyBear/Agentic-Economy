import { auth } from '@clerk/tanstack-react-start/server'
import { setResponseHeader } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import {
  accountRefForOwner,
  compareExactAmounts,
  isMoneyRefusal,
  type ExactAmount,
  type MoneyRefusal,
} from '../public'
import type {
  CreditPaymentEvidence,
  CreditPaymentPort,
  CreditPaymentRequest,
  CreditPaymentSession,
} from './ports'
import {
  createStripeMoneyProvider,
  readStripeMoneyProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'
import type { StripeCheckoutWebhookEvent } from './stripe-webhook'

type Environment = Readonly<Record<string, string | undefined>>

export type CreditTopupBeginInput = Readonly<{
  principalId: string
  amount: ExactAmount
  idempotencyKey: string
}>

export type CreditTopupOutcomeUnknownResult = Readonly<{
  kind: 'outcome_unknown'
  code: 'credit_topup_outcome_unknown'
  retryable: false
  commandRef: string
  status: 'outcome_unknown'
}>

export type CreditTopupStartResult =
  | Readonly<{ kind: 'ok'; commandRef: string; session: CreditPaymentSession }>
  | CreditTopupOutcomeUnknownResult
  | MoneyRefusal

export type CreditTopupReadInput =
  | Readonly<{ externalRef: string; idempotencyKey: string }>
  | Readonly<{ commandRef: string; idempotencyKey: string }>

const topupBeginInputSchema = z.strictObject({
  principalId: z.string().trim().min(1).max(500),
  amount: z.strictObject({
    currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
    units: z.string().regex(/^(0|[1-9]\d*)$/u),
    exponent: z.number().int().min(0).max(18),
  }),
  idempotencyKey: z.string().trim().min(8).max(200),
})
const topupReadInputSchema = z.union([
  z.strictObject({
    externalRef: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
  z.strictObject({
    commandRef: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
])

type TopupCommandView = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  amountUnits: string
  processingFeeUnits: string
  chargeAmountUnits: string
  currency: string
  exponent: number
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  providerRecoveryDeadlineAt: number
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  externalRef?: string
  paymentId?: string
  metadataDigest?: string
  requestDigest?: string
  checkoutSessionDigest?: string
  paymentIntentDigest?: string
  evidenceDigest?: string
  providerEvidenceRef?: string
}>
export type CreditTopupServerRuntime = Readonly<{
  env?: Environment
  mode?: StripeMoneyMode
  config?: StripeMoneyProviderConfig
  client?: StripeMoneyClient
  provider?: CreditPaymentPort
  resolveOwnerId?: () => Promise<string | undefined>
}>
async function defaultResolveOwnerId(): Promise<string | undefined> {
  const { userId } = await auth()
  return userId ?? undefined
}
type SourceWriteBoundArgs = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>
type ReserveTopupArgs = CreditTopupBeginInput &
  Readonly<{
    accountRef: string
    commandRef: string
    inputDigest: string
    successReturnRef: string
    operationKey: string
    correlationId: string
  }> &
  SourceWriteBoundArgs
type WebhookTopupCommandInput = Readonly<{
  commandRef: string
  externalRef: string
  serviceAuth: ConvexServerFunctionAssertion
}>
type ReserveTopupResult =
  Readonly<{ kind: 'accepted'; command: TopupCommandView }> | MoneyRefusal
type ReadTopupResult = ReserveTopupResult
type BindTopupResult = ReserveTopupResult
export type BindTopupArgs = Readonly<{
  commandRef: string
  evidence: Readonly<{
    externalRef: string
    amount: ExactAmount
    status: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
    evidenceRef: string
    requestDigest: string
    metadataDigest: string
    checkoutSessionDigest: string
    paymentIntentDigest?: string
    evidenceDigest: string
    paymentId?: string
  }>
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs
type MarkTopupOutcomeUnknownArgs = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  amount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  providerRecoveryDeadlineAt: number
  externalRef?: string
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs
const markTopupOutcomeUnknownMutation = sourceMutation<
  MarkTopupOutcomeUnknownArgs,
  ReserveTopupResult
>('moneyLedger:markCreditTopupOutcomeUnknown')
const reserveTopupMutation = sourceMutation<
  ReserveTopupArgs,
  ReserveTopupResult
>('moneyLedger:reserveCreditTopup')
const readTopupQuery = sourceQuery<CreditTopupReadInput, ReadTopupResult>(
  'moneyLedger:readCreditTopupCommand',
)
export const readWebhookTopupCommandQuery = sourceQuery<
  WebhookTopupCommandInput,
  ReadTopupResult
>('moneyLedger:readCreditTopupWebhookCommand')
const bindTopupMutation = sourceMutation<BindTopupArgs, BindTopupResult>(
  'moneyLedger:bindCreditPaymentSession',
)
function createCreditTopupProvider(
  runtime: CreditTopupServerRuntime,
): CreditPaymentPort | MoneyRefusal {
  if (runtime.provider !== undefined) return runtime.provider
  const config =
    runtime.config ??
    readStripeMoneyProviderConfig(runtime.env ?? process.env, runtime.mode)
  if (isMoneyRefusal(config)) return config
  if (runtime.mode !== undefined && config.mode !== runtime.mode)
    return { kind: 'refused', code: 'stripe_setup_required', retryable: false }
  return createStripeMoneyProvider({
    config,
    ...(runtime.client === undefined ? {} : { client: runtime.client }),
  })
}

export const beginCreditTopupServer = createServerFn({ method: 'POST' })
  .validator((data) => topupBeginInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<CreditTopupStartResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await beginCreditTopupThroughSource(data, context)
  })

export const readCreditPaymentServer = createServerFn({ method: 'POST' })
  .validator((data) => topupReadInputSchema.parse(data))
  .handler(
    async ({ data, context }): Promise<CreditPaymentSession | MoneyRefusal> => {
      setResponseHeader('cache-control', 'no-store')
      return await readCreditPaymentThroughSource(data, context)
    },
  )

export async function beginCreditTopupThroughSource(
  input: CreditTopupBeginInput,
  context?: unknown,
  runtime: CreditTopupServerRuntime = {},
): Promise<CreditTopupStartResult> {
  const ownerId = await (runtime.resolveOwnerId ?? defaultResolveOwnerId)()
  if (ownerId === undefined)
    return { kind: 'refused', code: 'billing_identity_missing', retryable: false }
  const accountRef = accountRefForOwner(ownerId, input.amount.currency)
  const provider = createCreditTopupProvider(runtime)
  if (isMoneyRefusal(provider)) return provider
  const commandRef = canonicalDigest({
    format: 'money-topup-command:v1',
    principalId: input.principalId,
    accountRef,
    idempotencyKey: input.idempotencyKey,
  })
  const inputDigest = canonicalDigest({
    format: 'money-topup-input:v1',
    principalId: input.principalId,
    accountRef,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  })
  const successReturnRef = `${resolveCanonicalBaseUrl().baseUrl}/owner/credit`
  const operationKey = 'moneyLedger:reserveCreditTopup'
  const correlationId = commandRef
  const commandArgs = {
    ...input,
    accountRef,
    commandRef,
    inputDigest,
    successReturnRef,
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command: commandArgs,
    scope: 'billing',
    operationKey,
    correlationId,
  })
  const reserved = await callSourceMutation(reserveTopupMutation, {
    ...commandArgs,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  if (isMoneyRefusal(reserved)) return reserved
  const command = reserved.command
  if (command.state === 'outcome_unknown') return topupOutcomeUnknown(command)
  const payment = await provider.createOrRecoverCreditPayment(
    creditPaymentRequestFromCommand(command, command.externalRef),
  )
  if (isMoneyRefusal(payment)) {
    if (payment.code !== 'credit_topup_outcome_unknown') return payment
    if (
      command.externalRef === undefined &&
      Date.now() < command.providerRecoveryDeadlineAt
    )
      return payment
    return await markTopupOutcomeUnknown(command, context)
  }
  const bound = await bindTopupEvidence({
    commandRef: command.commandRef,
    evidence: payment.evidence,
    context,
    operationKey: 'moneyLedger:bindCreditPaymentSession',
    correlationId,
  })
  if (isMoneyRefusal(bound)) return bound
  return { kind: 'ok', commandRef: command.commandRef, session: payment }
}

export async function readCreditPaymentThroughSource(
  input: CreditTopupReadInput,
  context?: unknown,
  runtime: CreditTopupServerRuntime = {},
): Promise<CreditPaymentSession | MoneyRefusal> {
  const command = await callSourceQuery(readTopupQuery, input)
  if (isMoneyRefusal(command)) return command
  const provider = createCreditTopupProvider(runtime)
  if (isMoneyRefusal(provider)) return provider
  const externalRef =
    'externalRef' in input ? input.externalRef : command.command.externalRef
  if (externalRef === undefined)
    return { kind: 'refused', code: 'credit_topup_outcome_unknown', retryable: true }
  const payment = await provider.readCreditPayment({
    ...creditPaymentRequestFromCommand(command.command),
    externalRef,
  })
  if (isMoneyRefusal(payment)) return payment
  const bound = await bindTopupEvidence({
    commandRef: command.command.commandRef,
    evidence: payment.evidence,
    context,
    operationKey: 'moneyLedger:bindCreditPaymentSession',
    correlationId: command.command.commandRef,
  })
  return isMoneyRefusal(bound) ? bound : payment
}

async function bindTopupEvidence(
  input: Readonly<{
    commandRef: string
    evidence: BindTopupArgs['evidence']
    context?: unknown
    operationKey: string
    correlationId: string
  }>,
): Promise<BindTopupResult> {
  const command = {
    commandRef: input.commandRef,
    evidence: input.evidence,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context: input.context,
    command,
    scope: 'billing',
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
  return await callSourceMutation(bindTopupMutation, {
    ...command,
    evidence: {
      externalRef: input.evidence.externalRef,
      amount: input.evidence.amount,
      status: input.evidence.status,
      evidenceRef: input.evidence.evidenceRef,
      requestDigest: input.evidence.requestDigest,
      metadataDigest: input.evidence.metadataDigest,
      evidenceDigest: input.evidence.evidenceDigest,
      checkoutSessionDigest: input.evidence.checkoutSessionDigest,
      ...(input.evidence.paymentIntentDigest === undefined
        ? {}
        : { paymentIntentDigest: input.evidence.paymentIntentDigest }),
      ...(input.evidence.paymentId === undefined
        ? {}
        : { paymentId: input.evidence.paymentId }),
    },
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
}
function topupOutcomeUnknown(
  command: Pick<TopupCommandView, 'commandRef'>,
): CreditTopupOutcomeUnknownResult {
  return {
    kind: 'outcome_unknown',
    code: 'credit_topup_outcome_unknown',
    retryable: false,
    commandRef: command.commandRef,
    status: 'outcome_unknown',
  }
}

async function markTopupOutcomeUnknown(
  command: TopupCommandView,
  context?: unknown,
): Promise<CreditTopupStartResult> {
  const operationKey = 'moneyLedger:markCreditTopupOutcomeUnknown'
  const correlationId = command.commandRef
  const mutationCommand: Omit<
    MarkTopupOutcomeUnknownArgs,
    'sourceWrite' | 'sourceWriteRequest'
  > = {
    commandRef: command.commandRef,
    principalId: command.principalId,
    accountRef: command.accountRef,
    amount: {
      currency: command.currency,
      units: command.amountUnits,
      exponent: command.exponent,
    },
    idempotencyKey: command.idempotencyKey,
    inputDigest: command.inputDigest,
    successReturnRef: command.successReturnRef,
    providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
    ...(command.externalRef === undefined
      ? {}
      : { externalRef: command.externalRef }),
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command: mutationCommand,
    scope: 'billing',
    operationKey,
    correlationId,
  })
  const marked = await callSourceMutation(markTopupOutcomeUnknownMutation, {
    ...mutationCommand,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  if (isMoneyRefusal(marked)) return marked
  return topupOutcomeUnknown(marked.command)
}

function exactAmountFromCommand(command: TopupCommandView): ExactAmount {
  return {
    currency: command.currency,
    units: command.chargeAmountUnits,
    exponent: command.exponent,
  }
}
export function creditPaymentRequestFromCommand(
  command: TopupCommandView,
  boundExternalRef?: string,
): CreditPaymentRequest & Readonly<{ boundExternalRef?: string }> {
  return {
    commandRef: command.commandRef,
    principalId: command.principalId,
    accountRef: command.accountRef,
    amount: exactAmountFromCommand(command),
    idempotencyKey: command.idempotencyKey,
    inputDigest: command.inputDigest,
    successReturnRef: command.successReturnRef,
    providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
    ...(boundExternalRef === undefined ? {} : { boundExternalRef }),
  }
}
export function checkoutWebhookReadbackRefusal(
  command: TopupCommandView,
  event: StripeCheckoutWebhookEvent,
  evidence: CreditPaymentEvidence,
): MoneyRefusal | undefined {
  const amount = exactAmountFromCommand(command)
  const statusMatches =
    event.status === 'paid'
      ? evidence.status === 'succeeded' &&
        evidence.checkoutStatus === 'complete' &&
        evidence.paymentStatus === 'paid'
      : event.status === 'expired'
        ? evidence.status === 'failed' &&
          evidence.checkoutStatus === 'expired' &&
          evidence.paymentStatus !== 'paid'
        : evidence.status !== 'succeeded' && evidence.paymentStatus !== 'paid'
  const eventTypeMatches =
    event.eventType === 'checkout.session.completed'
      ? evidence.checkoutStatus === 'complete'
      : event.eventType === 'checkout.session.expired'
        ? evidence.checkoutStatus === 'expired'
        : event.eventType === 'checkout.session.async_payment_succeeded'
          ? evidence.paymentStatus === 'paid'
          : (evidence.checkoutStatus === 'open' ||
              evidence.checkoutStatus === 'complete') &&
            evidence.paymentStatus !== 'paid'
  const paymentIdentityMatches =
    command.paymentId === undefined || command.paymentId === evidence.paymentId
  const paymentDigestMatches =
    command.paymentIntentDigest === undefined ||
    command.paymentIntentDigest === evidence.paymentIntentDigest
  if (
    command.commandRef !== event.commandRef ||
    (command.externalRef !== undefined &&
      command.externalRef !== event.externalRef) ||
    event.externalRef !== event.sessionId ||
    evidence.externalRef !== event.sessionId ||
    compareExactAmounts(amount, event.amount) !== 0 ||
    compareExactAmounts(amount, evidence.amount) !== 0 ||
    event.metadataDigest !== evidence.metadataDigest ||
    command.metadataDigest !== evidence.metadataDigest ||
    (command.requestDigest !== undefined &&
      command.requestDigest !== evidence.requestDigest) ||
    (command.checkoutSessionDigest !== undefined &&
      command.checkoutSessionDigest !== evidence.checkoutSessionDigest) ||
    !paymentIdentityMatches ||
    !paymentDigestMatches ||
    event.checkoutSessionDigest !== evidence.checkoutSessionDigest ||
    event.paymentIntentDigest !== evidence.paymentIntentDigest ||
    event.paymentId !== evidence.paymentId ||
    !statusMatches ||
    !eventTypeMatches
  )
    return { kind: 'refused', code: 'ledger_idempotency_conflict', retryable: false }
  return undefined
}
