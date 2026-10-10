import { ErrorBoundary } from '@sentry/react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { SearchField } from '@/components/arc/search-field/search-field'
import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { AdminTrialAccess } from '../actions/AdminTrialAccess'

type AccountSearchProps = Readonly<{ search: string; onSearchChange: (search: string) => void }>

export function AdminAccountsPage({ search, rejected, onSearchChange }: AccountSearchProps & Readonly<{ rejected?: string | undefined }>) {
  return (
    <AeOperatorPage
      operatorRole="admin" title="Accounts"
      description="Find an Account, follow its purchases and inspect its access and funding."
      currentPath="/admin/accounts"
    >
      <AdminSearchNotice rejected={rejected} />
      <ErrorBoundary fallback={
        <div className="ae-arc"><Alert title="Accounts unavailable" tone="danger">The source could not provide a verified read. Reload this page to try again.</Alert></div>
      }>
        <AccountsList search={search} onSearchChange={onSearchChange} />
        <AdminTrialAccess />
      </ErrorBoundary>
    </AeOperatorPage>
  )
}

function AccountsList({ search, onSearchChange }: AccountSearchProps) {
  const [draft, setDraft] = useState(search)
  useEffect(() => setDraft(search), [search])
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const result = usePaginatedQuery(
    api.adminConsoleActivity.listAccounts,
    access?.kind === 'allowed' ? { search } : 'skip',
    { initialNumItems: 25 },
  )

  if (access?.kind === 'refused') {
    return <div className="ae-arc"><Alert title="Admin access required" tone="danger">Your current membership does not allow this read.</Alert></div>
  }

  const loading = access === undefined || result.status === 'LoadingFirstPage'
  return (
    <div className="grid gap-related pb-page">
      <form className="flex max-w-xl items-end gap-related" onSubmit={event => {
        event.preventDefault()
        onSearchChange(draft.trim())
      }}>
        <div className="ae-arc min-w-0 flex-1">
          <SearchField label="Account name" placeholder="Search Accounts" value={draft} maxLength={120} onValueChange={value => {
            setDraft(value)
            if (value === '' && search !== '') onSearchChange('')
          }} />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Accounts are shared identities, not a count of Customers. Purchase history follows this deployment’s money environment.
      </p>
      {loading ? (
        <Skeleton className="h-44 w-full" role="status" aria-label="Loading Accounts" />
      ) : result.results.length === 0 ? (
        <div className="ae-arc rounded-lg border border-border bg-card">
          <AeEmptyState
            title="No Accounts found"
            description={search.length > 0 ? 'Try another name or clear the search.' : 'Accounts will appear here when they are created.'}
            action={search.length > 0 ? <Button variant="secondary" onClick={() => onSearchChange('')}>Clear Account search</Button> : undefined}
          />
        </div>
      ) : (
        <div className="grid min-w-0 gap-related">
          <p className="text-xs text-muted-foreground">
            {result.results.length} loaded{result.status === 'Exhausted' ? '' : ' · more Accounts available'}. Sorting applies to loaded Accounts.
          </p>
          <div className="ae-arc min-w-0">
            <SortableDataTable
              rows={result.results}
              rowKey="accountRef"
              caption="Loaded Accounts"
              columns={[
                { key: 'displayName', label: 'Account', render: (_value, account) => (
                  <div className="min-w-0">
                    <a className="font-medium underline-offset-4 hover:underline" href={`/admin/workspaces/${encodeURIComponent(account.accountRef)}`}>
                      {account.displayName}
                    </a>
                    <p className="mt-1 max-w-72 truncate text-xs text-muted-foreground" title={account.accountRef}>{account.accountRef}</p>
                  </div>
                ) },
                { key: 'lifecycle', label: 'Status', render: (_value, account) => (
                  <AeStatusBadge status={account.lifecycle} density="cell" />
                ) },
                { key: 'createdAt', label: 'Created', numeric: false, render: (_value, account) => (
                  <RecordTime at={account.createdAt} />
                ) },
              ]}
            />
          </div>
        </div>
      )}
      {result.status === 'CanLoadMore' || result.status === 'LoadingMore' ? (
        <Button className="justify-self-start" variant="secondary" disabled={result.status === 'LoadingMore'} onClick={() => result.loadMore(25)}>
          {result.status === 'LoadingMore' ? 'Loading…' : 'Load more Accounts'}
        </Button>
      ) : null}
    </div>
  )
}
