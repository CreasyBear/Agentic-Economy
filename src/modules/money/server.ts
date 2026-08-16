import { setResponseHeader } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  callPublicSourceAction,
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteAdmissionFromRequest,
} from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createRuntimeId } from '@/modules/common/runtime-id'
import { isRecord } from '@/modules/common/is-record'
import {
  sourceWriteRequestFromAdmission,
  SourceWriteAdmissionError,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import {
  accountRefForProvider,
  compareExactAmounts,
  exactAmountSchema,
  evaluateLiveMoneyGate,
  LIVE_MONEY_GATE_POLICY,
  isMoneyRefusal,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  type ExactAmount,
  type MoneyRefusal,
  type PayoutStatusView,
  type ProviderEarningsView,
} from './public'
import type {
  ConnectAccountPort,
  CreditPaymentEvidence,
  CreditPaymentPort,
  CreditPaymentRequest,
  CreditPaymentSession,
  PayoutTransferEvidence,
  PayoutTransferNotReleasedEvidence,
  PayoutTransferPort,
  PayoutTransferRequest,
} from './internal/ports'
import type { LiveMoneyGatePolicy } from './internal/live-money-gate'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import {
  createStripeMoneyProvider,
  readStripeMoneyProviderConfig,
  verifyStripeMoneyWebhook,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'
import {
  handleStripeWebhookRequest as handleStripeWebhook,
  type StripeAccountUpdatedWebhookEvent,
  type StripeCheckoutWebhookEvent,
  type StripeMoneyWebhookEvent,
  type StripeWebhookApplier,
  type StripeWebhookApplication,
  type StripeWebhookVerifier,
} from './internal/stripe-webhook'
export type {
  ConnectAccountEvidence,
  ConnectAccountPort,
  ConnectAccountRequest,
  CreditPaymentEvidence,
  CreditPaymentPort,
  CreditPaymentReadRequest,
  CreditPaymentRequest,
  CreditPaymentSession,
  OnboardingLinkRequest,
  PayoutTransferEvidence,
  PayoutTransferNotReleasedEvidence,
  PayoutTransferPort,
  PayoutTransferRequest,
} from './internal/ports'

export type {
  StripeAccountUpdatedWebhookEvent,
  StripeCheckoutWebhookEvent,
  StripeMoneyWebhookEvent,
  StripeWebhookApplier,
  StripeWebhookApplication,
  StripeWebhookVerifier,
} from './internal/stripe-webhook'

type Environment = Readonly<Record<string, string | undefined>>

export type CreditTopupBeginInput = Readonly<{
  principalId: string
  accountRef: string
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
  accountRef: z.string().trim().min(1).max(500),
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
  gatePolicy?: LiveMoneyGatePolicy
}>
type SourceWriteBoundArgs = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>
type ReserveTopupArgs = CreditTopupBeginInput &
  Readonly<{
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
type BindTopupArgs = Readonly<{
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
const readWebhookTopupCommandQuery = sourceQuery<
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
    return refusal('stripe_setup_required', false)
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
  const gate = evaluateLiveMoneyGate(
    runtime.gatePolicy ?? LIVE_MONEY_GATE_POLICY,
  )
  if (gate.kind === 'refused') return refusal(gate.code, false)
  if (!input.accountRef.startsWith('owner:'))
    return refusal('billing_identity_mismatch', false)
  const provider = createCreditTopupProvider(runtime)
  if (isMoneyRefusal(provider)) return provider
  const commandRef = canonicalDigest({
    format: 'money-topup-command:v1',
    principalId: input.principalId,
    accountRef: input.accountRef,
    idempotencyKey: input.idempotencyKey,
  })
  const inputDigest = canonicalDigest({
    format: 'money-topup-input:v1',
    principalId: input.principalId,
    accountRef: input.accountRef,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  })
  const successReturnRef = `${resolveCanonicalBaseUrl().baseUrl}/agent-access`
  const operationKey = 'moneyLedger:reserveCreditTopup'
  const correlationId = commandRef
  const commandArgs = {
    ...input,
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
  const gate = evaluateLiveMoneyGate(
    runtime.gatePolicy ?? LIVE_MONEY_GATE_POLICY,
  )
  if (gate.kind === 'refused') return refusal(gate.code, false)
  const command = await callSourceQuery(readTopupQuery, input)
  if (isMoneyRefusal(command)) return command
  const provider = createCreditTopupProvider(runtime)
  if (isMoneyRefusal(provider)) return provider
  const externalRef =
    'externalRef' in input ? input.externalRef : command.command.externalRef
  if (externalRef === undefined)
    return refusal('credit_topup_outcome_unknown', true)
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
function creditPaymentRequestFromCommand(
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
function checkoutWebhookReadbackRefusal(
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
    return refusal('ledger_idempotency_conflict', false)
  return undefined
}
type ApplyVerifiedStripeEventArgs = Readonly<{
  event: StripeMoneyWebhookEvent
  readback: BindTopupArgs['evidence']
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs
type ApplyVerifiedStripeEventResult = StripeWebhookApplication | MoneyRefusal

const applyVerifiedStripeEventAction = sourceAction<
  ApplyVerifiedStripeEventArgs,
  ApplyVerifiedStripeEventResult
>('moneyLedger:applyVerifiedStripeEvent')

export async function applyVerifiedStripeEventThroughSource(
  input: Readonly<{
    event: StripeMoneyWebhookEvent
    rawBody: string
    request: Request
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
    gatePolicy?: LiveMoneyGatePolicy
  }>,
): Promise<ApplyVerifiedStripeEventResult> {
  const gate = evaluateLiveMoneyGate(input.gatePolicy ?? LIVE_MONEY_GATE_POLICY)
  if (gate.kind === 'refused') return refusal(gate.code, false)
  if (input.event.kind === 'account')
    return await applyVerifiedConnectAccountEvent({
      event: input.event,
      rawBody: input.rawBody,
      request: input.request,
      ...(input.env === undefined ? {} : { env: input.env }),
      ...(input.config === undefined ? {} : { config: input.config }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.client === undefined ? {} : { client: input.client }),
      ...(input.gatePolicy === undefined
        ? {}
        : { gatePolicy: input.gatePolicy }),
    })
  let serviceAuth: ConvexServerFunctionAssertion
  try {
    serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'moneyLedger:readCreditTopupWebhookCommand',
      scope: 'money:topup_webhook_read',
      command: {
        commandRef: input.event.commandRef,
        externalRef: input.event.sessionId,
      },
      ...(input.env === undefined ? {} : { env: input.env }),
    })
  } catch {
    return refusal('credit_topup_pending', true)
  }
  const durableCommand = await callPublicSourceQuery(
    readWebhookTopupCommandQuery,
    {
      commandRef: input.event.commandRef,
      externalRef: input.event.sessionId,
      serviceAuth,
    },
    input.env === undefined ? {} : { env: input.env },
  )
  if (isMoneyRefusal(durableCommand)) return durableCommand
  const provider = createStripeMoneyProvider({
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.config === undefined ? {} : { config: input.config }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(input.client === undefined ? {} : { client: input.client }),
  })
  const payment = await provider.readCreditPayment({
    ...creditPaymentRequestFromCommand(durableCommand.command),
    externalRef: input.event.sessionId,
  })
  if (isMoneyRefusal(payment)) return payment
  const readbackRefusal = checkoutWebhookReadbackRefusal(
    durableCommand.command,
    input.event,
    payment.evidence,
  )
  if (readbackRefusal !== undefined) return readbackRefusal
  const operationKey = 'moneyLedger:applyVerifiedStripeEvent'
  const correlationId = input.event.stripeEventId
  const command = {
    event: input.event,
    readback: payment.evidence,
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request: input.request,
    command,
    body: input.rawBody,
    scope: 'billing',
    operationKey,
    correlationId,
    ...(input.env === undefined ? {} : { env: input.env }),
  })
  return await callPublicSourceAction(applyVerifiedStripeEventAction, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
}
async function applyVerifiedConnectAccountEvent(
  input: Readonly<{
    event: StripeAccountUpdatedWebhookEvent
    rawBody: string
    request: Request
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
    gatePolicy?: LiveMoneyGatePolicy
  }>,
): Promise<ApplyVerifiedStripeEventResult> {
  const providerResult = payoutProvider({
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.config === undefined ? {} : { config: input.config }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(input.client === undefined ? {} : { client: input.client }),
    ...(input.gatePolicy === undefined ? {} : { gatePolicy: input.gatePolicy }),
  })
  if (isMoneyRefusal(providerResult)) return providerResult
  let serviceAuth: ConvexServerFunctionAssertion
  try {
    serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'moneyLedger:readPayoutAccountByStripeId',
      scope: 'money:payout_binding_read',
      command: { stripeAccountId: input.event.stripeAccountId },
      ...(input.env === undefined ? {} : { env: input.env }),
    })
  } catch {
    return refusal('payout_not_ready', true)
  }
  const bindings = await callPublicSourceQuery(
    readPayoutAccountByStripeIdQuery,
    {
      stripeAccountId: input.event.stripeAccountId,
      serviceAuth,
    },
  )
  if (bindings.length !== 1) return refusal('payout_not_ready', true)
  const binding = bindings[0]
  if (binding === undefined) return refusal('payout_not_ready', true)
  const evidence = await providerResult.provider.readConnectAccount({
    businessId: binding.businessId,
    currency: binding.currency,
    stripeAccountId: binding.stripeAccountId,
  })
  if (isMoneyRefusal(evidence)) return evidence
  if (evidence.currency !== binding.currency)
    return refusal('payment_binding_invalid', false)
  const operationKey = 'moneyLedger:recordConnectAccountEvent'
  const correlationId = input.event.stripeEventId
  const command = {
    businessId: binding.businessId,
    currency: binding.currency,
    exponent: binding.exponent,
    event: input.event,
    readback: {
      detailsSubmitted: evidence.detailsSubmitted,
      recipientCapabilityActive: evidence.recipientCapabilityActive,
      restricted: evidence.restricted,
      requirementsDigest: evidence.requirementsDigest,
      providerObjectDigest: evidence.providerObjectDigest,
      ...(evidence.providerObjectVersion === undefined
        ? {}
        : { providerObjectVersion: evidence.providerObjectVersion }),
      observedAt: evidence.observedAt,
    },
    ...(binding.version === undefined
      ? {}
      : { expectedVersion: binding.version }),
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request: input.request,
    command,
    body: input.rawBody,
    scope: 'billing',
    operationKey,
    correlationId,
    ...(input.env === undefined ? {} : { env: input.env }),
  })
  const result = await callSourceMutation(recordConnectAccountEventMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  if (isMoneyRefusal(result)) return result
  return {
    kind: 'accepted',
    status:
      result.kind === 'accepted' &&
      binding.lastStripeEventId === input.event.stripeEventId
        ? 'replayed'
        : 'applied',
    appliedRef: `stripe:account:${input.event.stripeAccountId}`,
  }
}

export async function handleStripeWebhookRequest(
  request: Request,
  options: Readonly<{
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
    gatePolicy?: LiveMoneyGatePolicy
  }> = {},
): Promise<Response> {
  const verifier: StripeWebhookVerifier = {
    verify: async ({ rawBody, signature }) =>
      await verifyStripeMoneyWebhook({
        rawBody,
        signature,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.config === undefined ? {} : { config: options.config }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.client === undefined ? {} : { client: options.client }),
      }),
  }
  const applier: StripeWebhookApplier = {
    apply: async ({ event, rawBody }) =>
      await applyVerifiedStripeEventThroughSource({
        event,
        rawBody,
        request,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.config === undefined ? {} : { config: options.config }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.client === undefined ? {} : { client: options.client }),
        ...(options.gatePolicy === undefined
          ? {}
          : { gatePolicy: options.gatePolicy }),
      }),
  }
  return await handleStripeWebhook({ request, verifier, applier })
}

export type OwnerMoneyServerRuntime = Readonly<{
  env?: Environment
  mode?: StripeMoneyMode
  config?: StripeMoneyProviderConfig
  client?: StripeMoneyClient
  provider?: ConnectAccountPort & PayoutTransferPort
  gatePolicy?: LiveMoneyGatePolicy
  now?: number
}>

type OwnerMoneyActionRefusal = MoneyRefusal

type ConnectAccountCommandView = Readonly<{
  commandRef: string
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  inputDigest: string
  providerRequestDigest: string
  providerRecoveryDeadlineAt: number
  recoveryLeaseGeneration: number
  recoveryLeaseOwner?: string
  recoveryLeaseExpiresAt?: number
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  stripeAccountId?: string
  providerEvidenceRef?: string
  failureCode?: string
  failureRetryable?: boolean
}>
type ConnectAccountReservationResult =
  | Readonly<{
      kind: 'accepted'
      command: ConnectAccountCommandView
      execute: boolean
    }>
  | MoneyRefusal
type ConnectAccountOutcome =
  | Readonly<{
      state: 'succeeded'
      stripeAccountId: string
      providerEvidenceRef: string
    }>
  | Readonly<{
      state: 'failed' | 'outcome_unknown'
      failureCode: string
      failureRetryable: boolean
    }>
type ReserveConnectAccountArgs = Readonly<{
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs
type FinalizeConnectAccountArgs = Readonly<{
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  recoveryLeaseGeneration: number
  outcome: ConnectAccountOutcome
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs

type OwnerBusinessProjection = Readonly<
  | {
      kind: 'available'
      businessId: string
      accounts: readonly OwnerBusinessCurrencyProjection[]
    }
  | { kind: 'not_found' }
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
>

type OwnerBusinessCurrencyProjection = Readonly<{
  currency: string
  earnings: ProviderEarningsView
  payout: PayoutStatusView
}>

type ConnectBindingView = Readonly<{
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  state:
    'not_started' | 'onboarding_started' | 'submitted' | 'restricted' | 'ready'
  detailsSubmitted: boolean
  recipientCapabilityActive: boolean
  requirementsDigest?: string
  providerObjectDigest?: string
  providerObjectVersion?: number
  lastStripeEventId?: string
  lastStripePayloadDigest?: string
  version?: number
  createdAt?: number
  updatedAt?: number
}>
type StripePayoutBindingView = Readonly<{
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  lastStripeEventId?: string
  version?: number
}>
const ownerBusinessQuery = sourceQuery<
  Record<string, never>,
  OwnerProviderEarningsReadback
>('moneyLedger:readOwnerProviderEarnings')

export type OwnerConnectReadinessReadback = Readonly<
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
  | { kind: 'not_found' }
  | {
      kind: 'available'
      businessId: string
      accounts: readonly Readonly<{
        currency: string
        account: ConnectBindingView
        payout: PayoutStatusView
      }>[]
      accountsTruncated: boolean
    }
>

export type OwnerConnectAccountResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      currency: string
      stripeAccountId: string
      evidenceRef: string
    }>
  | OwnerMoneyActionRefusal

export type OwnerOnboardingLinkResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      currency: string
      stripeAccountId: string
      url: string
    }>
  | OwnerMoneyActionRefusal

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

export type OwnerConnectAccountInput = Readonly<{
  businessId: string
  currency: string
  idempotencyKey: string
}>

export type OwnerOnboardingLinkInput = Readonly<{
  businessId: string
  currency: string
  idempotencyKey: string
  stripeAccountId?: string
}>

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

const ownerConnectAccountInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  idempotencyKey: z.string().trim().min(8).max(200),
})
const ownerOnboardingLinkInputSchema = ownerConnectAccountInputSchema.extend({
  stripeAccountId: z.string().trim().min(1).max(500).optional(),
})
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

const readPayoutAccountByStripeIdQuery = sourceQuery<
  { stripeAccountId: string; serviceAuth: ConvexServerFunctionAssertion },
  readonly StripePayoutBindingView[]
>('moneyLedger:readPayoutAccountByStripeId')
const readOwnerPayoutAccountQuery = sourceQuery<
  { businessId: string; currency: string },
  ConnectBindingView | null
>('moneyLedger:readOwnerPayoutAccount')
const readOwnerPayoutTransferQuery = sourceQuery<
  Record<string, string>,
  Readonly<{ kind: 'accepted'; transfer: unknown } | OwnerMoneyActionRefusal>
>('moneyLedger:readOwnerPayoutTransfer')
const reserveConnectAccountMutation = sourceMutation<
  ReserveConnectAccountArgs,
  ConnectAccountReservationResult
>('moneyLedger:reserveConnectAccount')
const finalizeConnectAccountMutation = sourceMutation<
  FinalizeConnectAccountArgs,
  ConnectAccountReservationResult
>('moneyLedger:finalizeConnectAccount')
const recordConnectAccountEventMutation = sourceMutation<
  Record<string, unknown>,
  Readonly<
    { kind: 'accepted'; account: ConnectBindingView } | OwnerMoneyActionRefusal
  >
>('moneyLedger:recordConnectAccountEvent')
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

export const createOwnerConnectAccountServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerConnectAccountInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerConnectAccountResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await createOwnerConnectAccountThroughSource(data, context)
  })

export const createOwnerOnboardingLinkServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerOnboardingLinkInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerOnboardingLinkResult> => {
    setResponseHeader('cache-control', 'no-store')
    const normalizedInput: OwnerOnboardingLinkInput = {
      businessId: data.businessId,
      currency: data.currency,
      idempotencyKey: data.idempotencyKey,
      ...(data.stripeAccountId === undefined
        ? {}
        : { stripeAccountId: data.stripeAccountId }),
    }
    return await createOwnerOnboardingLinkThroughSource(
      normalizedInput,
      context,
    )
  })

export const readOwnerConnectReadinessServer = createServerFn({
  method: 'GET',
}).handler(async (): Promise<OwnerConnectReadinessReadback> => {
  setResponseHeader('cache-control', 'no-store')
  return await readOwnerConnectReadinessThroughSource()
})

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

export async function createOwnerConnectAccountThroughSource(
  input: OwnerConnectAccountInput,
  context?: unknown,
  runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerConnectAccountResult> {
  const providerResult = payoutProvider(runtime)
  if (isMoneyRefusal(providerResult)) return providerResult
  const owner = await ownerBusiness(input.businessId, context)
  if (owner.kind === 'refused') return owner
  const currency = ownerCurrency(owner.value, input.currency)
  if (currency === undefined) return refusal('payout_not_ready', false)
  const exponent = currency.earnings.providerNet.exponent
  const commandRef = canonicalDigest({
    format: 'money-connect-account-command:v1',
    businessId: input.businessId,
    currency: input.currency,
    exponent,
    idempotencyKey: input.idempotencyKey,
  })
  const inputDigest = canonicalDigest({
    format: 'money-connect-account-input:v1',
    businessId: input.businessId,
    currency: input.currency,
    exponent,
    idempotencyKey: input.idempotencyKey,
  })
  const providerRequestDigest = canonicalDigest({
    format: 'money-connect-account-provider-request:v1',
    businessId: input.businessId,
    currency: input.currency,
    configuration: 'accounts_v2',
  })
  const reservationLeaseOwner = createRuntimeId('money-connect-account-lease')
  const reserveOperationKey = 'moneyLedger:reserveConnectAccount'
  const reserveCommand = {
    businessId: input.businessId,
    currency: input.currency,
    exponent,
    idempotencyKey: input.idempotencyKey,
    commandRef,
    inputDigest,
    providerRequestDigest,
    recoveryLeaseOwner: reservationLeaseOwner,
    operationKey: reserveOperationKey,
    correlationId: commandRef,
  }
  const reservationSourceWrite = await sourceWriteOrRefusal(
    context,
    reserveCommand,
    reserveOperationKey,
    commandRef,
  )
  if (isMoneyRefusal(reservationSourceWrite)) return reservationSourceWrite
  const reserved = await callSourceMutation(reserveConnectAccountMutation, {
    ...reserveCommand,
    ...reservationSourceWrite,
  })
  if (isMoneyRefusal(reserved)) return reserved
  if (!reserved.execute) {
    if (
      reserved.command.state === 'succeeded' &&
      reserved.command.stripeAccountId !== undefined &&
      reserved.command.providerEvidenceRef !== undefined
    ) {
      return {
        kind: 'ok',
        businessId: input.businessId,
        currency: input.currency,
        stripeAccountId: reserved.command.stripeAccountId,
        evidenceRef: reserved.command.providerEvidenceRef,
      }
    }
    if (reserved.command.failureCode !== undefined) {
      return {
        kind: 'refused',
        code: reserved.command.failureCode as MoneyRefusal['code'],
        retryable: reserved.command.failureRetryable ?? false,
      }
    }
    return refusal('payout_outcome_unknown', false)
  }
  let outcome: ConnectAccountOutcome
  const recoveryLeaseOwner = reserved.command.recoveryLeaseOwner
  if (recoveryLeaseOwner === undefined)
    return refusal('payout_reconciliation_required', false)
  if (
    (runtime.now ?? Date.now()) >= reserved.command.providerRecoveryDeadlineAt
  )
    return refusal('payout_reconciliation_required', false)
  const providerRequest = {
    businessId: reserved.command.businessId,
    currency: reserved.command.currency,
    idempotencyKey: reserved.command.idempotencyKey,
    configuration: 'accounts_v2' as const,
    providerRequestDigest: reserved.command.providerRequestDigest,
    providerRecoveryDeadlineAt: reserved.command.providerRecoveryDeadlineAt,
    recoveryLeaseOwner,
    recoveryLeaseGeneration: reserved.command.recoveryLeaseGeneration,
    ...(reserved.command.stripeAccountId === undefined
      ? {}
      : { boundStripeAccountId: reserved.command.stripeAccountId }),
  }
  const providerResultValue = await Promise.resolve()
    .then(() =>
      providerResult.provider.createOrRecoverConnectAccount(providerRequest),
    )
    .catch(() => refusal('payout_outcome_unknown', false))
  if (isMoneyRefusal(providerResultValue)) {
    outcome =
      providerResultValue.retryable ||
      providerResultValue.code === 'payout_outcome_unknown'
        ? {
            state: 'outcome_unknown',
            failureCode: 'payout_outcome_unknown',
            failureRetryable: false,
          }
        : {
            state: 'failed',
            failureCode: providerResultValue.code,
            failureRetryable: providerResultValue.retryable,
          }
  } else {
    outcome = {
      state: 'succeeded',
      stripeAccountId: providerResultValue.stripeAccountId,
      providerEvidenceRef: providerResultValue.evidenceRef,
    }
  }
  const finalizeOperationKey = 'moneyLedger:finalizeConnectAccount'
  const finalizeCommand = {
    ...reserveCommand,
    providerRequestDigest: reserved.command.providerRequestDigest,
    recoveryLeaseOwner,
    recoveryLeaseGeneration: reserved.command.recoveryLeaseGeneration,
    outcome,
    operationKey: finalizeOperationKey,
    correlationId: commandRef,
  }
  const finalizationSourceWrite = await sourceWriteOrRefusal(
    context,
    finalizeCommand,
    finalizeOperationKey,
    commandRef,
  )
  if (isMoneyRefusal(finalizationSourceWrite))
    return refusal('payout_reconciliation_required', false)
  const finalized = await callSourceMutation(finalizeConnectAccountMutation, {
    ...finalizeCommand,
    ...finalizationSourceWrite,
  })
  if (isMoneyRefusal(finalized)) return finalized
  if (
    finalized.command.state === 'succeeded' &&
    finalized.command.stripeAccountId !== undefined &&
    finalized.command.providerEvidenceRef !== undefined
  ) {
    return {
      kind: 'ok',
      businessId: input.businessId,
      currency: input.currency,
      stripeAccountId: finalized.command.stripeAccountId,
      evidenceRef: finalized.command.providerEvidenceRef,
    }
  }
  if (
    finalized.command.state === 'failed' &&
    finalized.command.failureCode !== undefined
  ) {
    return {
      kind: 'refused',
      code: finalized.command.failureCode as MoneyRefusal['code'],
      retryable: finalized.command.failureRetryable ?? false,
    }
  }
  return refusal('payout_outcome_unknown', false)
}

export async function createOwnerOnboardingLinkThroughSource(
  input: OwnerOnboardingLinkInput,
  context?: unknown,
  runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerOnboardingLinkResult> {
  const owner = await ownerBusiness(input.businessId, context)
  if (owner.kind === 'refused') return owner
  const currency = ownerCurrency(owner.value, input.currency)
  const binding = await callSourceQuery(readOwnerPayoutAccountQuery, {
    businessId: input.businessId,
    currency: input.currency,
  })
  if (
    input.stripeAccountId !== undefined &&
    binding?.stripeAccountId !== input.stripeAccountId
  ) {
    return refusal('payout_not_ready', true)
  }
  const stripeAccountId = binding?.stripeAccountId
  if (currency === undefined || stripeAccountId === undefined)
    return refusal('payout_not_ready', true)
  const providerResult = payoutProvider(runtime)
  if (isMoneyRefusal(providerResult)) return providerResult
  const baseUrl = resolveCanonicalBaseUrl().baseUrl
  const link = await providerResult.provider.createOnboardingLink({
    businessId: input.businessId,
    currency: currency.currency,
    stripeAccountId,
    refreshRef: `${baseUrl}/owner/supply?connect=refresh`,
    returnRef: `${baseUrl}/owner/supply?connect=return`,
    idempotencyKey: input.idempotencyKey,
  })
  if (isMoneyRefusal(link)) return link
  return {
    kind: 'ok',
    businessId: input.businessId,
    currency: input.currency,
    stripeAccountId,
    url: link.url,
  }
}

export async function readOwnerConnectReadinessThroughSource(): Promise<OwnerConnectReadinessReadback> {
  try {
    const result = await callSourceQuery(ownerBusinessQuery, {})
    if (result.kind === 'error' || result.kind === 'not_found') return result
    const accounts = await Promise.all(
      result.accounts.map(async (item) => {
        const binding = await callSourceQuery(readOwnerPayoutAccountQuery, {
          businessId: result.businessId,
          currency: item.currency,
        })
        return {
          currency: item.currency,
          account:
            binding ??
            accountFromPayout(
              result.businessId,
              item.currency,
              item.earnings.providerNet.exponent,
              item.payout,
            ),
          payout: item.payout,
        }
      }),
    )
    return {
      kind: 'available',
      businessId: result.businessId,
      accounts,
      accountsTruncated: result.accounts.length >= 10,
    }
  } catch {
    return { kind: 'error', code: 'source_unavailable' }
  }
}
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
      return refusal('payout_not_ready', false)
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
    ? refusal('payout_reconciliation_required', true)
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
    return refusal('payout_reconciliation_required', true)
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
  const commandId = canonicalDigest({
    format: 'money-payout-command:v1',
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    idempotencyKey: input.idempotencyKey,
  })
  const inputDigest = canonicalDigest({
    format: 'money-payout-input:v1',
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  })
  const requestDigest = canonicalDigest({
    format: 'money-transfer-request:v1',
    payoutRef: input.payoutRef,
    commandId,
    providerAccountRef,
    amount: input.amount,
    inputDigest,
    idempotencyKey: input.idempotencyKey,
  })
  const operationKey = 'moneyLedger:beginPayoutTransfer'
  const correlationId = commandId
  const binding = await callSourceQuery(readOwnerPayoutAccountQuery, {
    businessId: input.businessId,
    currency: input.currency,
  })
  if (binding === null || binding.stripeAccountId.length === 0)
    return refusal('payout_not_ready', true)
  const command = {
    authority: { principalId: `business:${input.businessId}` },
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    amount: input.amount,
    providerAccountRef,
    destinationAccountId: binding.stripeAccountId,
    commandId,
    inputDigest,
    requestDigest,
    providerRecoveryDeadlineAt:
      (runtime.now ?? Date.now()) + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    idempotencyKey: input.idempotencyKey,
    observedAt: runtime.now ?? Date.now(),
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
    ? refusal('payout_reconciliation_required', true)
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
    if (isMoneyRefusal(providerResult))
      return { kind: 'ok', transfer: withRecoveryState(command, now) }
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
  const transactionRef = noTransferId
    ? canonicalDigest({
        format: 'money-payout-not-released-transaction:v1',
        commandId: command.payoutCommandId,
        evidenceDigest: evidence.evidenceDigest,
      })
    : evidence.status === 'reversed'
      ? canonicalDigest({
          format: 'money-payout-reversal-transaction:v1',
          commandId: command.payoutCommandId,
          transferId: evidence.transferId,
          evidenceDigest: evidence.evidenceDigest,
        })
      : canonicalDigest({
          format: 'money-payout-transaction:v1',
          commandId: command.payoutCommandId,
          transferId: evidence.transferId,
        })
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
    transactionRef,
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
    ? refusal('payout_reconciliation_required', true)
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
    return refusal('payout_reconciliation_required', false)
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
    ? refusal('payout_reconciliation_required', true)
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

async function sourceWriteOrRefusal(
  context: unknown,
  command: unknown,
  operationKey: string,
  correlationId: string,
): Promise<SourceWriteBoundArgs | MoneyRefusal> {
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'billing',
      operationKey,
      correlationId,
    })
    return {
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }
  } catch (error) {
    if (
      error instanceof SourceWriteAdmissionError &&
      error.code === 'missing_source_write_request'
    ) {
      return refusal('billing_identity_missing', false)
    }
    throw error
  }
}

async function ownerBusiness(
  businessId: string,
  _context?: unknown,
): Promise<
  | Readonly<{
      kind: 'accepted'
      value: Extract<OwnerBusinessProjection, { kind: 'available' }>
    }>
  | MoneyRefusal
> {
  try {
    const result = await callSourceQuery(ownerBusinessQuery, {})
    if (result.kind === 'error')
      return refusal(
        result.code === 'unauthenticated'
          ? 'billing_identity_missing'
          : 'payout_not_ready',
        result.code !== 'unauthenticated',
      )
    if (result.kind !== 'available' || result.businessId !== businessId)
      return refusal('payout_not_ready', false)
    return {
      kind: 'accepted',
      value: {
        kind: 'available',
        businessId: result.businessId,
        accounts: result.accounts.map(({ currency, earnings, payout }) => ({
          currency,
          earnings,
          payout,
        })),
      },
    }
  } catch {
    return refusal('payout_not_ready', true)
  }
}

function payoutProvider(
  runtime: OwnerMoneyServerRuntime,
):
  | Readonly<{ provider: ConnectAccountPort & PayoutTransferPort }>
  | MoneyRefusal {
  const gate = evaluateLiveMoneyGate(
    runtime.gatePolicy ?? LIVE_MONEY_GATE_POLICY,
  )
  if (gate.kind === 'refused') return refusal(gate.code, false)
  const config =
    runtime.config ??
    readStripeMoneyProviderConfig(runtime.env ?? process.env, runtime.mode)
  if (isMoneyRefusal(config)) return config
  if (runtime.mode !== undefined && config.mode !== runtime.mode)
    return refusal('stripe_setup_required', false)
  return {
    provider:
      runtime.provider ??
      createStripeMoneyProvider({
        config,
        ...(runtime.client === undefined ? {} : { client: runtime.client }),
      }),
  }
}

function ownerCurrency(
  owner: Extract<OwnerBusinessProjection, { kind: 'available' }>,
  currency: string,
): OwnerBusinessCurrencyProjection | undefined {
  return owner.accounts.find((account) => account.currency === currency)
}

function accountFromPayout(
  businessId: string,
  currency: string,
  exponent: number,
  payout: PayoutStatusView,
): ConnectBindingView {
  return {
    businessId,
    currency,
    exponent,
    stripeAccountId: readOptionalString(payout, 'stripeAccountId') ?? '',
    state:
      payout.accountState === 'missing' ? 'not_started' : payout.accountState,
    detailsSubmitted: readOptionalBoolean(payout, 'detailsSubmitted') ?? false,
    recipientCapabilityActive:
      readOptionalBoolean(payout, 'recipientCapabilityActive') ?? false,
    ...optionalProperty(
      'requirementsDigest',
      readOptionalString(payout, 'requirementsDigest'),
    ),
    ...optionalProperty(
      'providerObjectDigest',
      readOptionalString(payout, 'providerObjectDigest'),
    ),
    ...optionalProperty(
      'providerObjectVersion',
      readOptionalNumber(payout, 'providerObjectVersion'),
    ),
    ...optionalProperty(
      'lastStripeEventId',
      readOptionalString(payout, 'lastStripeEventId'),
    ),
    ...optionalProperty(
      'lastStripePayloadDigest',
      readOptionalString(payout, 'lastStripePayloadDigest'),
    ),
    ...optionalProperty('version', readOptionalNumber(payout, 'version')),
    ...optionalProperty('createdAt', readOptionalNumber(payout, 'createdAt')),
    ...optionalProperty('updatedAt', readOptionalNumber(payout, 'updatedAt')),
  }
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

function readOptionalString(value: unknown, key: string): string | undefined {
  if (
    !isRecord(value) ||
    typeof value[key] !== 'string' ||
    value[key].trim().length === 0
  )
    return undefined
  return value[key]
}
function readOptionalNumber(value: unknown, key: string): number | undefined {
  return !isRecord(value) ||
    typeof value[key] !== 'number' ||
    !Number.isFinite(value[key])
    ? undefined
    : value[key]
}
function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  return !isRecord(value) || typeof value[key] !== 'boolean'
    ? undefined
    : value[key]
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
function optionalProperty<T>(
  key: string,
  value: T | undefined,
): Readonly<Record<string, T>> {
  return value === undefined ? {} : { [key]: value }
}

function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
