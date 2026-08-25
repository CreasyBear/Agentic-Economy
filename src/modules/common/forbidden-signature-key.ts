import { isRecord } from './is-record'

export function containsForbiddenSignatureKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSignatureKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => (
    key === 'signature'
    || key === 'paymentSignature'
    || key === 'PAYMENT-SIGNATURE'
    || key === 'Payment-Signature'
    || containsForbiddenSignatureKey(child)
  ))
}
