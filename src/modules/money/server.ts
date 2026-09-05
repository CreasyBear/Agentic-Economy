import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type { MoneyRefusal } from './public'
import {
  verifyStripeMoneyWebhook,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
} from '@/lib/server/stripe-money-provider'
import {
  handleStripeWebhookRequest as handleStripeWebhook,
  type StripeMoneyWebhookEvent,
  type StripeWebhookAdmission,
  type StripeWebhookDestination,
  type StripeWebhookIngester,
  type StripeWebhookVerifier,
} from './internal/stripe-webhook'
import type { Environment } from './internal/payout-http-runtime'

export {
  beginAccountFundingThroughSource,
  fundingEvidence,
  fundingPaymentRequest,
  readAccountFundingThroughSource,
} from './internal/account-funding-http'
export {
  paymentBindingSchema,
  validatePaymentBinding,
} from './internal/payment-binding'
export type {
  AccountFundingCommandView,
  AccountFundingBeginInput,
  AccountFundingBalance,
  AccountFundingOutcomeUnknownResult,
  AccountFundingReadInput,
  AccountFundingServerRuntime,
  AccountFundingStartResult,
  FundingProviderEvidence,
} from './internal/account-funding-http'
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
  StripeRefundWebhookEvent,
  StripeWebhookAdmission,
  StripeWebhookDestination,
  StripeWebhookIngester,
  StripeWebhookVerifier,
} from './internal/stripe-webhook'
export type { OwnerMoneyServerRuntime } from './internal/payout-http-runtime'
export {
  createOwnerConnectAccountServer,
  createOwnerConnectAccountThroughSource,
  createOwnerOnboardingLinkServer,
  createOwnerOnboardingLinkThroughSource,
  readOwnerConnectReadinessThroughSource,
  updateOwnerPayoutAuthorityThroughSource,
} from './internal/payout-connect-http'
export type {
  OwnerConnectAccountInput,
  OwnerConnectAccountResult,
  OwnerConnectReadinessReadback,
  OwnerOnboardingLinkInput,
  OwnerOnboardingLinkResult,
  OwnerPayoutAuthorityUpdateInput,
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
type IngestVerifiedStripeEventArgs = Readonly<{
  destination: StripeWebhookDestination
  event: StripeMoneyWebhookEvent
  operationKey: string
  correlationId: string
}> &
  SourceWriteBoundArgs
type IngestVerifiedStripeEventResult = StripeWebhookAdmission | MoneyRefusal

const ingestVerifiedStripeEventMutation = sourceMutation<
  IngestVerifiedStripeEventArgs,
  IngestVerifiedStripeEventResult
>('moneyStripeWebhookInbox:ingest')

export async function ingestVerifiedStripeEventThroughSource(
  input: Readonly<{
    destination: StripeWebhookDestination
    event: StripeMoneyWebhookEvent
    rawBody: string
    request: Request
    env?: Environment
  }>,
): Promise<IngestVerifiedStripeEventResult> {
  const operationKey = 'moneyStripeWebhookInbox:ingest'
  const correlationId = input.event.stripeEventId
  const command = {
    destination: input.destination,
    event: input.event,
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
  return await callPublicSourceMutation(ingestVerifiedStripeEventMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
}

export async function handleStripeWebhookRequest(
  request: Request,
  options: Readonly<{
    destination?: StripeWebhookDestination
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
  }> = {},
): Promise<Response> {
  const destination = options.destination ?? 'snapshot'
  const verifier: StripeWebhookVerifier = {
    verify: async ({ rawBody, signature }) =>
      await verifyStripeMoneyWebhook({
        rawBody,
        signature,
        destination,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.config === undefined ? {} : { config: options.config }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.client === undefined ? {} : { client: options.client }),
      }),
  }
  const ingester: StripeWebhookIngester = {
    ingest: async ({ event, rawBody }) =>
      await ingestVerifiedStripeEventThroughSource({
        destination,
        event,
        rawBody,
        request,
        ...(options.env === undefined ? {} : { env: options.env }),
      }),
  }
  return await handleStripeWebhook({ request, verifier, ingester })
}
