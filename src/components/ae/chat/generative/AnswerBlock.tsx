import { ChatAssistantText } from '@/components/ae/chat/ChatAssistantText'
import type { AnswerBlockProps } from './generative.contracts'
import '../TranscriptComposition.css'

export function AnswerBlock({ view }: AnswerBlockProps) {
  if (!view.markdown.trim()) return view.streaming ? <p role="status" className="arc-market arc-chat arc-answer-writing">Writing an answer…</p> : null
  return (
    <section aria-label="Answer" aria-busy={view.streaming === true} className="arc-market arc-chat arc-answer">
      <ChatAssistantText text={view.markdown} />
    </section>
  )
}
