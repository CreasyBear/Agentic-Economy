import type { ToolCardProjection } from '@/modules/chat/tool-card'
import type { TranscriptTurn } from './presentation'
import './TranscriptComposition.css'

export type ChatTranscriptClarifyProps = Readonly<{
  card: Extract<ToolCardProjection, { kind: 'clarify' }>
  answer: string | undefined
  hidePending: boolean
}>

export function clarifyKey(turnId: string, cardIndex: number): string {
  return `${turnId}:${cardIndex}`
}

export function clarifyPresentation(turns: readonly TranscriptTurn[]) {
  const answers = new Map<string, string>()
  let pending: (Extract<ToolCardProjection, { kind: 'clarify' }> & { key: string }) | null = null
  for (const turn of turns) {
    if (turn.role === 'user' && turn.text.trim().length > 0 && pending !== null && pending.answer === undefined) {
      answers.set(pending.key, turn.text.trim())
      pending = null
    }
    if (turn.role !== 'assistant') continue
    for (const [cardIndex, card] of turn.tools.entries()) {
      if (card.kind !== 'clarify') continue
      const key = clarifyKey(turn.id, cardIndex)
      if (card.answer !== undefined) {
        answers.set(key, card.answer)
        pending = null
        continue
      }
      pending = { ...card, key }
    }
  }
  return { answers, pending }
}

export function ChatTranscriptClarify({ card, answer, hidePending }: ChatTranscriptClarifyProps) {
  if (answer === undefined) {
    if (hidePending) return null
    return <p className="arc-market arc-chat arc-transcript-clarify">{card.question}</p>
  }
  return (
    <p className="arc-market arc-chat arc-transcript-clarify">
      <span>{card.question}</span>
      {' '}
      <span className="arc-transcript-answer">{answer}</span>
    </p>
  )
}
