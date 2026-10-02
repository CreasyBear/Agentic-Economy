// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/suggested-actions.tsx (Apache-2.0).
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { chatSuggestions } from '@/lib/public/chat-ia'

export type ChatSuggestedActionsProps = Readonly<{ onPick(prompt: string): void }>

export function ChatSuggestedActions({ onPick }: ChatSuggestedActionsProps) {
  return (
    <Suggestions className="justify-start gap-2.5 pb-1" data-testid="suggested-actions">
      {chatSuggestions.map((suggestion) => (
        <Suggestion
          key={suggestion.prompt}
          suggestion={suggestion.prompt}
          onClick={onPick}
          aria-label={suggestion.prompt}
          className="h-auto min-h-12 min-w-50 shrink-0 justify-start gap-1 whitespace-nowrap rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-left text-sm leading-relaxed transition-[background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-card/60 hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring sm:min-h-20 sm:min-w-0 sm:shrink sm:flex-col sm:items-start sm:justify-center sm:gap-0.5 sm:whitespace-normal sm:p-4"
        >
          <span className="font-semibold text-foreground">{suggestion.title}</span>{' '}
          <span className="text-muted-foreground">{suggestion.label}</span>
        </Suggestion>
      ))}
    </Suggestions>
  )
}
