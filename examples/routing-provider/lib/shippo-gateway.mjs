import { audMinor, providerJson } from './provider-http.mjs'
import { issueProviderQuoteRef, verifyProviderQuoteRef } from './provider-quote-ref.mjs'

const baseUrl = 'https://api.goshippo.com'

export function createShippoGateway(input) {
  const now = input.now ?? Date.now
  const headers = {
    Authorization: `ShippoToken ${input.token}`,
    'Content-Type': 'application/json', Accept: 'application/json',
    'SHIPPO-API-VERSION': input.apiVersion ?? '2018-02-08',
  }

  return Object.freeze({
    quote: async () => {
      const response = await providerJson(input.fetchImpl, `${baseUrl}/shipments`, {
        method: 'POST', headers, body: JSON.stringify({ ...input.shipmentTemplate, async: false, carrier_accounts: [input.carrierAccountId] }),
      })
      if (response.kind !== 'ok') return { kind: 'refused', reason: providerReason('shippo_quote', response) }
      const rate = selectRate(response.body?.rates, input.carrierAccountId, input.serviceLevelToken)
      const shipmentId = text(response.body?.object_id)
      const rateId = text(rate?.object_id)
      const amountMinor = audMinor(rate?.amount)
      const currency = text(rate?.currency)?.toUpperCase()
      if (shipmentId === undefined || rateId === undefined || amountMinor === undefined || currency !== 'AUD') {
        return { kind: 'refused', reason: 'shippo_quote_invalid' }
      }
      const providerExpiry = Date.parse(rate?.expires_at ?? rate?.expiration_datetime ?? '')
      const expiresAt = Number.isFinite(providerExpiry) ? providerExpiry : now() + 5 * 60_000
      if (expiresAt <= now()) return { kind: 'refused', reason: 'shippo_quote_expired' }
      return {
        kind: 'quoted', expectedCost: { currency, amountMinor }, maximumCost: { currency, amountMinor },
        expectedLatencyMs: 2_500, dataFields: [],
        disclosures: ['Shippo receives the operator-configured tracer shipment and selected carrier account.'],
        providerQuoteRef: issueProviderQuoteRef({ provider: 'shippo', shipmentId, rateId, amountMinor, currency, expiresAt }, input.signingKey),
        providerQuoteExpiresAt: expiresAt,
      }
    },
    execute: async ({ providerQuoteRef }) => {
      const quote = verifyProviderQuoteRef(providerQuoteRef, 'shippo', input.signingKey, now())
      if (quote === undefined) return { kind: 'effect_not_committed', reason: 'provider_quote_invalid' }
      const response = await providerJson(input.fetchImpl, `${baseUrl}/transactions`, {
        method: 'POST', headers, body: JSON.stringify({ rate: quote.rateId, async: false, label_file_type: 'PDF' }),
      })
      if (response.kind !== 'ok') {
        return { kind: 'outcome_unknown', providerReference: `shippo-rate:${quote.rateId}` }
      }
      return transactionOutcome(response.body, quote)
    },
    reconcile: async ({ providerQuoteRef }) => {
      const quote = verifyProviderQuoteRef(providerQuoteRef, 'shippo', input.signingKey, now(), { allowExpired: true })
      if (quote === undefined) return { kind: 'effect_not_committed', reason: 'provider_quote_invalid' }
      const response = await providerJson(input.fetchImpl, `${baseUrl}/transactions?rate=${encodeURIComponent(quote.rateId)}`, { method: 'GET', headers })
      if (response.kind !== 'ok') return { kind: 'reconciliation_pending' }
      const rows = Array.isArray(response.body?.results) ? response.body.results : []
      if (rows.length === 0) return { kind: 'reconciliation_pending' }
      if (rows.length !== 1) return { kind: 'outcome_unknown', providerReference: `shippo-rate:${quote.rateId}` }
      return transactionOutcome(rows[0], quote)
    },
  })
}

function transactionOutcome(transaction, quote) {
  const transactionId = text(transaction?.object_id)
  if (transactionId === undefined) return { kind: 'outcome_unknown', providerReference: `shippo-rate:${quote.rateId}` }
  const rate = typeof transaction?.rate === 'object' && transaction.rate !== null ? transaction.rate : undefined
  const transactionRateId = text(rate?.object_id) ?? (typeof transaction?.rate === 'string' ? transaction.rate : undefined)
  const amountMinor = audMinor(rate?.amount)
  const currency = text(rate?.currency)?.toUpperCase()
  const includesMonetaryRate = rate !== undefined && (rate.amount !== undefined || rate.currency !== undefined)
  if (transactionRateId !== quote.rateId
    || (includesMonetaryRate && (amountMinor !== quote.amountMinor || currency !== quote.currency))) {
    return { kind: 'outcome_unknown', providerReference: transactionId }
  }
  if (transaction?.status !== 'SUCCESS') {
    return transaction?.status === 'ERROR'
      ? { kind: 'effect_not_committed', reason: 'shippo_transaction_error', providerReference: transactionId }
      : { kind: 'outcome_unknown', providerReference: transactionId }
  }
  return {
    kind: 'effect_committed', providerReference: transactionId,
    reportedCost: { currency: quote.currency, amountMinor: quote.amountMinor },
    outcome: { provider: 'shippo', provider_status: 'SUCCESS', shipment_id: quote.shipmentId, transaction_id: transactionId, tracking_state: text(transaction?.tracking_number) === undefined ? 'not_reported' : 'assigned', label_state: text(transaction?.label_url) === undefined ? 'not_reported' : 'available' },
  }
}

function selectRate(rates, carrierAccountId, serviceLevelToken) {
  if (!Array.isArray(rates)) return undefined
  return rates.find((rate) => rate?.carrier_account === carrierAccountId
    && (serviceLevelToken === undefined || rate?.servicelevel?.token === serviceLevelToken))
}
function providerReason(prefix, result) { return `${prefix}_${result.kind === 'provider_error' ? result.status : result.kind}` }
function text(value) { return typeof value === 'string' && value.length > 0 ? value : undefined }
