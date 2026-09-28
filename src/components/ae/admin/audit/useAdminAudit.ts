import { useEffect, useState } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import {
  draftToSearch,
  filterChips,
  hasFilters,
  searchToDraft,
  toAuditRowModel,
  withoutFilter,
} from './audit.view-model'
import {
  auditSearchToFilter,
  type AdminAuditDataState,
  type AdminAuditFilterDraft,
  type AdminAuditFilterKey,
  type AdminAuditPageProps,
} from './audit.contracts'

export function useAdminAudit({ search, onSearchChange }: AdminAuditPageProps) {
  const [draft, setDraft] = useState<AdminAuditFilterDraft>(() => searchToDraft(search))
  useEffect(() => setDraft(searchToDraft(search)), [search])

  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const allowed = access?.kind === 'allowed'
  const [approvalRefresh, setApprovalRefresh] = useState({ at: 0, initialNumItems: 50 })
  const [now, setNow] = useState<number | null>(null)
  const pagination = usePaginatedQuery(
    api.adminConsoleAudit.listAdminAuditEvents,
    allowed ? { filter: auditSearchToFilter(search) } : 'skip',
    { initialNumItems: 50 },
  )
  const proposals = usePaginatedQuery(
    api.adminConsoleAudit.listAdminApprovalProposals,
    allowed ? { refreshAt: approvalRefresh.at } : 'skip',
    { initialNumItems: approvalRefresh.initialNumItems },
  )
  useEffect(() => {
    if (!allowed) return
    const currentNow = Date.now()
    setNow(currentNow)
    let nextExpiry = Infinity
    for (const proposal of proposals.results) {
      if (proposal.expiresAt > currentNow && proposal.expiresAt < nextExpiry) nextExpiry = proposal.expiresAt
    }
    if (nextExpiry === Infinity) return
    const timer = window.setTimeout(() => {
      const expiredAt = Date.now()
      setNow(expiredAt)
      setApprovalRefresh((current) => ({
        at: Math.max(expiredAt, current.at + 1),
        initialNumItems: Math.max(current.initialNumItems, proposals.results.length),
      }))
    }, Math.max(0, nextExpiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [allowed, proposals.results, approvalRefresh.at])

  const data: AdminAuditDataState = access === undefined
    ? { kind: 'loading' }
    : access.kind === 'refused'
      ? { kind: 'refused' }
      : now === null || pagination.status === 'LoadingFirstPage' || proposals.status === 'LoadingFirstPage'
        ? { kind: 'loading' }
        : {
            kind: 'ready',
            role: access.role,
            actorRef: access.actorRef,
            now,
            events: pagination.results.map(toAuditRowModel),
            proposals: proposals.results.filter((row) => row.expiresAt > now),
            approvalPaginationStatus: proposals.status,
            loadMoreApprovals: () => proposals.loadMore(50),
            paginationStatus: pagination.status,
            loadMore: () => pagination.loadMore(50),
          }

  return {
    data,
    draft,
    chips: filterChips(search),
    filtered: hasFilters(search),
    onDraftChange: (field: keyof AdminAuditFilterDraft, value: string) => {
      setDraft((current) => ({ ...current, [field]: value }))
    },
    onApply: () => onSearchChange(draftToSearch(draft)),
    onRemove: (key: AdminAuditFilterKey) => onSearchChange(withoutFilter(search, key)),
    onClear: () => onSearchChange({}),
  }
}
