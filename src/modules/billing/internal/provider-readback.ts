import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import type { SourceHash } from '@/modules/common/ids'

export type AutumnClientConfig = {
  secretKey: string
  apiBaseUrl?: string
  apiVersion?: string
}

type AutumnPlanStatus = 'active' | 'scheduled' | 'expired' | 'past_due' | 'cancelled' | 'trialing' | 'unknown'
type AutumnInvoiceStatus = 'paid' | 'open' | 'draft' | 'void' | 'uncollectible' | 'unknown' | null


export type AutumnAttachRequest = {
  customerId: string
  planId: string
  successUrl: string
  metadata: Record<string, string>
}

export type AutumnAttachReadback = {
  customerId: string
  paymentUrl: string | null
  invoice?: {
    status: AutumnInvoiceStatus
    stripeId: string
    hostedInvoiceUrl: string | null
    total: number
    currency: string
  }
  requiredAction?: {
    code: '3ds_required' | 'payment_method_required' | 'payment_failed'
    reason: string
  }
  payloadHash: SourceHash
}

export type AutumnPortalRequest = {
  customerId: string
  returnUrl: string
}

export type AutumnPortalReadback = {
  customerId: string
  url: string
  payloadHash: SourceHash
}

export type AutumnCustomerReadback = {
  customerId: string
  subscriptions: readonly AutumnPlanSnapshot[]
  purchases: readonly AutumnPlanSnapshot[]
  invoices: readonly AutumnInvoiceSnapshot[]
  payloadHash: SourceHash
}

export type AutumnPlanSnapshot = {
  planId: string
  status: AutumnPlanStatus
  pastDue?: boolean
  startedAt?: number | null
  canceledAt?: number | null
  expiresAt?: number | null
  currentPeriodEnd?: number | null
}

export type AutumnInvoiceSnapshot = {
  stripeId: string
  status: AutumnInvoiceStatus
  hostedInvoiceUrl: string | null
  total: number
  currency: string
}

export type AutumnProvider = {
  attach(request: AutumnAttachRequest): Promise<AutumnAttachReadback>
  openCustomerPortal(request: AutumnPortalRequest): Promise<AutumnPortalReadback>
  getCustomer(customerId: string): Promise<AutumnCustomerReadback>
}

export function createAutumnHttpProvider(config: AutumnClientConfig): AutumnProvider {
  const apiBaseUrl = (config.apiBaseUrl ?? 'https://api.useautumn.com').replace(/\/$/, '')
  const apiVersion = config.apiVersion ?? '2.3.0'

  async function request(path: string, body: StableHashValue): Promise<Record<string, unknown>> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
        'x-api-version': apiVersion,
      },
      body: JSON.stringify(body),
    })

    const responseBody = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(`Autumn ${path} failed with ${response.status}: ${JSON.stringify(responseBody)}`)
    }

    if (!isRecord(responseBody)) {
      throw new Error(`Autumn ${path} returned a non-object response`)
    }

    return responseBody
  }

  return {
    async attach(input) {
      const raw = await request('/v1/billing.attach', {
        customer_id: input.customerId,
        plan_id: input.planId,
        success_url: input.successUrl,
        redirect_mode: 'always',
        metadata: input.metadata,
      })

      return normalizeAttach(raw)
    },
    async openCustomerPortal(input) {
      const raw = await request('/v1/billing.open_customer_portal', {
        customer_id: input.customerId,
        return_url: input.returnUrl,
      })

      const url = readString(raw.url)
      const customerId = readString(raw.customer_id)
      if (customerId === undefined || url === undefined) {
        throw new Error('Autumn portal response missing customer_id or url')
      }

      return { customerId, url, payloadHash: stableHash(raw as StableHashValue) }
    },
    async getCustomer(customerId) {
      const raw = await request('/v1/customers.get', {
        customer_id: customerId,
        expand: ['subscriptions.plan', 'purchases.plan', 'invoices'],
      })

      return normalizeCustomer(raw)
    },
  }
}

export function normalizeAttach(raw: Record<string, unknown>): AutumnAttachReadback {
  const customerId = readString(raw.customer_id)
  if (customerId === undefined) {
    throw new Error('Autumn attach response missing customer_id')
  }

  const invoice = normalizeInvoice(raw.invoice)
  const requiredAction = normalizeRequiredAction(raw.required_action)
  return {
    customerId,
    paymentUrl: readString(raw.payment_url) ?? null,
    ...(invoice === undefined ? {} : { invoice }),
    ...(requiredAction === undefined ? {} : { requiredAction }),
    payloadHash: stableHash(raw as StableHashValue),
  }
}

export function normalizeCustomer(raw: Record<string, unknown>): AutumnCustomerReadback {
  const customerId = readString(raw.id) ?? readString(raw.customer_id)
  if (customerId === undefined) {
    throw new Error('Autumn customer response missing customer id')
  }

  return {
    customerId,
    subscriptions: readArray(raw.subscriptions).map(normalizePlanSnapshot),
    purchases: readArray(raw.purchases).map(normalizePlanSnapshot),
    invoices: readArray(raw.invoices).map(normalizeInvoice).filter((invoice): invoice is AutumnInvoiceSnapshot => invoice !== undefined),
    payloadHash: stableHash(raw as StableHashValue),
  }
}

function normalizePlanSnapshot(value: unknown): AutumnPlanSnapshot {
  if (!isRecord(value)) {
    return { planId: 'unknown', status: 'unknown' }
  }

  const plan = isRecord(value.plan) ? value.plan : undefined
  const pastDue = readBoolean(value.past_due)
  const startedAt = readNumberOrNull(value.started_at)
  const canceledAt = readNumberOrNull(value.canceled_at)
  const expiresAt = readNumberOrNull(value.expires_at)
  const currentPeriodEnd = readNumberOrNull(value.current_period_end)
  return {
    planId: readString(value.plan_id) ?? readString(plan?.id) ?? 'unknown',
    status: normalizePlanStatus(readString(value.status)),
    ...(pastDue === undefined ? {} : { pastDue }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(canceledAt === undefined ? {} : { canceledAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
  }
}

function normalizeInvoice(value: unknown): AutumnInvoiceSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const stripeId = readString(value.stripe_id)
  const total = readNumber(value.total)
  const currency = readString(value.currency)
  if (stripeId === undefined || total === undefined || currency === undefined) {
    return undefined
  }

  return {
    stripeId,
    status: normalizeInvoiceStatus(readString(value.status)),
    hostedInvoiceUrl: readString(value.hosted_invoice_url) ?? null,
    total,
    currency,
  }
}

function normalizePlanStatus(value: string | undefined): AutumnPlanStatus {
  if (
    value === 'active' ||
    value === 'scheduled' ||
    value === 'expired' ||
    value === 'past_due' ||
    value === 'cancelled' ||
    value === 'trialing'
  ) {
    return value
  }

  return 'unknown'
}

function normalizeInvoiceStatus(value: string | undefined): AutumnInvoiceStatus {
  if (
    value === 'paid' ||
    value === 'open' ||
    value === 'draft' ||
    value === 'void' ||
    value === 'uncollectible'
  ) {
    return value
  }

  return value === undefined ? null : 'unknown'
}

function normalizeRequiredAction(value: unknown): AutumnAttachReadback['requiredAction'] {
  if (!isRecord(value)) {
    return undefined
  }

  const code = readString(value.code)
  const reason = readString(value.reason)
  if ((code !== '3ds_required' && code !== 'payment_method_required' && code !== 'payment_failed') || reason === undefined) {
    return undefined
  }

  return { code, reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }

  return readNumber(value)
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
