import { useEffect, useState } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import {
  draftToSearch,
  filterChips,
  hasFilters,
  searchToDraft,
  toApprovalRowModel,
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
  const pagination = usePaginatedQuery(
    api.adminConsoleAudit.listAdminAuditEvents,
    allowed ? { filter: auditSearchToFilter(search) } : 'skip',
    { initialNumItems: 50 },
  )
  const proposals = useQuery(
    api.adminConsoleAudit.listAdminApprovalProposals,
    allowed ? {} : 'skip',
  )

  const data: AdminAuditDataState = access === undefined
    ? { kind: 'loading' }
    : access.kind === 'refused'
      ? { kind: 'refused' }
      : proposals === undefined || pagination.status === 'LoadingFirstPage'
        ? { kind: 'loading' }
        : !Array.isArray(proposals)
          ? { kind: 'refused' }
          : {
              kind: 'ready',
              events: pagination.results.map(toAuditRowModel),
              proposals: proposals.map(toApprovalRowModel),
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
