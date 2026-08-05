import { isRecord } from '@/modules/common/is-record'
import type { SupplyFunnelDraft, SupplyFunnelStep, SupplyFunnelStepState } from '@/modules/capability-supply/supply-funnel.functions'

export const OWNER_SUPPLY_DRAFT_STORAGE_KEY = 'ae.supplyFunnelDraft.v1'
const SUPPLY_DRAFT_MAX_BYTES = 100_000

export function emptySupplyFunnelDraft(businessId: string, offeringRef?: string): SupplyFunnelDraft {
  const states: Record<SupplyFunnelStep, SupplyFunnelStepState> = {
    describe: 'not_started', endpoint: 'not_started', readiness: 'not_started', pricing: 'not_started', test: 'not_started', publish: 'not_started',
  }
  return { version: 'supply-funnel:v1', businessId, ...(offeringRef === undefined ? {} : { offeringRef }), completedSteps: [], states }
}

function isDraft(value: unknown): value is SupplyFunnelDraft {
  if (!isRecord(value)) return false
  return value.version === 'supply-funnel:v1' && typeof value.businessId === 'string' && Array.isArray(value.completedSteps) && typeof value.states === 'object' && value.states !== null
}

export function readSupplyFunnelDraft(): SupplyFunnelDraft | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.sessionStorage.getItem(OWNER_SUPPLY_DRAFT_STORAGE_KEY)
  if (raw === null || new TextEncoder().encode(raw).byteLength > SUPPLY_DRAFT_MAX_BYTES) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isDraft(parsed)) { window.sessionStorage.removeItem(OWNER_SUPPLY_DRAFT_STORAGE_KEY); return undefined }
    return parsed
  } catch {
    window.sessionStorage.removeItem(OWNER_SUPPLY_DRAFT_STORAGE_KEY)
    return undefined
  }
}

export function writeSupplyFunnelDraft(draft: SupplyFunnelDraft): void {
  if (typeof window === 'undefined') return
  const encoded = JSON.stringify(draft)
  if (new TextEncoder().encode(encoded).byteLength <= SUPPLY_DRAFT_MAX_BYTES) window.sessionStorage.setItem(OWNER_SUPPLY_DRAFT_STORAGE_KEY, encoded)
}
