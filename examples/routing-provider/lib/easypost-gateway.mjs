import { audMinor, providerJson } from './provider-http.mjs'
import { issueProviderQuoteRef, verifyProviderQuoteRef } from './provider-quote-ref.mjs'

const baseUrl = 'https://api.easypost.com/v2'

export function createEasyPostGateway(input) {
  const now = input.now ?? Date.now
  const headers = {
    Authorization: `Basic ${Buffer.from(`${input.apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  }
  return Object.freeze({
    quote: async () => {
      const response = await providerJson(input.fetchImpl, `${baseUrl}/shipments`, {
        method: 'POST', headers, body: JSON.stringify({ shipment: { ...input.shipmentTemplate, carrier_accounts: [input.carrierAccountId] } }),
      })
      if (response.kind !== 'ok') return { kind: 'refused', reason: providerReason('easypost_quote', response) }
      const shipment = response.body
      const rate = selectRate(shipment?.rates, input.carrierAccountId, input.service)
      const shipmentId = text(shipment?.id)
      const rateId = text(rate?.id)
      const amountMinor = audMinor(rate?.rate)
      const currency = text(rate?.currency)?.toUpperCase()
      if (shipmentId === undefined || rateId === undefined || amountMinor === undefined || currency !== 'AUD') {
        return { kind: 'refused', reason: 'easypost_quote_invalid' }
      }
      const expiresAt = now() + 5 * 60_000
      return {
        kind: 'quoted', expectedCost: { currency, amountMinor }, maximumCost: { currency, amountMinor },
        expectedLatencyMs: 2_000, dataFields: [],
        disclosures: ['EasyPost receives the operator-configured tracer shipment and selected carrier account.'],
        providerQuoteRef: issueProviderQuoteRef({ provider: 'easypost', shipmentId, rateId, amountMinor, currency, expiresAt }, input.signingKey),
        providerQuoteExpiresAt: expiresAt,
      }
    },
    execute: async ({ providerQuoteRef }) => {
      const quote = verifyProviderQuoteRef(providerQuoteRef, 'easypost', input.signingKey, now())
      if (quote === undefined) return { kind: 'effect_not_committed', reason: 'provider_quote_invalid' }
      const response = await providerJson(input.fetchImpl, `${baseUrl}/shipments/${encodeURIComponent(quote.shipmentId)}/buy`, {
        method: 'POST', headers, body: JSON.stringify({ rate: { id: quote.rateId } }),
      })
      if (response.kind !== 'ok') {
        return { kind: 'outcome_unknown', providerReference: quote.shipmentId }
      }
      return shipmentOutcome(response.body, quote)
    },
    reconcile: async ({ providerQuoteRef }) => {
      const quote = verifyProviderQuoteRef(providerQuoteRef, 'easypost', input.signingKey, now(), { allowExpired: true })
      if (quote === undefined) return { kind: 'effect_not_committed', reason: 'provider_quote_invalid' }
      const response = await providerJson(input.fetchImpl, `${baseUrl}/shipments/${encodeURIComponent(quote.shipmentId)}`, { method: 'GET', headers })
      if (response.kind !== 'ok') return { kind: 'reconciliation_pending' }
      return shipmentOutcome(response.body, quote)
    },
  })
}

function shipmentOutcome(shipment, quote) {
  if (text(shipment?.id) !== quote.shipmentId) return { kind: 'outcome_unknown', providerReference: quote.shipmentId }
  const trackingCode = text(shipment?.tracking_code)
  const labelUrl = text(shipment?.postage_label?.label_url)
  if (trackingCode === undefined || labelUrl === undefined) return { kind: 'reconciliation_pending' }
  const selectedRate = shipment?.selected_rate
  const selectedRateId = text(selectedRate?.id)
  const amountMinor = audMinor(selectedRate?.rate)
  const currency = text(selectedRate?.currency)?.toUpperCase()
  if (selectedRateId !== quote.rateId || amountMinor !== quote.amountMinor || currency !== quote.currency) {
    return { kind: 'outcome_unknown', providerReference: quote.shipmentId }
  }
  return {
    kind: 'effect_committed', providerReference: quote.shipmentId,
    reportedCost: { currency: quote.currency, amountMinor: quote.amountMinor },
    outcome: { provider: 'easypost', provider_status: 'purchased', shipment_id: quote.shipmentId, tracking_state: 'assigned', label_state: 'available' },
  }
}

function selectRate(rates, carrierAccountId, service) {
  if (!Array.isArray(rates)) return undefined
  return rates.find((rate) => rate?.carrier_account_id === carrierAccountId
    && (service === undefined || rate?.service === service))
}
function providerReason(prefix, result) { return `${prefix}_${result.kind === 'provider_error' ? result.status : result.kind}` }
function text(value) { return typeof value === 'string' && value.length > 0 ? value : undefined }
