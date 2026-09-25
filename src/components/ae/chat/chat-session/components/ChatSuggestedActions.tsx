// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/suggested-actions.tsx (Apache-2.0).
import { Button } from '@/components/ui/button'
import { chatSuggestions } from '@/lib/public/chat-ia'

export type ChatSuggestedActionsProps = Readonly<{ onPick(prompt: string): void }>

export function ChatSuggestedActions({ onPick }: ChatSuggestedActionsProps) {
  return (
    <div className="flex w-full gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible" data-testid="suggested-actions">
      {chatSuggestions.map((suggestion) => (
        <Button
          key={suggestion.prompt}
          aria-label={suggestion.prompt}
          type="button"
          variant="ghost"
          className="h-auto min-h-12 min-w-50 shrink-0 justify-start gap-1 whitespace-nowrap rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-left text-sm leading-relaxed transition-[background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-card/60 hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring sm:min-h-20 sm:min-w-0 sm:shrink sm:flex-col sm:items-start sm:justify-center sm:gap-0.5 sm:whitespace-normal sm:p-4"
          onClick={() => onPick(suggestion.prompt)}
        >
          <span className="font-semibold text-foreground">{suggestion.title}</span>{' '}
          <span className="text-muted-foreground">{suggestion.label}</span>
        </Button>
      ))}
    </div>
  )
}
