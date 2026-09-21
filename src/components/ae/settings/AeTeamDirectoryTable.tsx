import { CheckIcon, CopyIcon } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'

import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import {
  matchesRole,
  matchesSearch,
  roleCounts,
  toDirectoryRows,
  type DirectoryRow,
  type TeamDirectoryData,
  type TeamDirectoryRoleFilter,
} from '@/modules/principal-account/team.view-model'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type AeTeamDirectoryTableProps = Readonly<{
  directory?: TeamDirectoryData
  loading?: boolean
}>

const TABLE_HEADER_CLASS =
  'px-4 py-3 font-sans text-xs font-medium normal-case tracking-wider'

const TABLE_HEADERS = (
  <TableHeader className="border-b bg-muted/50 text-muted-foreground">
    <TableRow className="hover:bg-transparent">
      <TableHead scope="col" className={TABLE_HEADER_CLASS}>Name</TableHead>
      <TableHead scope="col" className={TABLE_HEADER_CLASS}>Email</TableHead>
      <TableHead scope="col" className={TABLE_HEADER_CLASS}>Role</TableHead>
      <TableHead scope="col" className={TABLE_HEADER_CLASS}>Status</TableHead>
      <TableHead scope="col" className={TABLE_HEADER_CLASS}>Joined</TableHead>
    </TableRow>
  </TableHeader>
)

function DirectoryEmailCell({ email }: Readonly<{ email: string | null }>): ReactElement {
  const { isCopied, copy } = useClipboardCopy(email ?? '', { timeout: 2_000 })

  if (email === null) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <code dir="ltr" className="min-w-0 break-all font-mono text-xs text-muted-foreground">{email}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn('shrink-0', TACTILE)}
        aria-label={isCopied ? 'Email copied' : 'Copy email'}
        onClick={() => {
          void copy().then(() => {
            toast.success('Copied email to clipboard')
          }).catch(() => {
            toast.error('Failed to copy email')
          })
        }}
      >
        {isCopied
          ? <CheckIcon aria-hidden="true" className="size-4" />
          : <CopyIcon aria-hidden="true" className="size-4" />}
      </Button>
    </span>
  )
}

export function AeTeamDirectoryTable({ directory, loading }: AeTeamDirectoryTableProps): ReactElement {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<TeamDirectoryRoleFilter>('all')

  const isLoading = directory === undefined || loading === true

  const allRows: DirectoryRow[] = useMemo(() => {
    if (directory === undefined) return []
    return toDirectoryRows(directory)
  }, [directory])

  const counts = roleCounts(directory)
  const normalizedFilter = searchTerm.trim().toLowerCase()

  const filteredRows = isLoading
    ? []
    : allRows.filter((row) => matchesRole(row, roleFilter) && matchesSearch(row, normalizedFilter))

  const filtersActive = normalizedFilter.length > 0 || roleFilter !== 'all'
  const showFilterEmpty = !isLoading && directory !== undefined && filteredRows.length === 0 && filtersActive
  const showMemberEmptyState = !isLoading
    && directory !== undefined
    && directory.members.length === 0
    && !showFilterEmpty
    && filteredRows.length > 0

  const resetFilters = () => {
    setSearchTerm('')
    setRoleFilter('all')
  }

  const roleChips: ReadonlyArray<{ id: TeamDirectoryRoleFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'owner', label: 'Owner', count: counts.owner },
    { id: 'admin', label: 'Admin', count: counts.admin },
    { id: 'member', label: 'Member', count: counts.member },
  ]

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-h-[3rem] min-w-0 flex-wrap items-center gap-3">
        <label className="relative min-w-[12rem] flex-1 max-w-sm">
          <span className="sr-only">Filter team members</span>
          <input
            type="search"
            role="searchbox"
            placeholder="Filter by name or email…"
            value={searchTerm}
            disabled={isLoading}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Filter by role">
          {roleChips.map((chip) => {
            const pressed = roleFilter === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={pressed}
                disabled={isLoading}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium font-mono tabular-nums',
                  pressed ? 'border-foreground bg-muted text-foreground' : 'border-border bg-container text-muted-foreground',
                  isLoading && 'opacity-50',
                  TACTILE,
                )}
                onClick={() => setRoleFilter(chip.id)}
              >
                {chip.label} ({chip.count})
              </button>
            )
          })}
        </div>
      </div>

      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        Showing {filteredRows.length} of {counts.all}
      </p>

      {isLoading ? (
        <div
          className="min-h-[18rem] min-w-0 overflow-hidden rounded-md border"
          role="status"
          aria-busy="true"
          aria-label="Loading team directory"
        >
          <Table aria-label="Team directory" className="text-left text-sm">
            {TABLE_HEADERS}
            <TableBody className="divide-y divide-border">
              {Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4 py-3"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-4 w-28" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="min-h-[18rem] min-w-0 overflow-hidden rounded-md border">
          <Table aria-label="Team directory" className="text-left text-sm">
            {TABLE_HEADERS}
            <TableBody className="divide-y divide-border">
              {showFilterEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground">No members match these filters</p>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted',
                          TACTILE,
                        )}
                        onClick={resetFilters}
                      >
                        Reset filters
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredRows.map((row) => (
                    <TableRow key={row.kind === 'owner' ? row.ownershipRef : row.membershipRef}>
                      <TableCell className="px-4 py-3 font-medium text-foreground">{row.displayName}</TableCell>
                      <TableCell className="px-4 py-3">
                        <DirectoryEmailCell email={row.email} />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                          {row.roleLabel}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
                          {row.statusLabel}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
                        {`${formatUtcTimestamp(row.joinedAt)} UTC`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {showMemberEmptyState && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="p-0">
                        <AeTableEmptyState
                          title="No other members in this workspace"
                          description="Invite collaborators or administrators to access workspace resources."
                          action={(
                            <a
                              href="#invite"
                              className={cn(
                                'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                TACTILE,
                              )}
                            >
                              + Invite Member
                            </a>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="min-h-[2.5rem]" data-slot="team-directory-diagnostic" />
    </div>
  )
}
