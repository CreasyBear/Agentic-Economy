import { isRecord } from '@/modules/common/is-record'

import type { ClaimEnrichIntent, ClaimFormSearch, FoundBusiness } from './AeFindMyBusiness'

export const CLAIM_ENRICH_INTENT_STORAGE_KEY = 'ae.claimEnrichIntent.v1'

export function writeClaimEnrichIntent(intent: ClaimEnrichIntent): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(CLAIM_ENRICH_INTENT_STORAGE_KEY, JSON.stringify(intent))
}

export function readClaimEnrichIntent(): ClaimEnrichIntent | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.sessionStorage.getItem(CLAIM_ENRICH_INTENT_STORAGE_KEY)
  if (raw === null) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !('businessName' in parsed)) return undefined
    const businessName = parsed.businessName
    if (typeof businessName !== 'string' || businessName.trim().length === 0) return undefined
    const suburb = 'suburb' in parsed && typeof parsed.suburb === 'string' ? parsed.suburb : undefined
    return { businessName, ...(suburb === undefined || suburb.length === 0 ? {} : { suburb }) }
  } catch {
    return undefined
  }
}

export function clearClaimEnrichIntent(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(CLAIM_ENRICH_INTENT_STORAGE_KEY)
}

export function claimFormSearchFor(business: FoundBusiness, source?: 'supply'): ClaimFormSearch {
  return {
    businessContext: business.businessContext,
    businessName: business.name,
    category: business.category,
    requestedSlug: business.slug,
    ...(source === 'supply' ? { source } : {}),
  }
}
