import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { chatDeleteConversation, chatHistory } from '@/lib/public/chat-ia'

export function OperationHistory({
  idPrefix,
  activeThreadId,
  threads,
  search,
  busy,
  /** True while the thread list's first page loads with nothing cached yet. */
  historyPending = false,
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
  /** True while the thread list's first page loads with nothing cached yet. */
  historyPending?: boolean
  onSearch(value: string): void
  onOpen(threadId: string): void
  onRename(threadId: string, title: string): Promise<boolean>
  onDelete(threadId: string): Promise<boolean>
  onNewChat(): void
}>) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col gap-related p-gutter">
      <Button className="min-h-touch w-full" variant="secondary" onClick={onNewChat}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        {chatHistory.newChat}
      </Button>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-history-search`}>{chatHistory.searchLabel}</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id={`${idPrefix}-history-search`}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="min-h-touch"
            type="search"
          />
        </InputGroup>
      </Field>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {historyPending && threads.length === 0 ? (
          <div className="grid gap-intra py-related" aria-busy="true" aria-label={chatHistory.sheetTitle}>
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
          </div>
        ) : threads.length === 0 ? (
          <Empty className="border-0 py-related">
            <EmptyHeader>
              <EmptyDescription>{chatHistory.empty}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-intra" aria-label={chatHistory.sheetTitle}>
            {threads.map((thread) => (
              <Item
                key={thread.threadId}
                size="sm"
                variant={thread.threadId === activeThreadId ? 'muted' : 'default'}
              >
                {renaming === thread.threadId ? (
                  // Mutation seam: Convex mutation `chatThreads.renameThread`
                  // ({ threadId: string, title: string } -> ChatThreadSummary),
                  // defined in convex/chatThreads.ts::renameThread with ownership
                  // enforced by requireOwnedChatThread. OperationChat.tsx binds it
                  // via useMutation(api.chatThreads.renameThread) and hands it down
                  // as onRename.
                  <InlineEditField
                    value={thread.title}
                    label={chatHistory.renameLabel}
                    saveLabel={chatHistory.save}
                    cancelLabel={chatHistory.cancel}
                    errorMessage="Could not rename the conversation. Try again."
                    editing={renaming === thread.threadId}
                    onEditEnd={() => setRenaming(null)}
                    onSave={(title) => onRename(thread.threadId, title)}
                  />
                ) : confirmDelete === thread.threadId ? (
                  <ItemContent className="gap-intra">
                    <p className="text-sm">{chatDeleteConversation(thread.title)}</p>
                    <ItemActions>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy || thread.busy}
                        onClick={() => void onDelete(thread.threadId).then((deleted) => {
                          if (deleted) setConfirmDelete(null)
                        })}
                      >
                        {chatHistory.deleteAction}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        {chatHistory.cancel}
                      </Button>
                    </ItemActions>
                  </ItemContent>
                ) : (
                  <>
                    <ItemContent>
                      <button
                        type="button"
                        className="min-h-touch min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-current={thread.threadId === activeThreadId ? 'page' : undefined}
                        onClick={() => onOpen(thread.threadId)}
                      >
                        <ItemTitle className="max-w-full">
                          <span className="truncate">{thread.title}</span>
                          {thread.busy ? (
                            <span className="text-xs font-normal text-muted-foreground">{chatHistory.responding}</span>
                          ) : null}
                        </ItemTitle>
                      </button>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-touch min-w-touch opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                        aria-label={`Rename ${thread.title}`}
                        onClick={() => setRenaming(thread.threadId)}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-touch min-w-touch opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                        aria-label={`Delete ${thread.title}`}
                        onClick={() => setConfirmDelete(thread.threadId)}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </ItemActions>
                  </>
                )}
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </div>
  )
}
