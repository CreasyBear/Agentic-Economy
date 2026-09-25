// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/sidebar-history.tsx and components/chat/sidebar-history-item.tsx, Apache-2.0.
import { MoreHorizontalIcon, PenSquareIcon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { chatDeleteConversation, chatHistory } from '@/lib/public/chat-ia'

import type { ChatHistoryProps, ChatHistoryThread } from '../chat-session.contracts'

const day = 24 * 60 * 60 * 1000
const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const

function groupThreadsByDate(threads: readonly ChatHistoryThread[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - day
  const week = now.getTime() - 7 * day
  const month = now.getTime() - 30 * day
  const grouped: ChatHistoryThread[][] = [[], [], [], [], []]
  for (const thread of threads) {
    const created = thread.createdAt
    const index = created >= today ? 0 : created >= yesterday ? 1 : created > week ? 2 : created > month ? 3 : 4
    grouped[index]!.push(thread)
  }
  return grouped
}

export function ChatHistory({
  idPrefix,
  activeThreadId,
  threads,
  search,
  busy,
  historyPending = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSearch,
  onOpen,
  onRename,
  onDelete,
  onNewChat,
}: ChatHistoryProps) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const grouped = groupThreadsByDate(threads)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-2 pt-3 pb-4">
      <div className="px-1">
        <Button type="button" variant="outline" className="h-9 w-full justify-start gap-2 border-border bg-transparent text-[13px] text-foreground hover:bg-muted/50" onClick={onNewChat}>
          <PenSquareIcon className="size-4" aria-hidden="true" />
          <span className="font-medium">{chatHistory.newChat}</span>
        </Button>
      </div>
      <Field className="px-1">
        <FieldLabel htmlFor={`${idPrefix}-history-search`} className="sr-only">{chatHistory.searchLabel}</FieldLabel>
        <InputGroup>
          <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput id={`${idPrefix}-history-search`} value={search} onChange={event => onSearch(event.target.value)} type="search" placeholder="Search chats" aria-label={chatHistory.searchLabel} />
        </InputGroup>
      </Field>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={chatHistory.sheetTitle}>
        {historyPending && threads.length === 0 ? (
          <div className="flex flex-col gap-1 px-1" aria-busy="true" aria-label={chatHistory.sheetTitle}>
            {[44, 32, 28, 64, 52].map(width => <div key={width} className="flex h-8 items-center rounded-lg px-2"><Skeleton className="h-3" style={{ width: `${width}%` }} /></div>)}
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-muted-foreground">{search ? chatHistory.empty : 'Your chats will appear here.'}</p>
        ) : (
          <div className="flex flex-col gap-4" role="list">
            {groups.map((label, index) => grouped[index]!.length > 0 ? (
              <div key={label} role="listitem">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
                {grouped[index]!.map(thread => (
                  <div key={thread.threadId} className="group relative flex min-h-8 items-center rounded-md transition-colors duration-150 hover:bg-muted/50 max-md:min-h-touch data-[active=true]:bg-muted" data-active={thread.threadId === activeThreadId}>
                    {renaming === thread.threadId ? (
                      <InlineEditField value={thread.title} label={chatHistory.renameLabel} saveLabel={chatHistory.save} cancelLabel={chatHistory.cancel}
                        errorMessage="Could not rename the conversation. Try again." editing onEditEnd={() => setRenaming(null)}
                        onSave={title => onRename(thread.threadId, title)} />
                    ) : confirmDelete === thread.threadId ? (
                      <div className="flex min-w-0 flex-col gap-2 p-2 text-[13px]">
                        <span className="truncate">{chatDeleteConversation(thread.title)}</span>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="destructive" disabled={busy || thread.busy} onClick={() => void onDelete(thread.threadId).then(deleted => { if (deleted) setConfirmDelete(null) })}>{chatHistory.deleteAction}</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>{chatHistory.cancel}</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button type="button" aria-current={thread.threadId === activeThreadId ? 'page' : undefined} onClick={() => onOpen(thread.threadId)}
                          className="flex h-8 min-w-0 flex-1 items-center rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand max-md:min-h-touch data-[active=true]:font-medium data-[active=true]:text-foreground"
                          data-active={thread.threadId === activeThreadId}>
                          <span className="truncate">{thread.title}</span>
                          {thread.busy ? <span className="sr-only"> {chatHistory.responding}</span> : null}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground opacity-100 focus-visible:outline-2 focus-visible:outline-brand md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" aria-label={`More options for ${thread.title}`}><MoreHorizontalIcon className="size-4" aria-hidden="true" /></Button>} />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRenaming(thread.threadId)}><PencilIcon aria-hidden="true" />Rename</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirmDelete(thread.threadId)} className="text-destructive"><Trash2Icon aria-hidden="true" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null)}
          </div>
        )}
        {hasMore && onLoadMore ? (
          <Button type="button" variant="ghost" className="mt-2 w-full text-[13px] text-muted-foreground" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load more chats'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
