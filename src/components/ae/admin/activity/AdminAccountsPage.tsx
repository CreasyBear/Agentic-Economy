import { ErrorBoundary } from '@sentry/react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../../convex/_generated/api'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { AdminSearchNotice } from '../AdminSearchNotice'

export function AdminAccountsPage({ search, rejected, onSearchChange }: Readonly<{ search: string; rejected?: string | undefined; onSearchChange: (search: string) => void }>) {
  return <AeOperatorPage operatorRole="admin" title="Accounts" description="Find an Account, follow its purchases and inspect its access and funding."
    currentPath="/admin/accounts" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Accounts' }]} stickyHeader>
    <AdminSearchNotice rejected={rejected} />
    <ErrorBoundary fallback={<AePageState title="Accounts unavailable" description="The source could not provide a verified read. Reload to try again." tone="danger" />}>
      <AccountsList key={search} search={search} onSearchChange={onSearchChange} />
    </ErrorBoundary>
  </AeOperatorPage>
}

function AccountsList({ search, onSearchChange }: Readonly<{ search: string; onSearchChange: (search: string) => void }>) {
  const [draft, setDraft] = useState(search)
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const result = usePaginatedQuery(api.adminConsoleActivity.listAccounts,
    access?.kind === 'allowed' ? { search } : 'skip', { initialNumItems: 25 })
  if (access?.kind === 'refused') return <AePageState title="Admin access required" description="Your current membership does not allow this read." tone="danger" />
  return <div className="grid gap-section pb-page">
    <form className="flex max-w-xl gap-related" onSubmit={event => { event.preventDefault(); onSearchChange(draft.trim()) }}>
      <Input aria-label="Account name" placeholder="Search by Account name" value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} />
      <Button type="submit">Search</Button>
      {search.length > 0 ? <Button type="button" variant="outline" onClick={() => onSearchChange('')}>Clear</Button> : null}
    </form>
    <p className="text-xs text-muted-foreground">Accounts are shared identities. Purchase history uses this deployment’s money environment. An Account count is not a Customer count.</p>
    {access === undefined || result.status === 'LoadingFirstPage' ? <Skeleton className="h-44 w-full" aria-label="Loading Accounts" />
      : result.results.length === 0 ? <AePageState title="No Accounts found" description={search.length > 0 ? 'Try another name or clear the search.' : 'No Accounts have been created.'} />
        : <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Status</TableHead><TableHead className="hidden sm:table-cell">Created</TableHead></TableRow></TableHeader>
          <TableBody>{result.results.map(account => <TableRow key={account.accountRef}>
            <TableCell><a className="font-medium underline-offset-4 hover:underline" href={`/admin/workspaces/${encodeURIComponent(account.accountRef)}`}>{account.displayName}</a>
              <p className="mt-1 max-w-72 truncate text-xs text-muted-foreground">{account.accountRef}</p></TableCell>
            <TableCell><Badge variant={account.lifecycle === 'suspended' ? 'warning' : 'outline'}>{account.lifecycle.replaceAll('_', ' ')}</Badge></TableCell>
            <TableCell className="hidden text-xs text-muted-foreground sm:table-cell"><time dateTime={new Date(account.createdAt).toISOString()}>{formatPerthTimestamp(account.createdAt)}</time></TableCell>
          </TableRow>)}</TableBody></Table>}
    {result.status === 'CanLoadMore' || result.status === 'LoadingMore' ? <Button className="justify-self-start" variant="outline" disabled={result.status === 'LoadingMore'} onClick={() => result.loadMore(25)}>
      {result.status === 'LoadingMore' ? 'Loading…' : 'Load more Accounts'}</Button> : null}
  </div>
}
