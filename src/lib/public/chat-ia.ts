/**
 * Chat IA. Copy and empty-path suggestions live here, not in views.
 * Destinations stay the five market tools; do not add harness prompts.
 */
export const chatEmpty = {
  title: 'Find Tools for an Agent.',
  description: 'Compare and inspect. Then use one with your Agent. Price is on the card.',
} as const

export const chatLoading = 'Loading conversation…'

export const chatThinking = 'Thinking…'

export const chatClarify = {
  otherLabel: 'Another answer',
  otherPlaceholder: 'Type another answer…',
  submitOther: 'Send answer',
} as const

export const chatSuggestions = [
  {
    label: 'Find a weather API',
    prompt: 'Find a weather API my agent can call',
  },
  {
    label: 'Compare lookups',
    prompt: 'Compare two company-lookup tools',
  },
  {
    label: 'Inspect before a call',
    prompt: 'Inspect a tool before calling it',
  },
] as const

export const chatComposer = {
  promptLabel: 'Message',
  placeholder: 'Find a weather API my agent can call',
  send: 'Send',
  sending: 'Sending…',
  sendAria: 'Send message',
  sendingAria: 'Sending message',
  stop: 'Stop',
  stopAria: 'Stop generating',
  newline: 'Enter sends. Shift+Enter inserts a newline.',
} as const

export const chatRecovery = {
  reference: 'Support reference',
  browse: 'Browse Market',
} as const

export const chatHandoffNotice = 'Signed in — messages from here are saved.'

export const chatShared = {
  fallbackTitle: 'Shared conversation',
  detail: 'This shared conversation cannot be continued.',
  loading: 'Loading conversation…',
  empty: 'No settled messages are available.',
  badge: 'Read-only',
  loadMore: 'Load earlier messages',
  loadingMore: 'Loading earlier messages…',
} as const

/** App-header slot filled by the chat thread controls on `/t/` and `/s/`. */
export const chatHeaderActionsId = 'ae-chat-actions'

export const chatHistory = {
  newChat: 'New chat',
  searchLabel: 'Search conversations',
  empty: 'No conversations found.',
  sheetTitle: 'Conversations',
  sheetDescription: 'Resume or manage your saved chats.',
  responding: 'Responding',
  renameLabel: 'Conversation title',
  save: 'Save',
  cancel: 'Cancel',
  deleteAction: 'Delete conversation',
  shareLabel: 'Read-only share link',
  copy: 'Copy',
  copied: 'Copied',
  openHistory: 'Open conversation history',
  home: 'Agentic Economy home',
  signIn: 'Sign in',
  shareCreate: 'Create share link',
  shareGet: 'Get share link',
  shareRevoke: 'Revoke share link',
} as const

export function chatDeleteConversation(title: string): string {
  return `Delete “${title}”?`
}

export function chatStageTitle(threadId: string | null): string {
  return threadId === null ? 'Ask' : 'Chat'
}

export function chatStageDetail(authenticated: boolean): string {
  return authenticated ? 'Saved to your account' : 'Private to this browser session'
}

export function chatAnonymousCountLine(count: number, limitReached: boolean): string {
  return `${count} / 12 browser messages${limitReached ? ' — limit reached; start a new chat to continue.' : ''}`
}

export const chatToolStatus = {
  working: 'Working',
  pending: 'Pending',
  complete: 'Complete',
  attention: 'Needs attention',
  refused: 'Refused',
  error: "Couldn't run",
} as const

export const chatBrowseMarket = 'Browse Market'

export const chatBelowMatch = 'Below a match'

export function chatChoiceAction(readiness: string | undefined): 'Use' | 'Inspect' {
  return readiness === 'Ready now' ? 'Use' : 'Inspect'
}

export function chatChoiceLinkName(title: string, readiness: string | undefined): string {
  return `${chatChoiceAction(readiness)} ${title}`
}

export function chatViewTool(name: string): string {
  return `View ${name}`
}

export function chatMatchedOperations(count: number): string {
  return count === 1 ? '1 tool' : `${count} tools`
}

export function chatShowingTools(shown: number, total: number): string {
  if (shown === 0 || total <= shown) return chatMatchedOperations(total)
  return `Showing ${shown} of ${total}`
}
