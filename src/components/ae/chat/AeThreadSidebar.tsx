import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CopyIcon, EllipsisVerticalIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { copyThreadLink } from './copy-thread-link'

import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import { defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { AeModelSelector } from './AeModelSelector'

export type AeThreadSidebarProps = {
  threads: readonly AnswerThreadRecord[]
  activeThreadId?: string | null
  visible: boolean
  onDelete?: (threadId: string) => void
}

export function AeThreadSidebar({ threads, activeThreadId = null, visible, onDelete }: AeThreadSidebarProps) {
  if (!visible) {
    return null
  }

  return (
    <aside id="ae-thread-sidebar" className="ae-thread-sidebar" aria-label="Recent questions">
      <div className="ae-thread-sidebar__header">
        <div className="ae-thread-sidebar__heading-row">
          <h2 className="ae-thread-sidebar__heading">Recent questions</h2>
          <span className="ae-thread-sidebar__count" data-numeric>{threads.length}</span>
        </div>
        <Button asChild variant="outline" size="sm" className="ae-thread-sidebar__new">
          <Link to="/" search={defaultHomeSearch}>
            <PlusIcon data-icon="inline-start" />
            New question
          </Link>
        </Button>
      </div>
      {isStructuredAnswerModeEnabled() ? (
        <div className="ae-thread-sidebar__model">
          <AeModelSelector />
        </div>
      ) : null}
      <ScrollArea className="ae-thread-sidebar__scroll">
        {threads.length === 0 ? (
          <p className="ae-thread-sidebar__empty">No recent questions yet.</p>
        ) : (
          <ul className="ae-thread-sidebar__list">
            {threads.map((thread) => (
              <AeThreadSidebarRow
                key={thread.threadId}
                thread={thread}
                active={thread.threadId === activeThreadId}
                {...(onDelete === undefined ? {} : { onDelete })}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}

function AeThreadSidebarRow({
  thread,
  active,
  onDelete,
}: {
  thread: AnswerThreadRecord
  active: boolean
  onDelete?: (threadId: string) => void
}) {
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
    <li className="ae-thread-sidebar__row">
      <Link
        to="/t/$threadId"
        params={{ threadId: thread.threadId }}
        className={`ae-thread-sidebar__item${active ? ' ae-thread-sidebar__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="ae-thread-sidebar__title">{thread.title}</span>
        <ClientRelativeTime timestamp={thread.updatedAt} />
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ae-thread-sidebar__menu"
            aria-label={`Actions for ${thread.title}`}
          >
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ae-thread-sidebar__menu-panel">
          <DropdownMenuItem asChild>
            <Link to="/t/$threadId" params={{ threadId: thread.threadId }}>Open thread</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <CopyIcon data-icon="inline-start" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/" search={defaultHomeSearch}>Start new question</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="ae-thread-sidebar__delete-action" onSelect={() => void handleDelete()}>
            <TrashIcon data-icon="inline-start" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function ClientRelativeTime({ timestamp }: { timestamp: number }) {
  const mounted = useClientMounted()
  return <time className="ae-thread-sidebar__time">{mounted ? formatRelativeTime(timestamp) : ''}</time>
}

function formatRelativeTime(timestamp: number): string {
  const diffSeconds = Math.round((Date.now() - timestamp) / 1000)
  if (diffSeconds < 60) {
    return 'just now'
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m ago`
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h ago`
  }
  return `${Math.floor(diffSeconds / 86400)}d ago`
}
