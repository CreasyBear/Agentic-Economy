import { Button } from '@/components/ui/button'
import type { FollowUpsProps } from './generative.contracts'

export function FollowUps({ view, onPick }: FollowUpsProps) {
  if (view.suggestions.length === 0) return null
  return (
    <section aria-label="Related questions" className="grid min-w-0 gap-2">
      <p className="text-xs font-medium text-muted-foreground">Ask a follow-up</p>
      <div className="flex flex-wrap gap-2">
        {view.suggestions.slice(0, 3).map((suggestion) => (
          <Button key={suggestion} type="button" variant="ghost" className="h-auto max-w-full rounded-full border-0 bg-muted/50 px-3 py-1.5 text-start text-[0.8125rem] font-medium whitespace-normal shadow-none transition-colors duration-fast hover:bg-muted/70 max-sm:!min-h-8 sm:min-h-10" onClick={() => onPick(suggestion)}>{suggestion}</Button>
        ))}
      </div>
    </section>
  )
}
