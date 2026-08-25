import {
  callPublicSourceAction,
  callPublicSourceQuery,
  createConvexServerFunctionAssertion,
  sourceAction,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import { isMoneyRefusal, type MoneyRefusal } from './public'
import {
  createStripeMoneyProvider,
  verifyStripeMoneyWebhook,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'
import {
  handleStripeWebhookRequest as handleStripeWebhook,
  type StripeMoneyWebhookEvent,
  type StripeWebhookApplier,
  type StripeWebhookApplication,
  type StripeWebhookVerifier,
} from './internal/stripe-webhook'
import {
  checkoutWebhookReadbackRefusal,
  creditPaymentRequestFromCommand,
  readWebhookTopupCommandQuery,
  type BindTopupArgs,
} from './internal/credit-topup-http'
import { applyVerifiedConnectAccountEvent } from './internal/payout-connect-http'
import type { Environment } from './internal/payout-http-runtime'

export {
  paymentBindingSchema,
  validatePaymentBinding,
} from './internal/payment-binding'
export type {
  PaymentBinding,
  PaymentBindingValidation,
} from './internal/payment-binding'

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
export {
  beginCreditTopupServer,
  beginCreditTopupThroughSource,
  readCreditPaymentServer,
  readCreditPaymentThroughSource,
} from './internal/credit-topup-http'
export type {
  CreditTopupBeginInput,
  CreditTopupOutcomeUnknownResult,
  CreditTopupReadInput,
  CreditTopupServerRuntime,
  CreditTopupStartResult,
} from './internal/credit-topup-http'
export type { OwnerMoneyServerRuntime } from './internal/payout-http-runtime'
export {
  createOwnerConnectAccountServer,
  createOwnerConnectAccountThroughSource,
  createOwnerOnboardingLinkServer,
  createOwnerOnboardingLinkThroughSource,
  readOwnerConnectReadinessServer,
  readOwnerConnectReadinessThroughSource,
} from './internal/payout-connect-http'
export type {
  OwnerConnectAccountInput,
  OwnerConnectAccountResult,
  OwnerConnectReadinessReadback,
  OwnerOnboardingLinkInput,
  OwnerOnboardingLinkResult,
} from './internal/payout-connect-http'
export {
  beginOwnerPayoutTransferServer,
  readOwnerPayoutTransferServer,
  readOwnerPayoutTransferThroughSource,
  recoverOwnerPayoutTransferServer,
  runOwnerPayoutTransferThroughSource,
} from './internal/payout-transfer-http'
export type {
  OwnerPayoutTransferInput,
  OwnerPayoutTransferReadInput,
  OwnerPayoutTransferResult,
} from './internal/payout-transfer-http'

type SourceWriteBoundArgs = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>
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
  }>,
): Promise<ApplyVerifiedStripeEventResult> {
  if (input.event.kind === 'account')
    return await applyVerifiedConnectAccountEvent({
      event: input.event,
      rawBody: input.rawBody,
      request: input.request,
      ...(input.env === undefined ? {} : { env: input.env }),
      ...(input.config === undefined ? {} : { config: input.config }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.client === undefined ? {} : { client: input.client }),
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
    return { kind: 'refused', code: 'credit_topup_pending', retryable: true }
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

export async function handleStripeWebhookRequest(
  request: Request,
  options: Readonly<{
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
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
      }),
  }
  return await handleStripeWebhook({ request, verifier, applier })
}
