import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import {
  callSourceMutation,
  callSourceQuery,
  callSourceAction,
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import {
  createStripeMoneyProvider,
  readStripeMoneyProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

import {
  AUD_EXPONENT,
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
import type { StripeCheckoutWebhookEvent } from './stripe-webhook'

type Environment = Readonly<Record<string, string | undefined>>
type FundingEnvironment = 'sandbox' | 'production'

export type AccountFundingBeginInput = Readonly<{
  amount: Readonly<{ currency: 'AUD'; units: string; exponent: 6 }>
  idempotencyKey: string
}>

export type AccountFundingOutcomeUnknownResult = Readonly<{
  kind: 'outcome_unknown'
  code: 'funding_outcome_unknown'
  retryable: false
  commandRef: string
  status: 'outcome_unknown'
}>

export type AccountFundingStartResult =
  | Readonly<{ kind: 'ok'; commandRef: string; session: CreditPaymentSession }>
  | AccountFundingOutcomeUnknownResult
  | MoneyRefusal

export type AccountFundingReadInput =
  | Readonly<{ externalRef: string; idempotencyKey: string }>
  | Readonly<{ commandRef: string; idempotencyKey: string }>

export type AccountFundingBalance =
  | Readonly<{
      kind: 'available'
      accountRef: string
      balance: Readonly<{ currency: 'AUD'; units: string; exponent: 6 }>
      locked: boolean
      version: number
      updatedAt?: number
      lastTransactionRef?: string
    }>
  | MoneyRefusal

export type AccountFundingCommandView = Readonly<{
  commandRef: string
  accountRef: string
  actorPrincipalRef: string
  environment: FundingEnvironment
  currency: 'AUD'
  exponent: 6
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  commercialPolicyDigest: string
  commercialPolicyRefs: readonly string[]
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  providerRecoveryDeadlineAt: number
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown' | 'reversed'
  externalRef?: string
  providerStatus?: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown' | 'reversed'
  providerEvidenceRef?: string
  requestDigest?: string
  metadataDigest?: string
  checkoutSessionDigest?: string
  paymentIntentDigest?: string
  evidenceDigest?: string
  paymentId?: string
  reversalState?: 'pending' | 'succeeded' | 'outcome_unknown'
  reversalStripeEventId?: string
  reversalRefundId?: string
  reversalChargeId?: string
  reversalEvidenceDigest?: string
  reversalTransactionRef?: string
  reversalStatusRef?: string
  reversedAt?: number
}>

export type AccountFundingServerRuntime = Readonly<{
  env?: Environment
  mode?: StripeMoneyMode
  config?: StripeMoneyProviderConfig
  client?: StripeMoneyClient
  provider?: CreditPaymentPort
  resolveOwnerId?: () => Promise<string | undefined>
}>

type SourceWriteBoundArgs = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>
type ReserveFundingArgs = Readonly<{
  amountUnits: string
  environment: FundingEnvironment
  commandRef: string
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  operationKey: string
  correlationId: string
}> & SourceWriteBoundArgs
type FundingResult =
  | Readonly<{ kind: 'accepted'; command: AccountFundingCommandView }>
  | MoneyRefusal
type BindFundingArgs = Readonly<{
  commandRef: string
  evidence: FundingProviderEvidence
  operationKey: string
  correlationId: string
}> & SourceWriteBoundArgs
type MarkFundingUnknownArgs = Readonly<{
  commandRef: string
  idempotencyKey: string
  operationKey: string
  correlationId: string
}> & SourceWriteBoundArgs
type WebhookFundingCommandInput = Readonly<{
  commandRef: string
  externalRef: string
  serviceAuth: ConvexServerFunctionAssertion
}>
export type FundingProviderEvidence = Omit<CreditPaymentEvidence, 'provider' | 'observedAt' | 'checkoutStatus' | 'paymentStatus'>

const beginInputSchema = z.strictObject({
  amount: z.strictObject({
    currency: z.literal('AUD'),
    units: z.string().regex(/^[1-9]\d{0,29}$/u),
    exponent: z.literal(AUD_EXPONENT),
  }),
  idempotencyKey: z.string().trim().min(8).max(200),
})
const readInputSchema = z.union([
  z.strictObject({
    externalRef: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
  z.strictObject({
    commandRef: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
])

const reserveFundingMutation = sourceMutation<ReserveFundingArgs, FundingResult>(
  'moneyAccountFunding:reserve',
)
const bindFundingMutation = sourceMutation<BindFundingArgs, FundingResult>(
  'moneyAccountFunding:bind',
)
const markFundingUnknownMutation = sourceMutation<MarkFundingUnknownArgs, FundingResult>(
  'moneyAccountFunding:markOutcomeUnknown',
)
const readFundingQuery = sourceQuery<AccountFundingReadInput, FundingResult>(
  'moneyAccountFunding:read',
)
const readFundingBalanceAction = sourceAction<Record<string, never>, AccountFundingBalance>(
  'moneyAccountFundingFormance:readBalance',
)
export const readWebhookFundingCommandQuery = sourceQuery<
  WebhookFundingCommandInput,
  FundingResult
>('moneyAccountFunding:readWebhookCommand')
export const readWebhookRefundCommandQuery = sourceQuery<
  Readonly<{ paymentId: string; refundId: string; serviceAuth: ConvexServerFunctionAssertion }>,
  FundingResult
>('moneyAccountFunding:readWebhookRefundCommand')

async function defaultResolveOwnerId(): Promise<string | undefined> {
  const { userId } = await auth()
  return userId ?? undefined
}

export const beginAccountFundingServer = createServerFn({ method: 'POST' })
  .validator((data) => beginInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AccountFundingStartResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await beginAccountFundingThroughSource(data, context)
  })

export const readAccountFundingServer = createServerFn({ method: 'POST' })
  .validator((data) => readInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<CreditPaymentSession | MoneyRefusal> => {
    setResponseHeader('cache-control', 'no-store')
    return await readAccountFundingThroughSource(data, context)
  })

export const readAccountFundingBalanceServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AccountFundingBalance> => {
    setResponseHeader('cache-control', 'no-store')
    return await callSourceAction(readFundingBalanceAction, {})
  })

export async function beginAccountFundingThroughSource(
  input: AccountFundingBeginInput,
  context?: unknown,
  runtime: AccountFundingServerRuntime = {},
): Promise<AccountFundingStartResult> {
  const ownerId = await (runtime.resolveOwnerId ?? defaultResolveOwnerId)()
  if (ownerId === undefined) return refusal('billing_identity_missing')
  const providerContext = createAccountFundingProvider(runtime)
  if (isMoneyRefusal(providerContext)) return providerContext

  const commandRef = canonicalDigest({
    format: 'ae.account-funding-command-ref:v1',
    ownerId,
    idempotencyKey: input.idempotencyKey,
  })
  const inputDigest = canonicalDigest({
    format: 'ae.account-funding-input:v1',
    ownerId,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  })
  const successReturnRef = `${resolveCanonicalBaseUrl().baseUrl}/owner/credit`
  const operationKey = 'moneyAccountFunding:reserve'
  const correlationId = commandRef
  const command = {
    amountUnits: input.amount.units,
    environment: providerContext.environment,
    commandRef,
    idempotencyKey: input.idempotencyKey,
    inputDigest,
    successReturnRef,
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: 'billing',
    operationKey,
    correlationId,
  })
  const reserved = await callSourceMutation(reserveFundingMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  if (isMoneyRefusal(reserved)) return reserved
  if (reserved.command.state === 'outcome_unknown') return fundingOutcomeUnknown(reserved.command)

  const payment = await providerContext.provider.createOrRecoverCreditPayment(
    fundingPaymentRequest(reserved.command, reserved.command.externalRef),
  )
  if (isMoneyRefusal(payment)) {
    const mapped = fundingProviderRefusal(payment)
    if (mapped.code !== 'funding_outcome_unknown') return mapped
    if (reserved.command.externalRef === undefined
      && Date.now() < reserved.command.providerRecoveryDeadlineAt) return mapped
    return await markFundingOutcomeUnknown(reserved.command, context)
  }
  const bound = await bindFundingEvidence(reserved.command.commandRef, payment.evidence, context)
  return isMoneyRefusal(bound)
    ? bound
    : { kind: 'ok', commandRef: reserved.command.commandRef, session: payment }
}

export async function readAccountFundingThroughSource(
  input: AccountFundingReadInput,
  context?: unknown,
  runtime: AccountFundingServerRuntime = {},
): Promise<CreditPaymentSession | MoneyRefusal> {
  const command = await callSourceQuery(readFundingQuery, input)
  if (isMoneyRefusal(command)) return command
  if (command.command.externalRef === undefined) {
    return refusal('funding_outcome_unknown', true)
  }
  const providerContext = createAccountFundingProvider(runtime)
  if (isMoneyRefusal(providerContext)) return providerContext
  const payment = await providerContext.provider.readCreditPayment({
    ...fundingPaymentRequest(command.command),
    externalRef: 'externalRef' in input ? input.externalRef : command.command.externalRef,
  })
  if (isMoneyRefusal(payment)) return fundingProviderRefusal(payment)
  const bound = await bindFundingEvidence(command.command.commandRef, payment.evidence, context)
  return isMoneyRefusal(bound) ? bound : payment
}

async function bindFundingEvidence(
  commandRef: string,
  evidence: CreditPaymentEvidence,
  context?: unknown,
): Promise<FundingResult> {
  const operationKey = 'moneyAccountFunding:bind'
  const correlationId = commandRef
  const command = {
    commandRef,
    evidence: fundingEvidence(evidence),
    operationKey,
    correlationId,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: 'billing',
    operationKey,
    correlationId,
  })
  return await callSourceMutation(bindFundingMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
}

async function markFundingOutcomeUnknown(
  command: AccountFundingCommandView,
  context?: unknown,
): Promise<AccountFundingStartResult> {
  const operationKey = 'moneyAccountFunding:markOutcomeUnknown'
  const correlationId = command.commandRef
  const mutationCommand = {
    commandRef: command.commandRef,
    idempotencyKey: command.idempotencyKey,
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
  const marked = await callSourceMutation(markFundingUnknownMutation, {
    ...mutationCommand,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  return isMoneyRefusal(marked) ? marked : fundingOutcomeUnknown(marked.command)
}

function createAccountFundingProvider(
  runtime: AccountFundingServerRuntime,
): Readonly<{ provider: CreditPaymentPort; environment: FundingEnvironment }> | MoneyRefusal {
  if (runtime.provider !== undefined) {
    const mode = runtime.mode ?? runtime.config?.mode ?? 'test'
    return { provider: runtime.provider, environment: mode === 'live' ? 'production' : 'sandbox' }
  }
  const config = runtime.config
    ?? readStripeMoneyProviderConfig(runtime.env ?? process.env, runtime.mode)
  if (isMoneyRefusal(config)) return config
  const provider = createStripeMoneyProvider({
    config,
    ...(runtime.client === undefined ? {} : { client: runtime.client }),
  })
  return { provider, environment: config.mode === 'live' ? 'production' : 'sandbox' }
}

export function fundingPaymentRequest(
  command: AccountFundingCommandView,
  boundExternalRef?: string,
): CreditPaymentRequest & Readonly<{ boundExternalRef?: string }> {
  return {
    commandRef: command.commandRef,
    principalId: command.actorPrincipalRef,
    accountRef: command.accountRef,
    amount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits },
    idempotencyKey: command.idempotencyKey,
    inputDigest: command.inputDigest,
    successReturnRef: command.successReturnRef,
    providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
    ...(boundExternalRef === undefined ? {} : { boundExternalRef }),
  }
}

export function fundingWebhookReadbackRefusal(
  command: AccountFundingCommandView,
  event: StripeCheckoutWebhookEvent,
  evidence: CreditPaymentEvidence,
): MoneyRefusal | undefined {
  const expectedAmount: ExactAmount = {
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: command.totalUnits,
  }
  const statusMatches = event.status === 'paid'
    ? evidence.status === 'succeeded'
      && evidence.checkoutStatus === 'complete'
      && evidence.paymentStatus === 'paid'
    : event.status === 'expired'
      ? evidence.status === 'failed'
        && evidence.checkoutStatus === 'expired'
        && evidence.paymentStatus !== 'paid'
      : evidence.status !== 'succeeded' && evidence.paymentStatus !== 'paid'
  if (event.commandRef !== command.commandRef
    || event.externalRef !== event.sessionId
    || evidence.externalRef !== event.sessionId
    || compareExactAmounts(expectedAmount, event.amount) !== 0
    || compareExactAmounts(expectedAmount, evidence.amount) !== 0
    || event.metadataDigest !== evidence.metadataDigest
    || command.metadataDigest !== evidence.metadataDigest
    || event.checkoutSessionDigest !== evidence.checkoutSessionDigest
    || event.paymentIntentDigest !== evidence.paymentIntentDigest
    || event.paymentId !== evidence.paymentId
    || !statusMatches) return refusal('payment_binding_invalid')
  return undefined
}

export function fundingEvidence(evidence: CreditPaymentEvidence): FundingProviderEvidence {
  return {
    externalRef: evidence.externalRef,
    amount: evidence.amount,
    status: evidence.status,
    evidenceRef: evidence.evidenceRef,
    requestDigest: evidence.requestDigest,
    metadataDigest: evidence.metadataDigest,
    checkoutSessionDigest: evidence.checkoutSessionDigest,
    ...(evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: evidence.paymentIntentDigest }),
    evidenceDigest: evidence.evidenceDigest,
    ...(evidence.paymentId === undefined ? {} : { paymentId: evidence.paymentId }),
  }
}

function fundingProviderRefusal(value: MoneyRefusal): MoneyRefusal {
  if (value.code === 'credit_topup_outcome_unknown') return refusal('funding_outcome_unknown', value.retryable)
  if (value.code === 'credit_topup_amount_invalid') return refusal('funding_amount_invalid', value.retryable)
  return value
}

function fundingOutcomeUnknown(
  command: Pick<AccountFundingCommandView, 'commandRef'>,
): AccountFundingOutcomeUnknownResult {
  return {
    kind: 'outcome_unknown',
    code: 'funding_outcome_unknown',
    retryable: false,
    commandRef: command.commandRef,
    status: 'outcome_unknown',
  }
}

function refusal(code: MoneyRefusal['code'], retryable = false): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
