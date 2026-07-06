export type SupplierActionSourceRow = Record<string, unknown>

export type ReconstructSupplierActionsOptions = {
  windowStartMs?: number
  windowEndMs?: number
}

export type SupplierActionType = 'listing_request' | 'owner_interest' | 'operator_evidence'

export type SupplierActionEvidence = {
  type: SupplierActionType
  actionKey: string
  businessId: string
  firstSeenAt: number
  lastSeenAt: number
  rowCount: number
  source: 'claim' | 'funnel_event' | 'operator_evidence'
  claimId?: string
  slug?: string
  correlationId?: string
  evidenceRef?: string
}

export type SupplierActionReconstruction = {
  count: number
  actions: SupplierActionEvidence[]
}

export type SupplierActionSources = {
  claims?: readonly SupplierActionSourceRow[]
  funnelEvents?: readonly SupplierActionSourceRow[]
  recruitment?: readonly SupplierActionSourceRow[]
  operatorEvidence?: readonly SupplierActionSourceRow[]
  disputes?: readonly SupplierActionSourceRow[]
}

type NormalizedSupplierActionSources = Required<SupplierActionSources>

export function reconstructSupplierActions(
  source: SupplierActionSources | readonly SupplierActionSourceRow[],
  options: ReconstructSupplierActionsOptions = {},
): SupplierActionReconstruction {
  const actionsByKey = new Map<string, SupplierActionEvidence>()
  const sources = normalizeSources(source)

  for (const row of sources.claims) {
    const action = actionFromClaimRow(row, sources, options)
    if (action !== undefined) {
      upsertAction(actionsByKey, action)
    }
  }

  for (const row of sources.funnelEvents) {
    const action = actionFromFunnelRow(row, sources, options)
    if (action !== undefined) {
      upsertAction(actionsByKey, action)
    }
  }

  for (const row of sources.operatorEvidence) {
    const action = actionFromOperatorEvidenceRow(row, options)
    if (action !== undefined && !hasExistingCorroboratedAction(actionsByKey, action)) {
      upsertAction(actionsByKey, action)
    }
  }

  const actions = [...actionsByKey.values()].sort((left, right) =>
    left.firstSeenAt - right.firstSeenAt || left.actionKey.localeCompare(right.actionKey),
  )

  return { count: actions.length, actions }
}

function normalizeSources(source: SupplierActionSources | readonly SupplierActionSourceRow[]): NormalizedSupplierActionSources {
  if (!isSourceRowArray(source)) {
    return {
      claims: source.claims ?? [],
      funnelEvents: source.funnelEvents ?? [],
      recruitment: source.recruitment ?? [],
      operatorEvidence: source.operatorEvidence ?? [],
      disputes: source.disputes ?? [],
    }
  }

  const claims: SupplierActionSourceRow[] = []
  const funnelEvents: SupplierActionSourceRow[] = []
  const recruitment: SupplierActionSourceRow[] = []
  const operatorEvidence: SupplierActionSourceRow[] = []
  const disputes: SupplierActionSourceRow[] = []

  for (const row of source) {
    const sourceType = readString(row, 'sourceType')
    if (sourceType === 'recruitment' || sourceType === 'provider_recruitment' || sourceType === 'direct_recruitment_ledger' || readString(row, 'ledgerType') === 'direct_recruitment') {
      recruitment.push(row)
    } else if (sourceType === 'operator_evidence') {
      operatorEvidence.push(row)
    } else if (isDisputeLike(row)) {
      disputes.push(row)
    } else if (readString(row, 'eventType') === 'owner_interest_submitted') {
      funnelEvents.push(row)
    } else {
      claims.push(row)
    }
  }

  return { claims, funnelEvents, recruitment, operatorEvidence, disputes }
}

function actionFromClaimRow(
  row: SupplierActionSourceRow,
  sources: NormalizedSupplierActionSources,
  options: ReconstructSupplierActionsOptions,
): SupplierActionEvidence | undefined {
  const businessId = readString(row, 'businessId')
  const claimId = readString(row, 'claimId')
  const slug = readString(row, 'slug')
  const seenAt = readTimestamp(row)
  if (businessId === undefined || claimId === undefined || seenAt === undefined || !isWithinWindow(seenAt, options)) {
    return undefined
  }

  const status = readString(row, 'status')
  if (status !== 'authenticated' && status !== 'published') {
    return undefined
  }

  if (!hasRecruitmentOrOperatorEvidence(sources, providerMatch(businessId, claimId, slug))) {
    return undefined
  }

  return {
    type: 'listing_request',
    actionKey: `claim:${claimId}`,
    businessId,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    rowCount: 1,
    source: 'claim',
    claimId,
    ...(slug === undefined ? {} : { slug }),
  }
}

function actionFromFunnelRow(
  row: SupplierActionSourceRow,
  sources: NormalizedSupplierActionSources,
  options: ReconstructSupplierActionsOptions,
): SupplierActionEvidence | undefined {
  if (readString(row, 'eventType') !== 'owner_interest_submitted') {
    return undefined
  }

  const businessId = readString(row, 'businessId')
  const seenAt = readTimestamp(row)
  if (businessId === undefined || seenAt === undefined || !isWithinWindow(seenAt, options)) {
    return undefined
  }

  if (!hasRecruitmentOrOperatorEvidence(sources, { businessId })) {
    return undefined
  }

  const correlationId = readString(row, 'correlationId')
  const actionKey = `owner-interest:${businessId}:${correlationId ?? readString(row, 'pseudonymousSessionId') ?? seenAt}`

  return {
    type: 'owner_interest',
    actionKey,
    businessId,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    rowCount: 1,
    source: 'funnel_event',
    ...(correlationId === undefined ? {} : { correlationId }),
  }
}

function actionFromOperatorEvidenceRow(
  row: SupplierActionSourceRow,
  options: ReconstructSupplierActionsOptions,
): SupplierActionEvidence | undefined {
  if (!isAllowedOperatorEvidence(row) || isDisputeLike(row)) {
    return undefined
  }

  const businessId = readString(row, 'businessId')
  const seenAt = readTimestamp(row)
  if (businessId === undefined || seenAt === undefined || !isWithinWindow(seenAt, options)) {
    return undefined
  }


  const evidenceRef = readString(row, 'evidenceRef') ?? readString(row, 'operatorEvidenceRef')
  const claimId = readString(row, 'claimId')
  const slug = readString(row, 'slug')
  const correlationId = readString(row, 'correlationId')
  const actionKey = `operator-evidence:${businessId}:${evidenceRef ?? correlationId ?? seenAt}`

  return {
    type: 'operator_evidence',
    actionKey,
    businessId,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    rowCount: 1,
    source: 'operator_evidence',
    ...(claimId === undefined ? {} : { claimId }),
    ...(slug === undefined ? {} : { slug }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(evidenceRef === undefined ? {} : { evidenceRef }),
  }
}

function providerMatch(
  businessId: string,
  claimId: string | undefined,
  slug: string | undefined,
): { businessId: string; claimId?: string; slug?: string } {
  return {
    businessId,
    ...(claimId === undefined ? {} : { claimId }),
    ...(slug === undefined ? {} : { slug }),
  }
}

function hasRecruitmentOrOperatorEvidence(
  sources: NormalizedSupplierActionSources,
  match: { businessId: string; claimId?: string; slug?: string },
): boolean {
  return hasRecruitmentEvidence(sources.recruitment, match) || hasOperatorEvidence(sources.operatorEvidence, match)
}

function hasRecruitmentEvidence(
  rows: readonly SupplierActionSourceRow[],
  match: { businessId: string; claimId?: string; slug?: string },
): boolean {
  return rows.some((row) => rowMatchesProvider(row, match))
}

function hasOperatorEvidence(
  rows: readonly SupplierActionSourceRow[],
  match: { businessId: string; claimId?: string; slug?: string },
): boolean {
  return rows.some((row) => isAllowedOperatorEvidence(row) && !isDisputeLike(row) && rowMatchesProvider(row, match))
}

function hasExistingCorroboratedAction(
  actionsByKey: Map<string, SupplierActionEvidence>,
  operatorAction: SupplierActionEvidence,
): boolean {
  for (const action of actionsByKey.values()) {
    if (action.businessId !== operatorAction.businessId) {
      continue
    }
    if (operatorAction.claimId === undefined || action.claimId === operatorAction.claimId) {
      return true
    }
  }

  return false
}

function rowMatchesProvider(row: SupplierActionSourceRow, match: { businessId: string; claimId?: string; slug?: string }): boolean {
  const businessId = readString(row, 'businessId')
  if (businessId !== undefined) {
    return businessId === match.businessId
  }

  const claimId = readString(row, 'claimId')
  if (claimId !== undefined && match.claimId !== undefined) {
    return claimId === match.claimId
  }

  const slug = readString(row, 'slug')
  return slug !== undefined && match.slug !== undefined && slug === match.slug
}


function isAllowedOperatorEvidence(row: SupplierActionSourceRow): boolean {
  const evidenceType = readString(row, 'evidenceType')
  const kind = readString(row, 'kind')
  const actionType = readString(row, 'actionType')
  return (
    isAllowedOperatorEvidenceValue(evidenceType) ||
    isAllowedOperatorEvidenceValue(kind) ||
    isAllowedOperatorEvidenceValue(actionType)
  )
}

function isAllowedOperatorEvidenceValue(value: string | undefined): boolean {
  return (
    value === 'provider_correction' ||
    value === 'provider_maintenance' ||
    value === 'listing_request' ||
    value === 'listing_maintenance' ||
    value === 'owner_interest' ||
    value === 'supplier_action'
  )
}

function isDisputeLike(row: SupplierActionSourceRow): boolean {
  const eventType = readString(row, 'eventType')?.toLowerCase()
  const reasonCode = readString(row, 'reasonCode')?.toLowerCase()
  const targetRef = readString(row, 'targetRef')?.toLowerCase()
  const evidenceType = readString(row, 'evidenceType')?.toLowerCase()
  const kind = readString(row, 'kind')?.toLowerCase()
  const actionType = readString(row, 'actionType')?.toLowerCase()

  return (
    includesDisputeLanguage(eventType) ||
    includesDisputeLanguage(reasonCode) ||
    includesDisputeLanguage(targetRef) ||
    includesDisputeLanguage(evidenceType) ||
    includesDisputeLanguage(kind) ||
    includesDisputeLanguage(actionType)
  )
}

function includesDisputeLanguage(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }

  return value.includes('dispute') || value.includes('privacy') || value.includes('removal') || value.includes('remove-business')
}

function upsertAction(actionsByKey: Map<string, SupplierActionEvidence>, action: SupplierActionEvidence): void {
  const existing = actionsByKey.get(action.actionKey)
  if (existing === undefined) {
    actionsByKey.set(action.actionKey, action)
    return
  }

  existing.rowCount += action.rowCount
  existing.firstSeenAt = Math.min(existing.firstSeenAt, action.firstSeenAt)
  existing.lastSeenAt = Math.max(existing.lastSeenAt, action.lastSeenAt)
}

function readString(row: SupplierActionSourceRow, key: string): string | undefined {
  const value = row[key] ?? readPropertiesValue(row, key)
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function readTimestamp(row: SupplierActionSourceRow): number | undefined {
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
function isSourceRowArray(value: SupplierActionSources | readonly SupplierActionSourceRow[]): value is readonly SupplierActionSourceRow[] {
  return Array.isArray(value)
}


function readPropertiesValue(row: SupplierActionSourceRow, key: string): unknown {
  const properties = row.properties
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return undefined
  }

  const record = properties as Record<string, unknown>
  const value = record[key]
  if (value !== undefined) {
    return value
  }

  if (key === 'businessId') {
    return record.ae_business_id
  }
  if (key === 'correlationId') {
    return record.ae_correlation_id
  }
  if (key === 'eventType') {
    return record.ae_event_type
  }

  return undefined
}

function isWithinWindow(timestamp: number, options: ReconstructSupplierActionsOptions): boolean {
  if (options.windowStartMs !== undefined && timestamp < options.windowStartMs) {
    return false
  }
  if (options.windowEndMs !== undefined && timestamp > options.windowEndMs) {
    return false
  }
  return true
}
