import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { createStripeMoneyClient } from '@/lib/server/stripe-money-client'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import {
  createStripeCustomerPortalSession,
  readSavedPaymentMethodSummary,
  readStripeCustomerPortalConfig,
  resolveOrProvisionStripeCustomer,
  type SavedCardDetails,
} from '@/lib/server/stripe-customer-portal'
import { createRuntimeId } from '@/modules/common/runtime-id'
import { isMoneyRefusal, type MoneyRefusal } from './money-types'

type StripeCustomerBindingRead = Readonly<{
  accountRef: string
  binding: Readonly<{
    legalCustomerRef: string
    stripeCustomerId: string
    mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
    revision: number
  }> | null
}>

const readStripeCustomerBindingQuery = sourceQuery<Record<string, never>, StripeCustomerBindingRead>(
  'moneyStripeCustomer:readStripeCustomerBinding',
)

const upsertStripeCustomerBindingMutation = sourceMutation<
  Readonly<{ stripeCustomerId: string; correlationRef: string; idempotencyRef: string }>,
  Readonly<{ kind: 'updated' | 'replayed'; revision: number }>
>('moneyStripeCustomer:upsertStripeCustomerBinding')

const observeStripePaymentMandateMutation = sourceMutation<
  Readonly<{
    mandateState: 'ready' | 'missing'
    correlationRef: string
    idempotencyRef: string
    expectedRevision: number
  }>,
  Readonly<{ kind: 'updated' | 'replayed'; revision: number; mandateState: 'ready' | 'missing' }>
>('moneyStripeCustomer:observeStripePaymentMandate')

const recordBillingPortalStartedMutation = sourceMutation<
  Readonly<{ correlationRef: string; idempotencyRef: string }>,
  Readonly<{ kind: 'recorded' }>
>('moneyStripeCustomer:recordBillingPortalStarted')

export type SavedPaymentMethodSummaryRead =
  | Readonly<{
      kind: 'missing'
      hasPaymentMethod: false
      mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
    }>
  | Readonly<{
      kind: 'ready'
      hasPaymentMethod: true
      card: SavedCardDetails
      mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
    }>
  | MoneyRefusal

export type CreateStripeCustomerPortalSessionResult =
  | Readonly<{ kind: 'ok'; portalUrl: string }>
  | MoneyRefusal

export async function readSavedPaymentMethodSummaryThroughSource(): Promise<SavedPaymentMethodSummaryRead> {
  const config = readStripeCustomerPortalConfig()
  if (!config.configured) {
    return { kind: 'refused', code: config.code, retryable: false }
  }

  const readback = await callSourceQuery(readStripeCustomerBindingQuery, {})
  const client = createStripeMoneyClient(config.secretKey)
  const binding = readback.binding

  if (binding === null) {
    return { kind: 'missing', hasPaymentMethod: false, mandateState: 'missing' }
  }

  const summary = await readSavedPaymentMethodSummary({
    client,
    binding: {
      stripeCustomerId: binding.stripeCustomerId,
      mandateState: binding.mandateState,
      revision: binding.revision,
    },
  })

  return summary
}

export async function createStripeCustomerPortalSessionThroughSource(): Promise<CreateStripeCustomerPortalSessionResult> {
  const config = readStripeCustomerPortalConfig()
  if (!config.configured) {
    return { kind: 'refused', code: config.code, retryable: false }
  }

  const readback = await callSourceQuery(readStripeCustomerBindingQuery, {})
  const client = createStripeMoneyClient(config.secretKey)
  const baseUrl = resolveCanonicalBaseUrl().baseUrl
  const binding = readback.binding

  const provisioned = await resolveOrProvisionStripeCustomer({
    accountRef: readback.accountRef,
    config,
    client,
    loadBinding: async () => binding === null
      ? null
      : {
          stripeCustomerId: binding.stripeCustomerId,
          mandateState: binding.mandateState,
          revision: binding.revision,
        },
    saveBinding: async (nextBinding) => {
      const correlationRef = `owner-credit:stripe-customer:${createRuntimeId('stripe-customer')}`
      await callSourceMutation(upsertStripeCustomerBindingMutation, {
        stripeCustomerId: nextBinding.stripeCustomerId,
        correlationRef,
        idempotencyRef: correlationRef,
      })
    },
  })
  if (isMoneyRefusal(provisioned)) return provisioned

  const summary = await readSavedPaymentMethodSummary({
    client,
    binding: provisioned.stripeCustomerId === binding?.stripeCustomerId && binding !== null
      ? {
          stripeCustomerId: binding.stripeCustomerId,
          mandateState: binding.mandateState,
          revision: binding.revision,
        }
      : {
          stripeCustomerId: provisioned.stripeCustomerId,
          mandateState: provisioned.mandateState ?? 'missing',
          revision: 0,
        },
  })
  const projectedHasCard = summary.hasPaymentMethod
  const observedMandate = projectedHasCard ? 'ready' : 'missing'
  if (binding !== null && binding.mandateState !== observedMandate) {
    const correlationRef = `owner-credit:mandate-observe:${createRuntimeId('mandate-observe')}`
    await callSourceMutation(observeStripePaymentMandateMutation, {
      mandateState: observedMandate,
      correlationRef,
      idempotencyRef: correlationRef,
      expectedRevision: binding.revision,
    })
  }

  if (binding === null || binding.stripeCustomerId !== provisioned.stripeCustomerId) {
    const correlationRef = `owner-credit:stripe-customer:${createRuntimeId('stripe-customer')}`
    await callSourceMutation(upsertStripeCustomerBindingMutation, {
      stripeCustomerId: provisioned.stripeCustomerId,
      correlationRef,
      idempotencyRef: correlationRef,
    })
  }

  const portalCorrelationRef = `owner-credit:portal:${createRuntimeId('portal')}`
  await callSourceMutation(recordBillingPortalStartedMutation, {
    correlationRef: portalCorrelationRef,
    idempotencyRef: portalCorrelationRef,
  })

  return await createStripeCustomerPortalSession({
    config,
    client,
    customerId: provisioned.stripeCustomerId,
    returnUrl: `${baseUrl}/owner/credit`,
  })
}

export const readSavedPaymentMethodSummaryServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SavedPaymentMethodSummaryRead> => {
    setResponseHeader('cache-control', 'no-store')
    return await readSavedPaymentMethodSummaryThroughSource()
  })

export const createStripeCustomerPortalSessionServer = createServerFn({ method: 'POST' })
  .handler(async (): Promise<CreateStripeCustomerPortalSessionResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await createStripeCustomerPortalSessionThroughSource()
  })
