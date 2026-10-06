import { ArcAiChatSuggestions } from '@/components/ae/shared/arc-pro/ai-chat/ai-chat'
import type { FollowUpsProps } from './generative.contracts'
import './FollowUpsComposition.css'

export function FollowUps({ view, onPick }: FollowUpsProps) {
  if (view.suggestions.length === 0) return null
  return (
    <section aria-label="Related questions" className="arc-market arc-chat arc-follow-ups">
      <p className="arc-follow-ups-heading">Ask a follow-up</p>
      <ArcAiChatSuggestions
        suggestions={view.suggestions.slice(0, 3).map((suggestion) => ({
          prompt: suggestion,
          title: suggestion,
          label: '',
        }))}
        onPick={onPick}
      />
    </section>
  )
}
