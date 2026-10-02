// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/sidebar-history.tsx and components/chat/sidebar-history-item.tsx, Apache-2.0.
import { LoaderCircleIcon, MoreHorizontalIcon, PenSquareIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'

import { Button } from '@/components/arc/button/button'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { Skeleton } from '@/components/ui/skeleton'
import { chatDeleteConversation, chatHistory } from '@/lib/public/chat-ia'

import type { ChatHistoryProps, ChatHistoryThread } from '../chat-session.contracts'
import '@/components/arc/chat/ChatNavigation.css'

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
  const id = useId()
  const reduced = Boolean(useReducedMotion())
  const grouped = groupThreadsByDate(threads)

  return (
    <div className="arc-market arc-chat arc-chat-history">
      <div className="arc-chat-history-top">
        <Button type="button" labelLayout="start" className="arc-chat-history-new" onClick={onNewChat}>
          <PenSquareIcon size={17} strokeWidth={1.75} aria-hidden="true" />
          <span>{chatHistory.newChat}</span>
        </Button>
      </div>
      <Field className="arc-chat-history-search">
        <FieldLabel htmlFor={`${idPrefix}-history-search`} className="sr-only">{chatHistory.searchLabel}</FieldLabel>
        <input id={`${idPrefix}-history-search`} value={search} onChange={event => onSearch(event.target.value)} type="search" placeholder="Search chats" aria-label={chatHistory.searchLabel} />
      </Field>
      <nav className="arc-chat-history-list" aria-label={chatHistory.sheetTitle}>
        {historyPending && threads.length === 0 ? (
          <div className="arc-chat-history-loading" aria-busy="true" aria-label={chatHistory.sheetTitle}>
            {[44, 32, 28, 64, 52].map(width => <div key={width}><Skeleton className="h-3" style={{ width: `${width}%` }} /></div>)}
          </div>
        ) : threads.length === 0 ? (
          <p className="arc-chat-history-empty">{search ? chatHistory.empty : 'Your chats will appear here.'}</p>
        ) : (
          <LayoutGroup id={id}><div className="arc-chat-history-groups" role="list">
            {groups.map((label, index) => grouped[index]!.length > 0 ? (
              <div key={label} role="listitem" className="arc-chat-history-group">
                <p className="arc-chat-history-heading">{label}</p>
                {grouped[index]!.map(thread => (
                  <div key={thread.threadId} className="arc-chat-history-row" data-active={thread.threadId === activeThreadId}>
                    {renaming === thread.threadId ? (
                      <div className="arc-chat-history-edit"><InlineEditField value={thread.title} label={chatHistory.renameLabel} saveLabel={chatHistory.save} cancelLabel={chatHistory.cancel}
                        errorMessage="Could not rename the conversation. Try again." editing onEditEnd={() => setRenaming(null)}
                        onSave={title => onRename(thread.threadId, title)} /></div>
                    ) : confirmDelete === thread.threadId ? (
                      <div className="arc-chat-history-confirm">
                        <span>{chatDeleteConversation(thread.title)}</span>
                        <div className="arc-chat-history-confirm-actions">
                          <Button type="button" size="sm" variant="danger" disabled={busy || thread.busy} onClick={() => void onDelete(thread.threadId).then(deleted => { if (deleted) setConfirmDelete(null) })}>{chatHistory.deleteAction}</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>{chatHistory.cancel}</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button type="button" aria-current={thread.threadId === activeThreadId ? 'page' : undefined} onClick={() => onOpen(thread.threadId)}
                          className="arc-chat-history-button" title={thread.title}
                          data-active={thread.threadId === activeThreadId}>
                          {thread.threadId === activeThreadId ? <motion.span className="arc-chat-history-highlight" layoutId="active" transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" /> : null}
                          <span className="arc-chat-history-title">{thread.title}</span>
                          {thread.busy ? <><LoaderCircleIcon size={14} className="arc-chat-history-busy" aria-hidden="true" /><span className="sr-only"> {chatHistory.responding}</span></> : null}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="arc-chat-nav-icon arc-chat-history-more" aria-label={`More options for ${thread.title}`}><MoreHorizontalIcon size={17} aria-hidden="true" /></Button>} />
                          <DropdownMenuContent align="end" className="arc-market arc-chat arc-chat-history-menu">
                            <DropdownMenuItem onClick={() => setRenaming(thread.threadId)}>Rename</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirmDelete(thread.threadId)}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null)}
          </div></LayoutGroup>
        )}
        {hasMore && onLoadMore ? (
          <Button type="button" variant="ghost" className="arc-chat-history-load" disabled={loadingMore} aria-busy={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load more chats'}
          </Button>
        ) : null}
      </nav>
    </div>
  )
}
