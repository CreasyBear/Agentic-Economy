// Date grouping/controller adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/sidebar-history.tsx and components/chat/sidebar-history-item.tsx, Apache-2.0.
// Live history binding. The installed Arc AI Chat block owns list presentation.
import { MoreHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { ArcAiChatHistory } from '@/components/ae/shared/arc-pro/ai-chat/ai-chat'

import { Button } from '@/components/arc/button/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SearchField } from '@/components/arc/search-field/search-field'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { chatDeleteConversation, chatHistory } from '@/lib/public/chat-ia'

import type { ChatHistoryProps, ChatHistoryThread } from '../chat-session.contracts'
import './ChatHistoryCommands.css'

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

  const rowGroups = groups.flatMap((label, index) => grouped[index]!.length === 0 ? [] : [{
    label,
    items: grouped[index]!.map(thread => ({
      id: thread.threadId,
      title: thread.title,
      busy: thread.busy,
      content: renaming === thread.threadId ? (
        <div className="arc-chat-history-edit"><InlineEditField value={thread.title} label={chatHistory.renameLabel}
          saveLabel={chatHistory.save} cancelLabel={chatHistory.cancel}
          errorMessage="Could not rename the conversation. Try again." editing onEditEnd={() => setRenaming(null)}
          onSave={title => onRename(thread.threadId, title)} /></div>
      ) : confirmDelete === thread.threadId ? (
        <div className="arc-chat-history-confirm">
          <span>{chatDeleteConversation(thread.title)}</span>
          <div className="arc-chat-history-confirm-actions">
            <Button type="button" size="sm" variant="danger" disabled={busy || thread.busy}
              onClick={() => void onDelete(thread.threadId).then(deleted => { if (deleted) setConfirmDelete(null) })}>{chatHistory.deleteAction}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>{chatHistory.cancel}</Button>
          </div>
        </div>
      ) : null,
      actions: <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" aria-label={`More options for ${thread.title}`}><MoreHorizontalIcon size={17} aria-hidden="true" /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenaming(thread.threadId)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirmDelete(thread.threadId)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    })),
  }])
  return <ArcAiChatHistory groups={rowGroups} activeId={activeThreadId} onOpen={onOpen} onNewChat={onNewChat}
    newChatLabel={chatHistory.newChat} navLabel={chatHistory.sheetTitle} busyLabel={chatHistory.responding}
    search={<SearchField id={idPrefix + '-history-search'} label={chatHistory.searchLabel}
      value={search} onValueChange={onSearch} placeholder="Search chats" />}
    status={historyPending && threads.length === 0 ? <div role="status" aria-busy="true" aria-label="Loading chat history">
      {[44, 32, 28, 64, 52].map(width => <div key={width} className="arc-chat-history-loading-row">
        <div className="h-5" style={{ width: width + '%' }} aria-hidden="true"><Skeleton lines={1} /></div>
      </div>)}
    </div> : threads.length === 0 ? <p>{search ? chatHistory.empty : 'Your chats will appear here.'}</p> : null}
    pagination={hasMore && onLoadMore !== undefined ? <Button type="button" variant="ghost" disabled={loadingMore}
      aria-busy={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : 'Load more chats'}</Button> : null} />
}
