/**
 * Chat IA. Copy and empty-path suggestions live here, not in views.
 * Destinations stay the five market tools; do not add harness prompts.
 */
export const chatEmpty = {
  title: 'What can I find for you?',
  description: 'Search, compare and buy AI tools. You approve every purchase.',
} as const

export const chatLoading = 'Loading conversation…'

export const chatThinking = 'Thinking…'

export const chatClarify = {
  otherLabel: 'Another answer',
  otherPlaceholder: 'Type another answer…',
  submitOther: 'Send answer',
} as const

export const chatSuggestions = [
  { title: 'Convert a time zone', label: '3:30pm New York to Tokyo', prompt: 'Convert a time zone 3:30pm New York to Tokyo' },
  { title: 'Look up an Ethereum transaction', label: 'from its hash', prompt: 'Look up an Ethereum transaction from its hash' },
  { title: 'Track token transfers', label: 'for a wallet address', prompt: 'Track token transfers for a wallet address' },
  { title: 'Check a transaction fee', label: 'gas paid, from its hash', prompt: 'Check a transaction fee: gas paid, from its hash' },
] as const

export const chatComposer = {
  promptLabel: 'Message',
  placeholder: 'Ask about any tool…',
  send: 'Send',
  sending: 'Sending…',
  sendAria: 'Send message',
  sendingAria: 'Sending message',
  stop: 'Stop',
  stopAria: 'Stop generating',
} as const

export const chatRecovery = {
  reference: 'Support reference',
  browse: 'Browse Market',
} as const

export const chatHandoffNotice = 'Signed in — messages from here are saved.'

export const chatToolPanel = {
  review: 'Review inputs', run: 'Run', bestMatch: 'Best match',
  loading: 'Loading what this Tool needs…',
  unavailable: 'This Tool’s inputs can’t be shown right now. Close this and try again.',
  jsonLabel: 'Exact Tool input (JSON object)', jsonHelp: 'Enter the input as JSON.',
  inputLegend: 'Tool inputs',
  waitForResponse: 'Wait for the current response to finish before running this Tool.',
  incomplete: 'Complete the required fields to run.',
  tooLong: 'This input is too long to run from chat (limit 1,500 bytes).',
  priceNote: 'The price is confirmed before it runs. Credit is reserved first, then charged after payment settles and the Provider returns a successful response, even if the answer is unusable.',
  runNow: 'Runs within your spending limit. Anything above it asks for your approval first.',
  runAfterCredit: 'Add credit first, then it runs. Your values are kept while this chat stays open.',
  submitting: 'Sending…', submitted: 'Run requested. The result appears below.',
  runNotSent: 'This run didn’t start. Check your message, then try again.',
  runOutcomeUnknown: 'We couldn’t confirm whether this run started. Check the conversation before trying again to avoid sending it twice.',
  runAgain: 'Run again', cancel: 'Cancel',
  fromMessage: 'From your message', providerDefault: 'Provider default',
} as const
export function chatToolPanelHeading(title: string): string { return `Review ${title}` }
export function chatToolPanelComplete(fields: readonly string[]): string { return fields.length === 0 ? chatToolPanel.incomplete : `Complete: ${fields.join(', ')}` }
export function chatToolPanelMatchedBy(by: string): string { return `Best match chosen by ${by}. Your message and Tool summaries were sent there.` }

export const chatShared = {
  fallbackTitle: 'Shared conversation',
  detail: 'This shared conversation cannot be continued.',
  loading: 'Loading conversation…',
  empty: 'No settled messages are available.',
  badge: 'Read-only',
  loadMore: 'Load earlier messages',
  loadingMore: 'Loading earlier messages…',
  loadMoreErrorTitle: 'Earlier messages unavailable',
  loadMoreErrorDescription: 'The messages already shown are still available. Try loading earlier messages again.',
  retryLoadMore: 'Try again',
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

export function chatStageTitle(threadTitle: string | null): string {
  return threadTitle?.trim() || 'Ask'
}

export function chatStageDetail(authenticated: boolean): string {
  return authenticated ? 'Saved to your account' : 'Saved in this browser tab'
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
export const chatLoadEarlierMessages = chatShared.loadMore
