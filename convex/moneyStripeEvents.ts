import type { Doc } from './_generated/dataModel'
import {
  amountFromParts,
  compareExactAmounts,
  type StripeMoneyWebhookEvent,
} from '../src/modules/money/public'

export function eventRowMatches(
  row: Doc<'moneyStripeEvents'>,
  event: StripeMoneyWebhookEvent,
): boolean {
  if (
    row.eventType !== event.eventType ||
    row.payloadDigest !== event.payloadDigest ||
    row.providerObjectId !== event.externalRef
  )
    return false
  switch (event.kind) {
    case 'account':
      return (
        row.commandRef === undefined &&
        row.sessionId === undefined &&
        row.paymentId === undefined &&
        row.checkoutStatus === undefined &&
        row.providerObjectDigest === event.providerObjectDigest &&
        row.providerObjectVersion === event.providerObjectVersion
      )
    case 'checkout': {
      const rowAmount =
        row.amountUnits === undefined ||
        row.currency === undefined ||
        row.exponent === undefined
          ? undefined
          : amountFromParts(row.currency, row.amountUnits, row.exponent)
      return (
        row.commandRef === event.commandRef &&
        row.sessionId === event.sessionId &&
        row.paymentId === event.paymentId &&
        row.providerObjectDigest === event.checkoutSessionDigest &&
        row.paymentIntentDigest === event.paymentIntentDigest &&
        row.checkoutStatus === event.status &&
        row.metadataDigest === event.metadataDigest &&
        rowAmount !== undefined &&
        compareExactAmounts(rowAmount, event.amount) === 0
      )
    }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export function eventRowFields(event: StripeMoneyWebhookEvent) {
  const base = {
    stripeEventId: event.stripeEventId,
    eventType: event.eventType,
    payloadDigest: event.payloadDigest,
    providerObjectId: event.externalRef,
    receivedAt: event.observedAt,
  }
  switch (event.kind) {
    case 'account':
      return {
        ...base,
        providerObjectDigest: event.providerObjectDigest,
        ...(event.providerObjectVersion === undefined
          ? {}
          : { providerObjectVersion: event.providerObjectVersion }),
      }
    case 'checkout':
      return {
        ...base,
        commandRef: event.commandRef,
        sessionId: event.sessionId,
        ...(event.paymentId === undefined ? {} : { paymentId: event.paymentId }),
        providerObjectDigest: event.checkoutSessionDigest,
        ...(event.paymentIntentDigest === undefined
          ? {}
          : { paymentIntentDigest: event.paymentIntentDigest }),
        checkoutStatus: event.status,
        currency: event.amount.currency,
        amountUnits: event.amount.units,
        exponent: event.amount.exponent,
        metadataDigest: event.metadataDigest,
      }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}
