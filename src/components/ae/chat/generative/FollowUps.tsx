import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import type { FollowUpsProps } from './generative.contracts'

export function FollowUps({ view, onPick }: FollowUpsProps) {
  if (view.suggestions.length === 0) return null
  return (
    <section aria-label="Related questions" className="grid min-w-0 gap-2">
      <p className="text-xs font-medium text-muted-foreground">Ask a follow-up</p>
      <Suggestions className="justify-start">
        {view.suggestions.slice(0, 3).map((suggestion) => (
          <Suggestion key={suggestion} suggestion={suggestion} onClick={onPick}
            className="h-auto max-w-full min-h-touch whitespace-normal text-start" />
        ))}
      </Suggestions>
    </section>
  )
}
