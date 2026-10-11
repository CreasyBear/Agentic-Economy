import { useState } from 'react'
import { useConvexAuth, usePaginatedQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { useStickyRows } from '@/components/ui/data-state'
import type { ChatHistoryPanelContainerProps } from './chat-session.contracts'
import { ChatHistoryPanel } from './components/ChatHistoryPanel'

const PAGE_SIZE = 20

export function ChatHistoryPanelContainer({
  idPrefix, activeThreadId, now, busy, onOpen, onNewChat, onRename, onDelete,
}: ChatHistoryPanelContainerProps) {
  const [search, setSearch] = useState('')
  const { isAuthenticated } = useConvexAuth()
  const listed = usePaginatedQuery(api.chatThreads.listThreads,
    isAuthenticated && search.trim().length === 0 ? { now } : 'skip', { initialNumItems: PAGE_SIZE })
  const searched = usePaginatedQuery(api.chatThreads.searchThreads,
    isAuthenticated && search.trim().length > 0 ? { query: search, now } : 'skip', { initialNumItems: PAGE_SIZE })
  const page = search.trim().length > 0 ? searched : listed
  const rows = useStickyRows(page.results)
  return <ChatHistoryPanel
    idPrefix={idPrefix} activeThreadId={activeThreadId} threads={rows.shown}
    search={search} busy={busy} historyPending={!rows.everCached}
    hasMore={page.status === 'CanLoadMore' || page.status === 'LoadingMore'}
    loadingMore={page.status === 'LoadingMore'}
    onLoadMore={() => { if (page.status === 'CanLoadMore') page.loadMore(PAGE_SIZE) }}
    onSearch={setSearch} onOpen={onOpen} onNewChat={onNewChat}
    onRename={onRename} onDelete={onDelete}
  />
}
