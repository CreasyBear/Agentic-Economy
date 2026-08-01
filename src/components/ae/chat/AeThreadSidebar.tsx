import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { ChevronDownIcon, CopyIcon, EllipsisVerticalIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { copyThreadLink } from './copy-thread-link'

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import { Button } from '@/components/ui/button'
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
}

export function AeThreadSidebar({
  threads,
  activeThreadId = null,
  visible,
  layout = 'desktop',
  onDelete,
  onNavigate,
}: AeThreadSidebarProps) {
  if (!visible) {
    return null
  }

  const sidebarClassName =
    layout === 'desktop'
      ? 'hidden h-full min-h-0 flex-col gap-3 overflow-hidden border-r border-border bg-muted px-1 py-2 lg:flex'
      : 'flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-background px-1 py-2'

  return (
    <aside id={layout === 'desktop' ? 'ae-thread-sidebar' : 'ae-thread-mobile-sidebar-content'} className={sidebarClassName} aria-label="Recent questions">
      <div className="flex flex-col gap-3 p-1">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-medium uppercase leading-tight text-muted-foreground">Recent questions</span>
          <span className="inline-grid min-h-6 min-w-6 place-items-center rounded-sm border border-border bg-card font-mono text-xs leading-none tabular-nums text-muted-foreground" data-numeric>{threads.length}</span>
        </div>
        <Button asChild variant="secondary" size="sm" className="min-h-11 w-full">
          <Link to="/" {...(onNavigate === undefined ? {} : { onClick: onNavigate })}>
            <PlusIcon aria-hidden="true" />
            New question
          </Link>
        </Button>
      </div>
      {isStructuredAnswerModeEnabled() ? (
        <div className="border-b border-border px-1 pb-3">
          <AnswerModelSelector />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">
        {threads.length === 0 ? (
          <p className="m-1 rounded-lg border border-dashed border-border p-3 text-sm leading-snug text-muted-foreground">No recent questions yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {threads.map((thread) => (
              <AeThreadSidebarRow
                key={thread.threadId}
                thread={thread}
                active={thread.threadId === activeThreadId}
                onDelete={onDelete}
                onNavigate={onNavigate}
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

  useEffect(() => {
    if (!open) {
      return
    }

    document.querySelector<HTMLInputElement>(`[data-model-selector-input="${listboxId}"]`)?.focus()
  }, [listboxId, open])

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
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Choose answer model"
            aria-labelledby={`${listboxId}-label`}
            aria-controls={`${listboxId}-menu`}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted font-mono text-2xs font-semibold uppercase text-muted-foreground" aria-hidden="true">
              {selectedModel.provider.slice(0, 1)}
            </span>
            <span className="max-w-44 truncate">{selectedModel.name}</span>
            <ChevronDownIcon aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </button>
        </ModelSelectorTrigger>
        <ModelSelectorContent
          id={`${listboxId}-menu`}
          aria-label="Choose answer model"
          className="w-[18.75rem] max-w-[calc(100vw-2rem)] p-2"
        >
          <ModelSelectorInput
            data-model-selector-input={listboxId}
            aria-controls={`${listboxId}-options`}
            onValueChange={setQuery}
            placeholder="Search models…"
            value={query}
          />
          <ModelSelectorList id={`${listboxId}-options`} className="max-h-56 gap-1 overflow-auto">
            <ModelSelectorEmpty>No model found.</ModelSelectorEmpty>
            {providerEntries.map(([provider, models]) => (
              <ModelSelectorGroup key={provider} heading={provider}>
                {models.map((model) => {
                  const isSelected = model.id === selectedModelId
                  return (
                    <ModelSelectorItem
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
                    </ModelSelectorItem>
                  )
                })}
              </ModelSelectorGroup>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </div>
  )
}

function AeThreadSidebarRow({
  thread,
  active,
  onDelete,
  onNavigate,
}: {
  thread: AnswerThreadRecord
  active: boolean
  onDelete: ((threadId: string) => void) | undefined
  onNavigate: (() => void) | undefined
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function copyLink() {
    await copyThreadLink(thread.threadId)
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
    <li className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-stretch">
      <Link
        to="/t/$threadId"
        params={{ threadId: thread.threadId }}
        className={cn('flex min-h-[2.875rem] flex-col gap-1 rounded-lg border px-3 py-2 no-underline transition-colors hover:bg-card', active ? 'border-border-strong bg-card' : 'border-transparent hover:border-border-strong')}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="truncate text-sm leading-snug text-foreground">{thread.title}</span>
        <ClientRelativeTime timestamp={thread.updatedAt} />
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${thread.title}`}
            className="min-h-11 min-w-11 self-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100 group-focus-within/row:opacity-100"
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
            Open thread
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <CopyIcon aria-hidden="true" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void router.navigate({ to: '/' })
              setMenuOpen(false)
              onNavigate?.()
            }}
          >
            Start new question
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleDelete()}>
            <TrashIcon aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
