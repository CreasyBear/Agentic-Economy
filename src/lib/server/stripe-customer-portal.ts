import type Stripe from 'stripe'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { refusal } from '@/lib/server/stripe-money-provider-config'
import type { StripeMoneyMode, StripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider-config'
import { isMoneyRefusal, type MoneyRefusal } from '@/modules/money/public'

type Environment = Readonly<Record<string, string | undefined>>

const OWNER_CREDIT_RETURN_PATH = '/owner/credit'

export type StripeCustomerPortalConfig =
  | Readonly<{ configured: true; secretKey: string; mode: StripeMoneyMode }>
  | Readonly<{ configured: false; code: 'stripe_setup_required' }>

export type PortalReturnUrlResult =
  | Readonly<{ kind: 'ok'; returnUrl: string }>
  | MoneyRefusal

export type SavedCardDetails = Readonly<{
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: true
}>

export type SavedCardDisplay =
  | Readonly<{ kind: 'missing'; hasPaymentMethod: false }>
  | Readonly<{
      kind: 'ready'
      hasPaymentMethod: true
      card: SavedCardDetails
    }>

export type StripeCustomerBindingView = Readonly<{
  stripeCustomerId: string
  mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
  revision: number
}>

export function readStripeCustomerPortalConfig(
  env: Environment = process.env,
): StripeCustomerPortalConfig {
  const secretKey = readStripeSecretKey(env)
  if (secretKey === undefined) {
    return { configured: false, code: 'stripe_setup_required' }
  }
  const mode = stripeSecretKeyMode(secretKey)
  if (mode === undefined) {
    return { configured: false, code: 'stripe_setup_required' }
  }
  return { configured: true, secretKey, mode }
}

export function portalSessionCreateParams(input: Readonly<{
  customer: string
  returnUrl: string
}>): Stripe.BillingPortal.SessionCreateParams {
  return {
    customer: input.customer,
    return_url: input.returnUrl,
    flow_data: { type: 'payment_method_update' },
  }
}

export function validatePortalReturnUrl(input: Readonly<{
  returnUrl: string
  baseUrl: string
}>): PortalReturnUrlResult {
  const trimmed = input.returnUrl.trim()
  if (trimmed.startsWith('//')) {
    return refusal('payment_binding_invalid', false)
  }
  try {
    const resolved = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(trimmed, input.baseUrl)
    if (resolved.pathname !== OWNER_CREDIT_RETURN_PATH) {
      return refusal('payment_binding_invalid', false)
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return refusal('payment_binding_invalid', false)
    }
    if (trimmed === OWNER_CREDIT_RETURN_PATH) {
      const base = input.baseUrl.replace(/\/+$/u, '')
      return { kind: 'ok', returnUrl: `${base}${OWNER_CREDIT_RETURN_PATH}` }
    }
    return { kind: 'ok', returnUrl: resolved.toString() }
  } catch (cause) {
    void cause;
    return refusal('payment_binding_invalid', false)
  }
}

function readStripeSecretKey(env: Environment): string | undefined {
  const value = env.STRIPE_SECRET_KEY
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function stripeSecretKeyMode(value: string): StripeMoneyMode | undefined {
  if (/^(?:sk|rk)_test_[A-Za-z0-9_-]+$/u.test(value)) return 'test'
  if (/^(?:sk|rk)_live_[A-Za-z0-9_-]+$/u.test(value)) return 'live'
  return undefined
}

export function stripeCustomerCreateParams(input: Readonly<{ accountRef: string }>): Stripe.CustomerCreateParams {
  return {
    metadata: { accountRef: input.accountRef },
  }
}

export function projectSavedCardDisplay(input: Readonly<{
  defaultPaymentMethod: Stripe.PaymentMethod | string | null
  cardPaymentMethods: readonly Stripe.PaymentMethod[]
}>): SavedCardDisplay {
  if (input.defaultPaymentMethod === null) {
    return { kind: 'missing', hasPaymentMethod: false }
  }

  const defaultMethod = typeof input.defaultPaymentMethod === 'string'
    ? input.cardPaymentMethods.find((method) => method.id === input.defaultPaymentMethod)
    : input.defaultPaymentMethod

  if (defaultMethod === undefined || defaultMethod.type !== 'card' || defaultMethod.card === null || defaultMethod.card === undefined) {
    return { kind: 'missing', hasPaymentMethod: false }
  }

  const card = defaultMethod.card
  return {
    kind: 'ready',
    hasPaymentMethod: true,
    card: {
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      isDefault: true,
    },
  }
}

export async function createStripeCustomerPortalSession(input: Readonly<{
  config: Pick<StripeMoneyProviderConfig, 'secretKey' | 'mode'>
  client: Stripe
  customerId: string
  returnUrl: string
}>): Promise<
  | Readonly<{ kind: 'ok'; portalUrl: string }>
  | MoneyRefusal
> {
  const validatedReturn = validatePortalReturnUrl({
    returnUrl: input.returnUrl,
    baseUrl: resolveCanonicalBaseUrl().baseUrl,
  })
  if (isMoneyRefusal(validatedReturn)) {
    return validatedReturn
  }
  const session = await input.client.billingPortal.sessions.create(
    portalSessionCreateParams({
      customer: input.customerId,
      returnUrl: validatedReturn.returnUrl,
    }),
  )
  if (typeof session.url !== 'string' || session.url.length === 0) {
    return refusal('stripe_setup_required', false)
  }
  return { kind: 'ok', portalUrl: session.url }
}

export async function resolveOrProvisionStripeCustomer(input: Readonly<{
  accountRef: string
  config: Pick<StripeMoneyProviderConfig, 'secretKey' | 'mode'>
  client: Stripe
  loadBinding: () => Promise<StripeCustomerBindingView | null>
  saveBinding: (binding: Readonly<{
    stripeCustomerId: string
    mandateState?: 'missing' | 'ready' | 'authentication_required' | 'failed' | undefined
  }>) => Promise<void>
}>): Promise<
  | Readonly<{
      kind: 'ok'
      stripeCustomerId: string
      created: boolean
      mandateState?: 'missing' | 'ready' | 'authentication_required' | 'failed'
    }>
  | MoneyRefusal
> {
  const existing = await input.loadBinding()
  if (existing === null) {
    const created = await input.client.customers.create(
      stripeCustomerCreateParams({ accountRef: input.accountRef }),
      { idempotencyKey: `ae:money:customer:${input.accountRef}` },
    )
    await input.saveBinding({ stripeCustomerId: created.id, mandateState: 'missing' })
    return { kind: 'ok', stripeCustomerId: created.id, created: true }
  }

  const retrieved = await input.client.customers.retrieve(existing.stripeCustomerId)
  if (typeof retrieved === 'object' && retrieved !== null && retrieved.deleted === true) {
    const replacement = await input.client.customers.create(
      stripeCustomerCreateParams({ accountRef: input.accountRef }),
      { idempotencyKey: `ae:money:customer:${input.accountRef}` },
    )
    await input.saveBinding({ stripeCustomerId: replacement.id, mandateState: 'missing' })
    return {
      kind: 'ok',
      stripeCustomerId: replacement.id,
      created: true,
      mandateState: 'missing',
    }
  }

  return {
    kind: 'ok',
    stripeCustomerId: existing.stripeCustomerId,
    created: false,
  }
}

export async function readSavedPaymentMethodSummary(input: Readonly<{
  client: Stripe
  binding: StripeCustomerBindingView | null
}>): Promise<
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
  | Readonly<{
      kind: 'missing'
      hasPaymentMethod: false
      mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
    }>
> {
  const mandateState = input.binding?.mandateState ?? 'missing'
  if (input.binding === null) {
    return { kind: 'missing', hasPaymentMethod: false, mandateState }
  }

  const customer = await input.client.customers.retrieve(input.binding.stripeCustomerId, {
    expand: ['invoice_settings.default_payment_method'],
  })
  if (typeof customer === 'object' && customer !== null && customer.deleted === true) {
    return { kind: 'missing', hasPaymentMethod: false, mandateState }
  }

  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method ?? null
  const paymentMethods = await input.client.paymentMethods.list({
    customer: input.binding.stripeCustomerId,
    type: 'card',
  })

  const projected = projectSavedCardDisplay({
    defaultPaymentMethod: typeof defaultPaymentMethod === 'string' || defaultPaymentMethod === null
      ? defaultPaymentMethod
      : defaultPaymentMethod,
    cardPaymentMethods: paymentMethods.data,
  })

  if (projected.kind === 'missing') {
    return { kind: 'missing', hasPaymentMethod: false, mandateState }
  }

  return {
    kind: 'ready',
    hasPaymentMethod: true,
    card: projected.card,
    mandateState,
  }
}
