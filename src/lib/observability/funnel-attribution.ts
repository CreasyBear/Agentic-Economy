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

  const source =
    utmSource ??
    ref ??
    (typeof document !== 'undefined' && document.referrer.length > 0 ? 'referrer' : 'direct')

  return {
    source,
    ...(typeof document !== 'undefined' && document.referrer.length > 0
      ? { referrer: document.referrer.slice(0, 240) }
      : {}),
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

function readSearchString(search: Record<string, unknown>, key: string): string | undefined {
  const value = search[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 120)
}
