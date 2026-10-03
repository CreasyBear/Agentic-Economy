/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatHistory } from '@/components/ae/chat/chat-session/components/ChatHistory'
import type { ChatHistoryProps } from '@/components/ae/chat/chat-session/chat-session.contracts'
import { chatHistory } from '@/lib/public/chat-ia'

afterEach(cleanup)
const buildProps = (overrides: Partial<ChatHistoryProps> = {}): ChatHistoryProps => ({
  idPrefix: 'history', activeThreadId: 'thread-a', threads: [{ threadId: 'thread-a', title: 'Weather procurement', createdAt: Date.now(), busy: false }],
  search: '', busy: false, onSearch: vi.fn(), onOpen: vi.fn(), onRename: vi.fn(async () => true), onDelete: vi.fn(async () => true), onNewChat: vi.fn(), ...overrides,
})

it('keeps cached private history usable during refresh and sends exact navigation/search intents', () => {
  const props = buildProps({ historyPending: true, hasMore: true, onLoadMore: vi.fn() })
  const { rerender, container } = render(<ChatHistory {...props} />)
  expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
  const open = screen.getByRole('button', { name: 'Weather procurement' })
  expect(open).toHaveAttribute('aria-current', 'page')
  expect(open).toHaveAttribute('title', 'Weather procurement')
  fireEvent.click(open)
  fireEvent.change(screen.getByRole('searchbox', { name: chatHistory.searchLabel }), { target: { value: 'Sydney' } })
  fireEvent.click(screen.getByRole('button', { name: chatHistory.newChat }))
  fireEvent.click(screen.getByRole('button', { name: 'Load more chats' }))
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('thread-a')
  expect(props.onSearch).toHaveBeenCalledExactlyOnceWith('Sydney')
  expect(props.onNewChat).toHaveBeenCalledOnce()
  expect(props.onLoadMore).toHaveBeenCalledOnce()
  rerender(<ChatHistory {...props} loadingMore />)
  expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Weather procurement' })).toBeInTheDocument()
})

it('clears the supplied search through Arc and returns focus to the field', () => {
  const onSearch = vi.fn()
  render(<ChatHistory {...buildProps({ search: 'Sydney', onSearch })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(onSearch).toHaveBeenCalledExactlyOnceWith('')
  expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: chatHistory.searchLabel }))
})

it('keeps a rejected rename open with its committed title and permits an exact retry', async () => {
  const onRename = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(<ChatHistory {...buildProps({ onRename })} />)
  fireEvent.click(screen.getByRole('button', { name: 'More options for Weather procurement' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const input = await screen.findByRole('textbox', { name: chatHistory.renameLabel })
  fireEvent.change(input, { target: { value: 'Sydney weather' } })
  fireEvent.click(screen.getByRole('button', { name: chatHistory.save }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not rename the conversation. Try again.')
  expect(input).toHaveValue('Weather procurement')
  expect(onRename).toHaveBeenCalledExactlyOnceWith('thread-a', 'Sydney weather')
  fireEvent.change(input, { target: { value: 'Sydney weather' } })
  fireEvent.click(screen.getByRole('button', { name: chatHistory.save }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: chatHistory.renameLabel })).not.toBeInTheDocument())
  expect(onRename).toHaveBeenLastCalledWith('thread-a', 'Sydney weather')
  expect(screen.getByRole('button', { name: 'Weather procurement' })).toBeInTheDocument()
})

it('requires confirmation for deletion, retains rejected deletion, and honors busy lock', async () => {
  const onDelete = vi.fn().mockResolvedValue(false)
  const props = buildProps({ onDelete })
  const { rerender } = render(<ChatHistory {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'More options for Weather procurement' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(onDelete).not.toHaveBeenCalled()
  const confirmation = await screen.findByRole('button', { name: chatHistory.deleteAction })
  fireEvent.click(confirmation)
  await waitFor(() => expect(onDelete).toHaveBeenCalledExactlyOnceWith('thread-a'))
  expect(confirmation).toBeInTheDocument()
  rerender(<ChatHistory {...props} busy />)
  expect(confirmation).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: chatHistory.cancel }))
  expect(screen.getByRole('button', { name: 'Weather procurement' })).toBeInTheDocument()
})
