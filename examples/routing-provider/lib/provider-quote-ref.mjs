import { createHmac, timingSafeEqual } from 'node:crypto'

export function issueProviderQuoteRef(material, signingKey) {
  requireSigningKey(signingKey)
  const payload = Buffer.from(JSON.stringify(material)).toString('base64url')
  const signature = createHmac('sha256', signingKey).update(payload).digest('base64url')
  return `ae-provider-quote:v1:${payload}:${signature}`
}

export function verifyProviderQuoteRef(reference, expectedProvider, signingKey, now = Date.now(), options = {}) {
  requireSigningKey(signingKey)
  const match = /^ae-provider-quote:v1:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(reference ?? '')
  if (match === null) return undefined
  const [, payload = '', supplied = ''] = match
  const expected = createHmac('sha256', signingKey).update(payload).digest('base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return undefined
  try {
    const material = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!validMaterial(material, expectedProvider)
      || (options.allowExpired !== true && material.expiresAt <= now)) return undefined
    return Object.freeze(material)
  } catch { return undefined }
}

function validMaterial(material, expectedProvider) {
  if (typeof material !== 'object' || material === null || Array.isArray(material)) return false
  const keys = Object.keys(material).sort()
  if (keys.join(',') !== 'amountMinor,currency,expiresAt,provider,rateId,shipmentId') return false
  return material.provider === expectedProvider
    && boundedIdentifier(material.shipmentId)
    && boundedIdentifier(material.rateId)
    && Number.isSafeInteger(material.amountMinor)
    && material.amountMinor >= 0
    && material.currency === 'AUD'
    && Number.isSafeInteger(material.expiresAt)
    && material.expiresAt > 0
}

function boundedIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

function requireSigningKey(value) {
  if (typeof value !== 'string' || value.length < 32) throw new Error('provider_quote_signing_key_invalid')
}
