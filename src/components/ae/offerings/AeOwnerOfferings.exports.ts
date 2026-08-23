import type { BusinessOfferingStatus, PublicOfferingSupplyProjection } from '@/modules/catalog/public'

import type { OwnerOfferingEditorValue, OwnerOfferingSummary } from './AeOwnerOfferings'

export const OWNER_OFFERING_DRAFT_STORAGE_KEY = 'ae.ownerOfferingDraft.v1'

export function readStoredOfferingDraft(businessId: string): OwnerOfferingEditorValue | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.sessionStorage.getItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return { ...emptyOwnerOfferingEditorValue, ...parsed }
  } catch {
    return undefined
  }
}

export function writeStoredOfferingDraft(businessId: string, value: OwnerOfferingEditorValue): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`, JSON.stringify(value))
}

export function clearStoredOfferingDraft(businessId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:${businessId}`)
}

/**
 * The single publish gate, shared by the editor and the save path. A draft may
 * park with any subset of fields; publishing needs the facts a customer reads
 * first. Returns the field to name and focus, or undefined to proceed.
 */
export function publishGateRefusal(
  value: OwnerOfferingEditorValue,
): Readonly<{ field: string; message: string }> | undefined {
  if (value.status !== 'published') return undefined
  if (value.name.trim().length === 0) return { field: 'name', message: 'Add an Operation name before publishing.' }
  if (value.category.trim().length === 0) return { field: 'category', message: 'Add an Operation category before publishing.' }
  if (value.summary.trim().length === 0) return { field: 'summary', message: 'Add a clear Operation summary before publishing.' }
  return undefined
}

export function toOwnerOfferingSummary(projection: PublicOfferingSupplyProjection, status: BusinessOfferingStatus = 'published'): OwnerOfferingSummary {
  return { offering: projection.offering, status, accessPathCount: projection.accessPaths.length, support: projection.support }
}

export const emptyOwnerOfferingEditorValue: OwnerOfferingEditorValue = {
  expectedRevision: 0, name: '', category: '', summary: '', serviceAreaSummary: '', availabilitySummary: '', pricingSummary: '', price: undefined, status: 'draft', accessPaths: [],
}
