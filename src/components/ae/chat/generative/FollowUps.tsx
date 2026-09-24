import { Button } from '@/components/ui/button'
import type { FollowUpsProps } from './generative.contracts'

export function FollowUps({ view, onPick }: FollowUpsProps) {
  if (view.suggestions.length === 0) return null
  return (
    <section aria-label="Related questions" className="grid min-w-0 gap-2">
      <p className="text-sm font-medium">Ask a follow-up</p>
      <div className="flex flex-wrap gap-2">
        {view.suggestions.slice(0, 3).map((suggestion) => (
          <Button key={suggestion} type="button" variant="outline" className="min-h-10 h-auto max-w-full whitespace-normal text-start" onClick={() => onPick(suggestion)}>{suggestion}</Button>
        ))}
      </div>
    </section>
  )
}
