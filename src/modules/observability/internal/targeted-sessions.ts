export type TargetedSessionSourceRow = Record<string, unknown>

export type ReconstructTargetedSessionsOptions = {
  runId: string
  windowStartMs?: number
  windowEndMs?: number
}

export type TargetedSessionEvidence = {
  eventType: 'visitor_attributed'
  source: string
  utmCampaign: string
  pseudonymousSessionId: string
  firstSeenAt: number
  lastSeenAt: number
  eventCount: number
  firstCorrelationId?: string
  utmSource?: string
  referrerHost?: string
}

export type TargetedSessionReconstruction = {
  count: number
  sessions: TargetedSessionEvidence[]
}

export function reconstructTargetedSessions(
  rows: readonly TargetedSessionSourceRow[],
  options: ReconstructTargetedSessionsOptions,
): TargetedSessionReconstruction {
  const runId = options.runId.trim()
  if (runId.length === 0) {
    return { count: 0, sessions: [] }
  }

  const sessionsByKey = new Map<string, TargetedSessionEvidence>()

  for (const row of rows) {
    const eventType = readString(row, 'eventType') ?? readString(row, 'event')
    if (eventType !== 'visitor_attributed') {
      continue
    }

    const utmCampaign = readString(row, 'utmCampaign') ?? readString(row, 'utm_campaign')
    if (utmCampaign !== runId) {
      continue
    }

    const pseudonymousSessionId =
      readString(row, 'pseudonymousSessionId') ??
      readString(row, 'pseudonymous_session_id') ??
      readString(row, 'distinct_id')
    if (pseudonymousSessionId === undefined) {
      continue
    }

    const seenAt = readTimestamp(row)
    if (seenAt === undefined || !isWithinWindow(seenAt, options)) {
      continue
    }

    const source = readString(row, 'source') ?? readString(row, 'ae_source')
    const utmSource = readString(row, 'utmSource') ?? readString(row, 'utm_source')
    const referrerHost = normalizeReferrerEvidence(
      readString(row, 'referrer') ?? readString(row, '$referrer') ?? readString(row, 'referrerHost'),
    )
    if (!hasExplicitAttribution(source, utmSource, referrerHost)) {
      continue
    }

    const correlationId = readString(row, 'correlationId') ?? readString(row, 'correlation_id') ?? readString(row, 'uuid')
    const key = `${runId}\u0000${pseudonymousSessionId}`
    const existing = sessionsByKey.get(key)
    if (existing === undefined) {
      sessionsByKey.set(key, {
        eventType: 'visitor_attributed',
        source: source ?? 'unknown',
        utmCampaign: runId,
        pseudonymousSessionId,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        eventCount: 1,
        ...(correlationId === undefined ? {} : { firstCorrelationId: correlationId }),
        ...(utmSource === undefined ? {} : { utmSource }),
        ...(referrerHost === undefined ? {} : { referrerHost }),
      })
      continue
    }

    existing.eventCount += 1
    existing.lastSeenAt = Math.max(existing.lastSeenAt, seenAt)
    if (seenAt < existing.firstSeenAt) {
      existing.firstSeenAt = seenAt
      existing.source = source ?? 'unknown'
      if (correlationId !== undefined) {
        existing.firstCorrelationId = correlationId
      }
      if (utmSource !== undefined) {
        existing.utmSource = utmSource
      }
      if (referrerHost !== undefined) {
        existing.referrerHost = referrerHost
      }
    }
  }

  const sessions = [...sessionsByKey.values()].sort((left, right) =>
    left.firstSeenAt - right.firstSeenAt || left.pseudonymousSessionId.localeCompare(right.pseudonymousSessionId),
  )
  return { count: sessions.length, sessions }
}

function hasExplicitAttribution(
  source: string | undefined,
  utmSource: string | undefined,
  referrerHost: string | undefined,
): boolean {
  if (utmSource !== undefined || referrerHost !== undefined) {
    return true
  }

  const normalizedSource = source?.trim().toLowerCase()
  return (
    normalizedSource !== undefined &&
    normalizedSource.length > 0 &&
    normalizedSource !== 'direct' &&
    normalizedSource !== 'unknown' &&
    normalizedSource !== 'referrer'
  )
}

function readString(row: TargetedSessionSourceRow, key: string): string | undefined {
  const value = row[key] ?? readPropertiesString(row, key)
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function readPropertiesString(row: TargetedSessionSourceRow, key: string): unknown {
  const properties = row.properties
  if (!isRecord(properties)) {
    return undefined
  }

  const value = properties[key]
  if (value !== undefined) {
    return value
  }

  if (key === 'source') {
    return properties.ae_source
  }
  if (key === 'correlationId') {
    return properties.ae_correlation_id
  }

  return undefined
}

function readTimestamp(row: TargetedSessionSourceRow): number | undefined {
  const value = row.createdAt ?? row.timestamp ?? row.time ?? readPropertiesValue(row, 'createdAt')
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function readPropertiesValue(row: TargetedSessionSourceRow, key: string): unknown {
  const properties = row.properties
  return isRecord(properties) ? properties[key] : undefined
}

function isWithinWindow(timestamp: number, options: ReconstructTargetedSessionsOptions): boolean {
  if (options.windowStartMs !== undefined && timestamp < options.windowStartMs) {
    return false
  }
  if (options.windowEndMs !== undefined && timestamp > options.windowEndMs) {
    return false
  }
  return true
}

function normalizeReferrerEvidence(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const host = parseHost(trimmed) ?? parseHost(`https://${trimmed}`)
  return host ?? '[redacted-referrer]'
}

function parseHost(value: string): string | undefined {
  try {
    const host = new URL(value).hostname.trim().toLowerCase()
    return host.length === 0 ? undefined : host.slice(0, 240)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
