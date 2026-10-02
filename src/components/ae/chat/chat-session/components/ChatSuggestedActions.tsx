// Licensed Arc Pro ai-chat suggestion grid, using AE's existing prompt choices.
import { ArrowUpRight } from 'lucide-react'
import { chatSuggestions } from '@/lib/public/chat-ia'
import '@/components/arc/chat/ChatComposer.css'

export type ChatSuggestedActionsProps = Readonly<{ onPick(prompt: string): void }>

export function ChatSuggestedActions({ onPick }: ChatSuggestedActionsProps) {
  return <ul className="arc-market arc-chat arc-chat-suggestions" aria-label="Suggested questions" data-testid="suggested-actions">{chatSuggestions.map(suggestion => <li key={suggestion.prompt}><button type="button" className="arc-chat-suggestion" onClick={() => onPick(suggestion.prompt)} aria-label={suggestion.prompt}><span className="arc-chat-suggestion-label"><span>{suggestion.title}</span><span>{suggestion.label}</span></span><ArrowUpRight className="arc-chat-suggestion-arrow" size={18} strokeWidth={1.75} aria-hidden="true" /></button></li>)}</ul>
}
