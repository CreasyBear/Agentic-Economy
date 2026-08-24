import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function OperationHistory({
  idPrefix,
  activeThreadId,
  threads,
  search,
  busy,
  onSearch,
  onOpen,
  onRename,
  onDelete,
  onNewChat,
}: Readonly<{
  idPrefix: string
  activeThreadId: string | null
  threads: readonly { threadId: string; title: string; busy: boolean }[]
  search: string
  busy: boolean
  onSearch(value: string): void
  onOpen(threadId: string): void
  onRename(threadId: string, title: string): Promise<boolean>
  onDelete(threadId: string): Promise<boolean>
  onNewChat(): void
}>) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <Button className="min-h-11 w-full" variant="secondary" onClick={onNewChat}>
        <PlusIcon aria-hidden="true" /> New chat
      </Button>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-history-search`} className="text-xs font-medium text-muted-foreground">Search conversations</label>
        <div className="relative">
          <SearchIcon aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id={`${idPrefix}-history-search`} value={search} onChange={(event) => onSearch(event.target.value)} className="min-h-11 pl-9" type="search" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">No conversations found.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {threads.map((thread) => (
              <li key={thread.threadId} className="rounded-lg border border-transparent p-1 data-[active=true]:border-border data-[active=true]:bg-accent" data-active={thread.threadId === activeThreadId}>
                {renaming === thread.threadId ? (
                  <form
                    className="flex flex-col gap-2 p-1"
                    action={() => {
                      void onRename(thread.threadId, renameTitle).then((renamed) => {
                        if (renamed) setRenaming(null)
                      })
                    }}
                  >
                    <label htmlFor={`${idPrefix}-rename-${thread.threadId}`} className="sr-only">Conversation title</label>
                    <Input id={`${idPrefix}-rename-${thread.threadId}`} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus />
                    <div className="flex gap-1">
                      <Button type="submit" size="sm" disabled={busy}>Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : confirmDelete === thread.threadId ? (
                  <div className="flex flex-col gap-2 p-2">
                    <p className="text-sm">Delete “{thread.title}”?</p>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="destructive" disabled={busy || thread.busy} onClick={() => void onDelete(thread.threadId).then((deleted) => {
                        if (deleted) setConfirmDelete(null)
                      })}>Delete</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="group flex min-h-11 items-center gap-1">
                    <button
                      type="button"
                      className="min-h-11 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                      aria-current={thread.threadId === activeThreadId ? 'page' : undefined}
                      onClick={() => onOpen(thread.threadId)}
                    >
                      {thread.title}
                      {thread.busy ? <span className="ml-1 text-xs text-muted-foreground">Responding</span> : null}
                    </button>
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Rename ${thread.title}`} onClick={() => {
                      setRenameTitle(thread.title)
                      setRenaming(thread.threadId)
                    }}><PencilIcon aria-hidden="true" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Delete ${thread.title}`} onClick={() => setConfirmDelete(thread.threadId)}><Trash2Icon aria-hidden="true" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
