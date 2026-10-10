import type { AdminAuditRow } from '@/lib/operator/admin-console/audit.contracts'
import { formatDate, formatDateInputValue, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import {
  AUDIT_COPY,
  type AdminAuditFilterChip,
  type AdminAuditFilterDraft,
  type AdminAuditFilterKey,
  type AdminAuditRowModel,
  type AdminAuditSearch,
} from './audit.contracts'

const PERTH_DAY_MS = 24 * 60 * 60 * 1_000

export function toAuditRowModel(row: AdminAuditRow): AdminAuditRowModel {
  const targetLabel = row.targetType === null || row.targetRef === null
    ? AUDIT_COPY.unavailable
    : `${row.targetType}: ${row.targetRef}`
  return {
    id: row.id,
    createdAtLabel: formatTimestamp(row.createdAt, 'Australia/Perth'),
    createdAtIso: timestampIso(row.createdAt),
    eventType: row.eventType,
    actorRef: row.actorRef ?? AUDIT_COPY.unavailable,
    targetLabel,
    targetHref: row.targetType === null || row.targetRef === null
      ? null
      : auditTargetHref(row.targetType, row.targetRef),
    targetRef: row.targetRef,
    targetType: row.targetType,
    outcomeRaw: row.outcome,
    correlationId: row.correlationId ?? AUDIT_COPY.unavailable,
    admin: row.admin,
  }
}


function auditTargetHref(targetType: string, targetRef: string): string | null {
  const ref = encodeURIComponent(targetRef)
  switch (targetType) {
    case 'call': return `/admin/calls/${ref}`
    case 'quote': return `/admin/quotes/${ref}`
    case 'tool': return `/admin/tools/${ref}`
    case 'workspace': return `/admin/workspaces/${ref}`
    case 'agent': return `/admin/agents/${ref}`
    case 'business': return `/admin/providers/${ref}`
    default: return null
  }
}

export function searchToDraft(search: AdminAuditSearch): AdminAuditFilterDraft {
  return {
    eventType: search.eventType ?? '',
    actorRef: search.actorRef ?? '',
    targetType: search.targetType ?? '',
    targetRef: search.targetRef ?? '',
    correlationId: search.correlationId ?? '',
    from: search.from === undefined ? '' : timestampToPerthDate(search.from),
    to: search.to === undefined ? '' : timestampToPerthDate(search.to - 1),
  }
}

export function draftToSearch(draft: AdminAuditFilterDraft): AdminAuditSearch {
  const from = perthDayStart(draft.from)
  const toStart = perthDayStart(draft.to)
  return {
    ...(draft.eventType === '' ? {} : { eventType: draft.eventType }),
    ...(draft.actorRef.trim() === '' ? {} : { actorRef: draft.actorRef.trim() }),
    ...(draft.targetType.trim() === '' ? {} : { targetType: draft.targetType.trim() }),
    ...(draft.targetRef.trim() === '' ? {} : { targetRef: draft.targetRef.trim() }),
    ...(draft.correlationId.trim() === '' ? {} : { correlationId: draft.correlationId.trim() }),
    ...(from === null ? {} : { from }),
    ...(toStart === null ? {} : { to: toStart + PERTH_DAY_MS }),
  }
}

export function filterChips(search: AdminAuditSearch): readonly AdminAuditFilterChip[] {
  const chips: AdminAuditFilterChip[] = []
  if (search.eventType !== undefined) chips.push({ key: 'eventType', label: AUDIT_COPY.filterLabels.eventType, value: search.eventType })
  if (search.actorRef !== undefined) chips.push({ key: 'actorRef', label: AUDIT_COPY.filterLabels.actorRef, value: search.actorRef })
  if (search.targetType !== undefined || search.targetRef !== undefined) {
    chips.push({ key: 'targetRef', label: AUDIT_COPY.filterLabels.targetRef, value: [search.targetType, search.targetRef].filter(Boolean).join(': ') })
  }
  if (search.correlationId !== undefined) chips.push({ key: 'correlationId', label: AUDIT_COPY.filterLabels.correlationId, value: search.correlationId })
  if (search.from !== undefined) chips.push({ key: 'from', label: AUDIT_COPY.filterLabels.from, value: formatDate(search.from, 'Australia/Perth') })
  if (search.to !== undefined) chips.push({ key: 'to', label: AUDIT_COPY.filterLabels.to, value: formatDate(search.to - 1, 'Australia/Perth') })
  return chips
}

export function withoutFilter(search: AdminAuditSearch, key: AdminAuditFilterKey): AdminAuditSearch {
  if (key === 'targetType' || key === 'targetRef') {
    const { targetType: _targetType, targetRef: _targetRef, ...remaining } = search
    return remaining
  }
  const remaining = { ...search }
  delete remaining[key]
  return remaining
}

export function hasFilters(search: AdminAuditSearch): boolean {
  return search.eventType !== undefined
    || search.actorRef !== undefined
    || search.targetType !== undefined
    || search.targetRef !== undefined
    || search.correlationId !== undefined
    || search.from !== undefined
    || search.to !== undefined
}

function perthDayStart(value: string): number | null {
  if (value === '') return null
  const timestamp = Date.parse(`${value}T00:00:00+08:00`)
  return Number.isFinite(timestamp) ? timestamp : null
}

function timestampToPerthDate(timestamp: number): string {
  return formatDateInputValue(timestamp, 'Australia/Perth')
}
