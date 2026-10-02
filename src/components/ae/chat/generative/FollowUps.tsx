import { ArrowUpRightIcon } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import type { FollowUpsProps } from './generative.contracts'
import './FollowUpsComposition.css'

export function FollowUps({ view, onPick }: FollowUpsProps) {
  if (view.suggestions.length === 0) return null
  return (
    <section aria-label="Related questions" className="arc-market arc-chat arc-follow-ups">
      <p className="arc-follow-ups-heading">Ask a follow-up</p>
      <ul className="arc-follow-ups-list">
        {view.suggestions.slice(0, 3).map((suggestion) => (
          <li key={suggestion}><Button type="button" variant="secondary" labelLayout="start"
            className="arc-follow-ups-button" onClick={() => onPick(suggestion)}>
            <span className="arc-follow-ups-label">{suggestion}</span>
            <ArrowUpRightIcon size={16} aria-hidden="true" />
          </Button></li>
        ))}
      </ul>
    </section>
  )
}
