export type FunnelAttribution = {
  source: string
  referrer?: string
  utmSource?: string
  utmCampaign?: string
}

const sessionStorageKey = 'ae.pseudonymousSessionId'

export function getOrCreatePseudonymousSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-session'
  }

  const existing = window.sessionStorage.getItem(sessionStorageKey)
  if (existing !== null && existing.trim().length > 0) {
    return existing
  }

  const created = `sess_${crypto.randomUUID()}`
  window.sessionStorage.setItem(sessionStorageKey, created)
  return created
}

export function readFunnelAttribution(search: Record<string, unknown> = {}): FunnelAttribution {
  const utmSource = readSearchString(search, 'utm_source')
  const utmCampaign = readSearchString(search, 'utm_campaign')
  const ref = readSearchString(search, 'ref')

  const safeReferrer = typeof document === 'undefined' ? undefined : sanitizedReferrer(document.referrer)
  const source =
    utmSource ??
    ref ??
    (safeReferrer === undefined ? 'direct' : 'referrer')

  return {
    source,
    ...(safeReferrer === undefined ? {} : { referrer: safeReferrer }),
    ...(utmSource === undefined ? {} : { utmSource }),
    ...(utmCampaign === undefined ? {} : { utmCampaign }),
  }
}

export function createFunnelCorrelationId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}:${crypto.randomUUID()}`
  }

  return `${prefix}:${Date.now()}`
}

function sanitizedReferrer(referrer: string): string | undefined {
  if (referrer.trim().length === 0) return undefined
  try {
    const url = new URL(referrer)
    return `${url.origin}${url.pathname}`.slice(0, 240)
  } catch {
    return undefined
  }
}

function readSearchString(search: Record<string, unknown>, key: string): string | undefined {
  const value = search[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 120)
}
