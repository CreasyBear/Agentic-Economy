import { createHmac } from 'node:crypto'

import type { ShippingQuoteInput } from './public'

const SHIPPO_BASE_URL = 'https://api.goshippo.com'
const EASYPOST_BASE_URL = 'https://api.easypost.com/v2'
const DEFAULT_FRESHNESS_WINDOW_MS = 5 * 60_000
const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

type QuoteAdapterInput = Readonly<{ quoteInput: ShippingQuoteInput }>

type ShippingProviderQuote = Readonly<{
  kind: 'quoted'
  provider: 'shippo' | 'easypost'
  inputDigest: string
  providerShipmentId: string
  providerRateId: string
  providerAccountId: string
  downstreamCarrier: string
  serviceCode: string
  serviceName?: string
  expectedCost: Readonly<{ currency: string; amountMinor: number }>
  maximumCost: Readonly<{ currency: string; amountMinor: number }>
  expectedLatencyMs: number
  dataFields: readonly string[]
  disclosures: readonly string[]
  observedAt: number
  aeRefreshAfter: number
  freshnessBasis: 'provider_observation_plus_ae_policy'
  providerQuoteRef: string
  providerQuoteExpiresAt: number
  environment: 'test' | 'production' | 'unknown'
  delivery: Readonly<{
    estimatedDays?: number
    estimatedDate?: string
    guaranteed?: boolean
    terms?: string
  }>
}>

type ShippingProviderQuoteResult = ShippingProviderQuote | Readonly<{ kind: 'refused'; reason: string }>

export type ShippingQuoteAdapter = Readonly<{
  quote: (input: QuoteAdapterInput) => Promise<ShippingProviderQuoteResult>
}>

export function createShippoQuoteAdapter(input: Readonly<{
  fetchImpl: FetchLike
  token: string
  signingKey: string
  carrierAccountId: string
  serviceLevelToken?: string
  apiVersion?: string
  baseUrl?: string
  freshnessWindowMs?: number
  now?: () => number
}>): ShippingQuoteAdapter {
  const now = input.now ?? Date.now
  const freshnessWindowMs = validFreshnessWindow(input.freshnessWindowMs)
  requireSecret(input.token, 'shippo_token_invalid')
  requireSecret(input.signingKey, 'provider_quote_signing_key_invalid', 32)
  requireIdentifier(input.carrierAccountId, 'shippo_carrier_account_invalid')
  if (input.serviceLevelToken !== undefined) requireIdentifier(input.serviceLevelToken, 'shippo_service_invalid')
  const headers = {
    Authorization: `ShippoToken ${input.token}`,
    'Content-Type': 'application/json', Accept: 'application/json',
    'SHIPPO-API-VERSION': input.apiVersion ?? '2018-02-08',
  }

  return Object.freeze({
    quote: async ({ quoteInput }) => {
      const response = await providerJson(input.fetchImpl, `${input.baseUrl ?? SHIPPO_BASE_URL}/shipments/`, {
        method: 'POST', headers,
        body: JSON.stringify(shippoShipment(quoteInput, input.carrierAccountId)),
      })
      if (response.kind !== 'ok') return { kind: 'refused', reason: providerReason('shippo_quote', response) }
      const body = record(response.body)
      const rate = selectShippoRate(body?.rates, input.carrierAccountId, input.serviceLevelToken)
      const shipmentId = text(body?.object_id)
      const rateId = text(rate?.object_id)
      const downstreamCarrier = text(rate?.provider)
      const serviceLevel = record(rate?.servicelevel)
      const serviceCode = text(serviceLevel?.token)
      const serviceName = text(serviceLevel?.name)
      const amountMinor = moneyMinor(rate?.amount)
      const currency = currencyCode(rate?.currency)
      const observedAt = timestamp(rate?.object_created)
      if (shipmentId === undefined || rateId === undefined || downstreamCarrier === undefined
        || serviceCode === undefined || amountMinor === undefined || currency === undefined || observedAt === undefined) {
        return { kind: 'refused', reason: 'shippo_quote_invalid' }
      }
      const aeRefreshAfter = observedAt + freshnessWindowMs
      if (aeRefreshAfter <= now()) return { kind: 'refused', reason: 'shippo_quote_stale' }
      return providerQuote({
        provider: 'shippo', quoteInput, shipmentId, rateId, providerAccountId: input.carrierAccountId,
        downstreamCarrier, serviceCode, ...(serviceName === undefined ? {} : { serviceName }),
        amountMinor, currency, observedAt, aeRefreshAfter,
        environment: typeof rate?.test === 'boolean' ? (rate.test ? 'test' : 'production') : 'unknown',
        expectedLatencyMs: 2_500,
        delivery: compactDelivery({
          estimatedDays: integer(rate?.estimated_days),
          estimatedDate: text(rate?.arrives_by),
          terms: text(rate?.duration_terms),
        }),
        disclosure: 'Shippo receives the Request-derived origin, destination and parcel facts to prepare this option.',
        signingKey: input.signingKey,
      })
    },
  })
}

export function createEasyPostQuoteAdapter(input: Readonly<{
  fetchImpl: FetchLike
  apiKey: string
  signingKey: string
  carrierAccountId: string
  service?: string
  baseUrl?: string
  freshnessWindowMs?: number
  now?: () => number
}>): ShippingQuoteAdapter {
  const now = input.now ?? Date.now
  const freshnessWindowMs = validFreshnessWindow(input.freshnessWindowMs)
  requireSecret(input.apiKey, 'easypost_api_key_invalid')
  requireSecret(input.signingKey, 'provider_quote_signing_key_invalid', 32)
  requireIdentifier(input.carrierAccountId, 'easypost_carrier_account_invalid')
  if (input.service !== undefined) requireIdentifier(input.service, 'easypost_service_invalid')
  const headers = {
    Authorization: `Basic ${Buffer.from(`${input.apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  }

  return Object.freeze({
    quote: async ({ quoteInput }) => {
      const response = await providerJson(input.fetchImpl, `${input.baseUrl ?? EASYPOST_BASE_URL}/shipments`, {
        method: 'POST', headers,
        body: JSON.stringify(easyPostShipment(quoteInput, input.carrierAccountId)),
      })
      if (response.kind !== 'ok') return { kind: 'refused', reason: providerReason('easypost_quote', response) }
      const body = record(response.body)
      const rate = selectEasyPostRate(body?.rates, input.carrierAccountId, input.service)
      const shipmentId = text(body?.id)
      const rateId = text(rate?.id)
      const downstreamCarrier = text(rate?.carrier)
      const serviceCode = text(rate?.service)
      const amountMinor = moneyMinor(rate?.rate)
      const currency = currencyCode(rate?.currency)
      const observedAt = timestamp(rate?.created_at)
      if (shipmentId === undefined || rateId === undefined || downstreamCarrier === undefined
        || serviceCode === undefined || amountMinor === undefined || currency === undefined || observedAt === undefined) {
        return { kind: 'refused', reason: 'easypost_quote_invalid' }
      }
      const aeRefreshAfter = observedAt + freshnessWindowMs
      if (aeRefreshAfter <= now()) return { kind: 'refused', reason: 'easypost_quote_stale' }
      const mode = rate?.mode
      return providerQuote({
        provider: 'easypost', quoteInput, shipmentId, rateId, providerAccountId: input.carrierAccountId,
        downstreamCarrier, serviceCode, amountMinor, currency, observedAt, aeRefreshAfter,
        environment: mode === 'test' || mode === 'production' ? mode : 'unknown',
        expectedLatencyMs: 2_000,
        delivery: compactDelivery({
          estimatedDays: integer(rate?.delivery_days),
          estimatedDate: text(rate?.delivery_date),
          guaranteed: typeof rate?.delivery_date_guaranteed === 'boolean' ? rate.delivery_date_guaranteed : undefined,
        }),
        disclosure: 'EasyPost receives the Request-derived origin, destination and parcel facts to prepare this option.',
        signingKey: input.signingKey,
      })
    },
  })
}

function shippoShipment(quoteInput: ShippingQuoteInput, carrierAccountId: string): unknown {
  return {
    address_from: shippoAddress(quoteInput.origin),
    address_to: shippoAddress(quoteInput.destination),
    parcels: [{
      length: String(quoteInput.parcel.lengthMillimetres),
      width: String(quoteInput.parcel.widthMillimetres),
      height: String(quoteInput.parcel.heightMillimetres),
      distance_unit: 'mm',
      weight: String(quoteInput.parcel.weightGrams),
      mass_unit: 'g',
    }],
    carrier_accounts: [carrierAccountId],
    async: false,
  }
}

function easyPostShipment(quoteInput: ShippingQuoteInput, carrierAccountId: string): unknown {
  return {
    shipment: {
      from_address: easyPostAddress(quoteInput.origin),
      to_address: easyPostAddress(quoteInput.destination),
      parcel: {
        length: roundOneDecimal(quoteInput.parcel.lengthMillimetres / 25.4),
        width: roundOneDecimal(quoteInput.parcel.widthMillimetres / 25.4),
        height: roundOneDecimal(quoteInput.parcel.heightMillimetres / 25.4),
        weight: roundOneDecimal(quoteInput.parcel.weightGrams / 28.349523125),
      },
      carrier_accounts: [carrierAccountId],
    },
  }
}

function shippoAddress(address: ShippingQuoteInput['origin']): unknown {
  return {
    name: address.name, street1: address.street1, city: address.city,
    state: address.region, zip: address.postcode, country: address.countryCode,
  }
}

function easyPostAddress(address: ShippingQuoteInput['origin']): unknown {
  return {
    name: address.name, street1: address.street1, city: address.city,
    state: address.region, zip: address.postcode, country: address.countryCode,
  }
}

function providerQuote(input: Readonly<{
  provider: 'shippo' | 'easypost'
  quoteInput: ShippingQuoteInput
  shipmentId: string
  rateId: string
  providerAccountId: string
  downstreamCarrier: string
  serviceCode: string
  serviceName?: string
  amountMinor: number
  currency: string
  observedAt: number
  aeRefreshAfter: number
  environment: 'test' | 'production' | 'unknown'
  expectedLatencyMs: number
  delivery: ShippingProviderQuote['delivery']
  disclosure: string
  signingKey: string
}>): ShippingProviderQuote {
  const providerQuoteRef = issueProviderQuoteRef({
    provider: input.provider,
    shipmentId: input.shipmentId,
    rateId: input.rateId,
    providerAccountId: input.providerAccountId,
    downstreamCarrier: input.downstreamCarrier,
    serviceCode: input.serviceCode,
    amountMinor: input.amountMinor,
    currency: input.currency,
    observedAt: input.observedAt,
    aeRefreshAfter: input.aeRefreshAfter,
    inputDigest: input.quoteInput.inputDigest,
  }, input.signingKey)
  return Object.freeze({
    kind: 'quoted', provider: input.provider, inputDigest: input.quoteInput.inputDigest,
    providerShipmentId: input.shipmentId, providerRateId: input.rateId,
    providerAccountId: input.providerAccountId, downstreamCarrier: input.downstreamCarrier,
    serviceCode: input.serviceCode, ...(input.serviceName === undefined ? {} : { serviceName: input.serviceName }),
    expectedCost: Object.freeze({ currency: input.currency, amountMinor: input.amountMinor }),
    maximumCost: Object.freeze({ currency: input.currency, amountMinor: input.amountMinor }),
    expectedLatencyMs: input.expectedLatencyMs,
    dataFields: Object.freeze([
      'origin', 'destination', 'parcel',
    ]),
    disclosures: Object.freeze([input.disclosure]),
    observedAt: input.observedAt, aeRefreshAfter: input.aeRefreshAfter,
    freshnessBasis: 'provider_observation_plus_ae_policy',
    providerQuoteRef, providerQuoteExpiresAt: input.aeRefreshAfter,
    environment: input.environment, delivery: input.delivery,
  })
}

function issueProviderQuoteRef(material: Readonly<Record<string, string | number>>, signingKey: string): string {
  const payload = Buffer.from(JSON.stringify(material)).toString('base64url')
  const signature = createHmac('sha256', signingKey).update(payload).digest('base64url')
  return `ae-provider-quote:v2:${payload}:${signature}`
}

type ProviderJsonResult =
  | Readonly<{ kind: 'ok'; status: number; body: unknown }>
  | Readonly<{ kind: 'provider_error'; status: number; body: unknown }>
  | Readonly<{ kind: 'invalid_response'; status: number }>
  | Readonly<{ kind: 'transport_unknown' }>

async function providerJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<ProviderJsonResult> {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  } catch {
    return { kind: 'transport_unknown' }
  }
  const buffer = await readBoundedBody(response, MAX_PROVIDER_RESPONSE_BYTES)
  if (buffer === undefined) return { kind: 'invalid_response', status: response.status }
  const bodyText = new TextDecoder().decode(buffer)
  let body: unknown
  try { body = bodyText.length === 0 ? {} : JSON.parse(bodyText) } catch {
    return { kind: 'invalid_response', status: response.status }
  }
  return response.ok ? { kind: 'ok', status: response.status, body } : { kind: 'provider_error', status: response.status, body }
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Uint8Array | undefined> {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        await reader.cancel('provider_response_too_large').catch(() => undefined)
        return undefined
      }
      chunks.push(value)
    }
  } catch {
    return undefined
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

function selectShippoRate(value: unknown, carrierAccountId: string, serviceLevelToken?: string): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(record).find((rate) => rate?.carrier_account === carrierAccountId
    && (serviceLevelToken === undefined || record(rate.servicelevel)?.token === serviceLevelToken))
}

function selectEasyPostRate(value: unknown, carrierAccountId: string, service?: string): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(record).find((rate) => rate?.carrier_account_id === carrierAccountId
    && (service === undefined || rate?.service === service))
}

function compactDelivery(input: Readonly<{
  estimatedDays?: number | undefined
  estimatedDate?: string | undefined
  guaranteed?: boolean | undefined
  terms?: string | undefined
}>): ShippingProviderQuote['delivery'] {
  return Object.freeze({
    ...(input.estimatedDays === undefined ? {} : { estimatedDays: input.estimatedDays }),
    ...(input.estimatedDate === undefined ? {} : { estimatedDate: input.estimatedDate }),
    ...(input.guaranteed === undefined ? {} : { guaranteed: input.guaranteed }),
    ...(input.terms === undefined ? {} : { terms: input.terms }),
  })
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500 ? value.trim() : undefined
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function currencyCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}

function moneyMinor(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value)
  if (match === null) return undefined
  const amount = (BigInt(match[1] ?? '0') * 100n) + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined
}

function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function providerReason(prefix: string, result: Exclude<ProviderJsonResult, { kind: 'ok' }>): string {
  return `${prefix}_${result.kind === 'provider_error' ? result.status : result.kind}`
}

function validFreshnessWindow(value: number | undefined): number {
  const resolved = value ?? DEFAULT_FRESHNESS_WINDOW_MS
  if (!Number.isSafeInteger(resolved) || resolved < 30_000 || resolved > 15 * 60_000) {
    throw new Error('provider_freshness_window_invalid')
  }
  return resolved
}

function requireSecret(value: string, reason: string, minimumLength = 1): void {
  if (typeof value !== 'string' || value.trim().length < minimumLength) throw new Error(reason)
}

function requireIdentifier(value: string, reason: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) throw new Error(reason)
}
