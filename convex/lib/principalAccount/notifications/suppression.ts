import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import type { DataModel } from '../../../_generated/dataModel'

export type SuppressionReason = 'hard_bounce' | 'complaint'

/** Addresses are kept as a keyed HMAC-SHA256 hash under its own never-rotated secret (separate from the unsubscribe signing key, so rotating that cannot un-suppress anyone), so the table holds no plain addresses and a leaked table cannot be dictionary-attacked without the server key. Throws when the secret is unset so the caller skips the send. */
export async function emailAddressHash(address: string, secret: string | undefined = process.env.EMAIL_SUPPRESSION_HASH_SECRET): Promise<string> {
  if (secret === undefined || secret.length === 0) throw new Error('EMAIL_SUPPRESSION_HASH_SECRET is not set')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`suppression:v1:${address.trim().toLowerCase()}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const emailDomain = (address: string): string => address.trim().toLowerCase().split('@').at(-1) ?? ''

/** Streams a complaint silences. Transactional and operator mail still go after a complaint. */
const COMPLAINT_BLOCKED_STREAMS = new Set(['alert', 'lifecycle'])

/** A hard bounce blocks every stream. A complaint blocks only alert and lifecycle mail, so required and operator mail still reach the owner. */
export async function suppressionCode(
  db: GenericDatabaseReader<DataModel>,
  input: { addressHash: string; stream: string },
): Promise<string | null> {
  const rows = await db.query('emailSuppressions')
    .withIndex('by_addressHash', (query) => query.eq('addressHash', input.addressHash))
    .collect()
  if (rows.some((row) => row.reason === 'hard_bounce')) return 'hard_bounce_suppressed'
  if (COMPLAINT_BLOCKED_STREAMS.has(input.stream) && rows.some((row) => row.reason === 'complaint')) return 'complaint_suppressed'
  return null
}

export async function recordSuppression(
  db: GenericDatabaseWriter<DataModel>,
  input: { addressHash: string; domain: string; reason: SuppressionReason; sourceDeliveryRef: string },
): Promise<void> {
  const rows = await db.query('emailSuppressions')
    .withIndex('by_addressHash', (query) => query.eq('addressHash', input.addressHash))
    .collect()
  if (rows.some((row) => row.reason === input.reason)) return
  await db.insert('emailSuppressions', { ...input, createdAt: Date.now() })
}
