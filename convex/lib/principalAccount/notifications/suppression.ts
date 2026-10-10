import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import type { DataModel } from '../../../_generated/dataModel'

export type SuppressionReason = 'hard_bounce' | 'complaint'

/** Addresses are kept as a SHA-256 hash, so lookups hash first and the table never holds plain addresses. */
export async function emailAddressHash(address: string): Promise<string> {
  const normalized = address.trim().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
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
