import { useState } from 'react'
import { createLink, Link, useRouter } from '@tanstack/react-router'
import { CopyIcon, EllipsisVerticalIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { copyThreadLink } from './copy-thread-link'

import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { formatRelativeTime, timestampIso } from '@/lib/ui/format-time'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { AeModelSelector } from './AeModelSelector'
const RouterButton = createLink(Button)


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
      : 'flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-body px-1 py-2'

  return (
    <aside id={layout === 'desktop' ? 'ae-thread-sidebar' : 'ae-thread-mobile-sidebar-content'} className={sidebarClassName} aria-label="Recent questions">
      <div className="flex flex-col gap-3 p-1">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <h2 className="truncate font-mono text-xs font-medium uppercase leading-tight text-secondary">Recent questions</h2>
          <span className="inline-grid min-h-6 min-w-6 place-items-center rounded-sm border border-border bg-surface font-mono text-xs leading-none tabular-nums text-secondary" data-numeric>{threads.length}</span>
        </div>
        <RouterButton
          label="New question"
          to="/"
          variant="secondary"
          size="sm"
          className="min-h-11 w-full"
          icon={<PlusIcon aria-hidden="true" />}
          {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
        />
      </div>
      {isStructuredAnswerModeEnabled() ? (
        <div className="border-b border-border px-1 pb-3">
          <AeModelSelector />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">
        {threads.length === 0 ? (
          <p className="m-1 rounded-lg border border-dashed border-border p-3 text-sm leading-snug text-secondary">No recent questions yet.</p>
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
        className={`flex min-h-[2.875rem] flex-col gap-1 rounded-lg border px-3 py-2 no-underline transition-colors hover:bg-surface${active ? ' border-border-strong bg-surface' : ' border-transparent hover:border-border-strong'}`}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="truncate text-sm leading-snug text-primary">{thread.title}</span>
        <ClientRelativeTime timestamp={thread.updatedAt} />
      </Link>
      <DropdownMenu
        isMenuOpen={menuOpen}
        onOpenChange={setMenuOpen}
        hasChevron={false}
        menuWidth="12rem"
        button={{
          label: `Actions for ${thread.title}`,
          type: 'button',
          variant: 'ghost',
          size: 'sm',
          isIconOnly: true,
          className: 'self-center text-secondary opacity-0 transition-opacity hover:text-primary group-hover/row:opacity-100 group-focus-within/row:opacity-100',
          icon: <EllipsisVerticalIcon aria-hidden="true" />,
        }}
        items={[
          {
            label: 'Open thread',
            onClick: () => {
              void router.navigate({ to: '/t/$threadId', params: { threadId: thread.threadId } })
              setMenuOpen(false)
              onNavigate?.()
            },
          },
          {
            label: 'Copy link',
            icon: <CopyIcon aria-hidden="true" />,
            onClick: () => void copyLink(),
          },
          { type: 'divider' },
          {
            label: 'Start new question',
            onClick: () => {
              void router.navigate({ to: '/' })
              setMenuOpen(false)
              onNavigate?.()
            },
          },
          { type: 'divider' },
          {
            label: 'Delete',
            icon: <TrashIcon aria-hidden="true" />,
            onClick: () => void handleDelete(),
          },
        ]}
      />
    </li>
  )
}

function ClientRelativeTime({ timestamp }: { timestamp: number }) {
  const mounted = useClientMounted()
  return (
    <time className="font-mono text-xs tabular-nums text-secondary" data-numeric dateTime={timestampIso(timestamp)}>
      {mounted ? formatRelativeTime(timestamp) : ''}
    </time>
  )
}
