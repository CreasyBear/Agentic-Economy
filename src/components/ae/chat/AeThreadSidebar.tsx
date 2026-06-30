import { useState } from 'react'
import { CopyIcon, EllipsisVerticalIcon, PlusIcon } from 'lucide-react'
import { copyThreadLink } from './copy-thread-link'

import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
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

export type AeThreadSidebarProps = {
  threads: readonly AnswerThreadRecord[]
  activeThreadId?: string | null
  visible: boolean
}

export function AeThreadSidebar({ threads, activeThreadId = null, visible }: AeThreadSidebarProps) {
  if (!visible || threads.length === 0) {
    return null
  }

  return (
    <aside className="ae-thread-sidebar" aria-label="Recent questions">
      <div className="ae-thread-sidebar__header">
        <Button asChild variant="outline" size="sm" className="ae-thread-sidebar__new">
          <a href="/">
            <PlusIcon data-icon="inline-start" />
            New question
          </a>
        </Button>
      </div>
      <ScrollArea className="ae-thread-sidebar__scroll">
        <ul className="ae-thread-sidebar__list">
          {threads.map((thread) => (
            <AeThreadSidebarRow
              key={thread.threadId}
              thread={thread}
              active={thread.threadId === activeThreadId}
            />
          ))}
        </ul>
      </ScrollArea>
    </aside>
  )
}

function AeThreadSidebarRow({ thread, active }: { thread: AnswerThreadRecord; active: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const href = `/t/${thread.threadId}`

  async function copyLink() {
    await copyThreadLink(thread.threadId)
    setMenuOpen(false)
  }

  return (
    <li className="ae-thread-sidebar__row">
      <a
        href={href}
        className={`ae-thread-sidebar__item${active ? ' ae-thread-sidebar__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="ae-thread-sidebar__title">{thread.title}</span>
        <ClientRelativeTime timestamp={thread.updatedAt} />
      </a>
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
            <a href={href}>Open thread</a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <CopyIcon data-icon="inline-start" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/">Start new question</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function ClientRelativeTime({ timestamp }: { timestamp: number }) {
  const mounted = useClientMounted()

  return (
    <time
      className="ae-thread-sidebar__time"
      dateTime={new Date(timestamp).toISOString()}
      suppressHydrationWarning
    >
      {mounted ? formatRelativeTime(timestamp) : '\u00a0'}
    </time>
  )
}

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
