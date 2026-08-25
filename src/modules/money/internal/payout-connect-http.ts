import { setResponseHeader } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createRuntimeId } from '@/modules/common/runtime-id'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import {
  isMoneyRefusal,
  type MoneyRefusal,
  type PayoutStatusView,
} from '../public'
import type { StripeMoneyClient, StripeMoneyMode, StripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider'
import type {
  StripeAccountUpdatedWebhookEvent,
  StripeWebhookApplication,
} from './stripe-webhook'
import {
  ownerBusiness,
  ownerBusinessQuery,
  ownerCurrency,
  optionalProperty,
  payoutProvider,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  sourceWriteOrRefusal,
  type Environment,
  type OwnerMoneyServerRuntime,
  type SourceWriteBoundArgs,
} from './payout-http-runtime'

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

const ownerConnectAccountInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  idempotencyKey: z.string().trim().min(8).max(200),
})
const ownerOnboardingLinkInputSchema = ownerConnectAccountInputSchema.extend({
  stripeAccountId: z.string().trim().min(1).max(500).optional(),
})

export const readPayoutAccountByStripeIdQuery = sourceQuery<
  { stripeAccountId: string; serviceAuth: ConvexServerFunctionAssertion },
  readonly StripePayoutBindingView[]
>('moneyLedger:readPayoutAccountByStripeId')
export const readOwnerPayoutAccountQuery = sourceQuery<
  { businessId: string; currency: string },
  ConnectBindingView | null
>('moneyLedger:readOwnerPayoutAccount')
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
  if (currency === undefined)
    return { kind: 'refused', code: 'payout_not_ready', retryable: false }
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
    return { kind: 'refused', code: 'payout_outcome_unknown', retryable: false }
  }
  let outcome: ConnectAccountOutcome
  const recoveryLeaseOwner = reserved.command.recoveryLeaseOwner
  if (recoveryLeaseOwner === undefined)
    return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
  if (
    (runtime.now ?? Date.now()) >= reserved.command.providerRecoveryDeadlineAt
  )
    return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
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
    .catch(() => ({
      kind: 'refused' as const,
      code: 'payout_outcome_unknown' as const,
      retryable: false,
    }))
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
  } else if (
    'stripeAccountId' in providerResultValue
    && 'evidenceRef' in providerResultValue
  ) {
    outcome = {
      state: 'succeeded',
      stripeAccountId: providerResultValue.stripeAccountId,
      providerEvidenceRef: providerResultValue.evidenceRef,
    }
  } else {
    outcome = {
      state: 'outcome_unknown',
      failureCode: 'payout_outcome_unknown',
      failureRetryable: false,
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
    return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
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
  return { kind: 'refused', code: 'payout_outcome_unknown', retryable: false }
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
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  }
  const stripeAccountId = binding?.stripeAccountId
  if (currency === undefined || stripeAccountId === undefined)
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
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

export async function applyVerifiedConnectAccountEvent(
  input: Readonly<{
    event: StripeAccountUpdatedWebhookEvent
    rawBody: string
    request: Request
    env?: Environment
    config?: StripeMoneyProviderConfig
    mode?: StripeMoneyMode
    client?: StripeMoneyClient
  }>,
): Promise<StripeWebhookApplication | MoneyRefusal> {
  const providerResult = payoutProvider({
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.config === undefined ? {} : { config: input.config }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(input.client === undefined ? {} : { client: input.client }),
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
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  }
  const bindings = await callPublicSourceQuery(
    readPayoutAccountByStripeIdQuery,
    {
      stripeAccountId: input.event.stripeAccountId,
      serviceAuth,
    },
  )
  if (bindings.length !== 1)
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  const binding = bindings[0]
  if (binding === undefined)
    return { kind: 'refused', code: 'payout_not_ready', retryable: true }
  const evidence = await providerResult.provider.readConnectAccount({
    businessId: binding.businessId,
    currency: binding.currency,
    stripeAccountId: binding.stripeAccountId,
  })
  if (isMoneyRefusal(evidence)) return evidence
  if (evidence.currency !== binding.currency)
    return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
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
