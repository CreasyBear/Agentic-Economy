import { useId, useMemo, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { ChevronDownIcon, CopyIcon, EllipsisVerticalIcon, Link2OffIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { announceShareFailure, copyAnswerThreadShareLink, revokeAnswerThreadShare } from './copy-thread-link'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import { toast } from '@/lib/ui/toast'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { formatRelativeTime, timestampIso } from '@/lib/ui/format-time'
import { cn } from '@/lib/utils'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { useAnswerModel } from './AeAnswerModelContext'

export type AeThreadSidebarProps = {
  threads: readonly AnswerThreadRecord[]
  activeThreadId?: string | null
  visible: boolean
  layout?: 'desktop' | 'mobile'
  onDelete?: (threadId: string) => void
  onNavigate?: () => void
  onNewQuestion?: () => void
}

export function AeThreadSidebar({
  threads,
  activeThreadId = null,
  visible,
  layout = 'desktop',
  onDelete,
  onNavigate,
  onNewQuestion,
}: AeThreadSidebarProps) {
  if (!visible) {
    return null
  }

  const sidebarClassName =
    layout === 'desktop'
      ? 'hidden h-full min-h-0 flex-col gap-2 overflow-hidden border-r border-border bg-background px-1 py-2 lg:flex'
      : 'flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-background px-1 py-2'

  return (
    <aside id={layout === 'desktop' ? 'ae-thread-sidebar' : 'ae-thread-mobile-sidebar-content'} className={sidebarClassName} aria-label="Recent searches">
      <div className="flex flex-col gap-2 p-1">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-medium uppercase leading-tight tracking-wider text-muted-foreground">Recent searches</span>
          <span className="inline-grid min-h-6 min-w-6 place-items-center rounded-sm border border-border bg-card font-mono text-xs leading-none tabular-nums text-muted-foreground" data-numeric>{threads.length}</span>
        </div>
        <Button variant="secondary" size="sm" className="min-h-11 w-full" onClick={onNewQuestion} data-ae-sidebar-primary>
          <PlusIcon aria-hidden="true" />
          New search
        </Button>
      </div>
      {isStructuredAnswerModeEnabled() ? (
        <div className="border-b border-border px-1 pb-3">
          <AnswerModelSelector />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">
        {threads.length === 0 ? (
          <p className="m-1 p-3 text-sm leading-snug text-muted-foreground">No searches yet. Start a new search to see it here.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {threads.map((thread) => (
              <AeThreadSidebarRow
                key={thread.threadId}
                thread={thread}
                active={thread.threadId === activeThreadId}
                layout={layout}
                onDelete={onDelete}
                onNavigate={onNavigate}
                onNewQuestion={onNewQuestion}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function AnswerModelSelector() {
  const listboxId = useId()
  const { enabled, loading, modelsByProvider, selectedModel, selectedModelId, setSelectedModelId } =
    useAnswerModel()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const providerEntries = useMemo(
    () =>
      Object.entries(modelsByProvider).sort(([providerA], [providerB]) => providerA.localeCompare(providerB)),
    [modelsByProvider],
  )

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2" aria-hidden="true">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Model</span>
        <span className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 text-xs text-muted-foreground opacity-70">
          Loading…
        </span>
      </div>
    )
  }

  if (!enabled || selectedModel === null) {
    return null
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground" id={`${listboxId}-label`}>
        Model
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-9 max-sm:min-h-9 gap-1.5 border border-border-strong bg-card px-3 py-0 text-xs text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Choose answer model"
            aria-labelledby={`${listboxId}-label`}
          >
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted font-mono text-xs font-semibold uppercase text-muted-foreground" aria-hidden="true">
              {selectedModel.provider.slice(0, 1)}
            </span>
            <span className="max-w-44 truncate">{selectedModel.name}</span>
            <ChevronDownIcon aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </Button>
        </DialogTrigger>
        <DialogContent
          id={`${listboxId}-menu`}
          aria-describedby={undefined}
          aria-label="Choose answer model"
          className={cn(
            'outline! border-none! p-0 outline-border! outline-solid!',
            'w-[18.75rem] max-w-[calc(100vw-2rem)] p-2',
          )}
        >
          <DialogTitle className="sr-only">Model Selector</DialogTitle>
          <Command className="**:data-[slot=command-input-wrapper]:h-auto">
            <CommandInput
              className="h-auto py-3.5"
              aria-controls={`${listboxId}-options`}
              onValueChange={setQuery}
              placeholder="Search models…"
              value={query}
            />
            <CommandList id={`${listboxId}-options`} className="max-h-56 gap-1 overflow-auto">
              <CommandEmpty>No model found.</CommandEmpty>
              {providerEntries.map(([provider, models]) => (
                <CommandGroup key={provider} heading={provider}>
                  {models.map((model) => {
                    const isSelected = model.id === selectedModelId
                    return (
                      <CommandItem
                        key={model.id}
                        value={`${provider} ${model.name} ${model.id}`}
                        keywords={[provider, model.name, model.id]}
                        aria-selected={isSelected}
                        data-selected={isSelected ? 'true' : undefined}
                        data-current={isSelected ? 'true' : undefined}
                        className="min-h-9 text-foreground data-[current=true]:bg-muted data-[current=true]:font-medium"
                        onSelect={() => {
                          setSelectedModelId(model.id)
                          setOpen(false)
                          setQuery('')
                        }}
                      >
                        <span className="truncate">{model.name}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AeThreadSidebarRow({
  thread,
  active,
  layout,
  onDelete,
  onNavigate,
  onNewQuestion,
}: {
  thread: AnswerThreadRecord
  active: boolean
  layout: 'desktop' | 'mobile'
  onDelete: ((threadId: string) => void) | undefined
  onNavigate: (() => void) | undefined
  onNewQuestion: (() => void) | undefined
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState<'copy' | 'revoke' | null>(null)
  const [shareRevoked, setShareRevoked] = useState(false)
  const displayTitle = neutralizeBidiFormattingControls(thread.title)

  async function copyShareLink() {
    if (shareBusy !== null) return
    setShareBusy('copy')
    const result = await copyAnswerThreadShareLink(thread.threadId)
    if (result.kind === 'copied') setShareRevoked(false)
    setShareBusy(null)
    setMenuOpen(false)
  }

  async function revokeShareLink() {
    if (shareBusy !== null) return
    setShareBusy('revoke')
    const result = await revokeAnswerThreadShare(thread.threadId)
    if (result.kind === 'revoked') {
      setShareRevoked(true)
      toast.success('Share link revoked.')
    } else if (result.kind === 'already_revoked') {
      setShareRevoked(true)
      toast.info('Share link already revoked.')
    } else {
      announceShareFailure(result, 'revoke')
    }
    setShareBusy(null)
    setMenuOpen(false)
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (onDelete === undefined) {
      return
    }
    try {
      const response = await fetch(`/api/answer/threads/${encodeURIComponent(thread.threadId)}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        onDelete(thread.threadId)
      }
    } catch {
      // best-effort: keep the row if the delete request fails
    }
  }

  return (
    <li
      className={cn(
        'group/row grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md border transition-colors',
        active ? 'border-border bg-accent' : 'border-transparent hover:border-border hover:bg-muted',
      )}
    >
      <AlertDialog>
      <Link
        to="/t/$threadId"
        params={{ threadId: thread.threadId }}
        className="flex min-h-[2.875rem] min-w-0 flex-col gap-1 rounded-md px-3 py-2 no-underline"
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="truncate text-sm leading-snug text-foreground">{displayTitle}</span>
        <ClientRelativeTime timestamp={thread.updatedAt} />
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${displayTitle}`}
            className={cn(
              'min-h-11 min-w-11 self-center transition-opacity hover:text-foreground',
              'text-muted-foreground',
              layout === 'mobile'
                ? 'opacity-100'
                : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100',
            )}
          >
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => {
              void router.navigate({ to: '/t/$threadId', params: { threadId: thread.threadId } })
              setMenuOpen(false)
              onNavigate?.()
            }}
          >
            Open search
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyShareLink()} disabled={shareBusy !== null}>
            <CopyIcon aria-hidden="true" />
            {shareBusy === 'copy' ? 'Preparing share link…' : 'Copy share link'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void revokeShareLink()} disabled={shareBusy !== null || shareRevoked}>
            <Link2OffIcon aria-hidden="true" />
            {shareBusy === 'revoke' ? 'Revoking share link…' : shareRevoked ? 'Share link revoked' : 'Revoke share link'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false)
              onNewQuestion?.()
              onNavigate?.()
            }}
          >
            New search
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem>
              <TrashIcon aria-hidden="true" />
              Delete search
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this search?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the search and stops its share links from working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              Delete search
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function ClientRelativeTime({ timestamp }: { timestamp: number }) {
  const mounted = useClientMounted()
  return (
    <time className="font-mono text-xs tabular-nums text-muted-foreground" data-numeric dateTime={timestampIso(timestamp)}>
      {mounted ? formatRelativeTime(timestamp) : ''}
    </time>
  )
}
