import { ChatAssistantText } from '@/components/ae/chat/ChatAssistantText'
import type { AnswerBlockProps } from './generative.contracts'

export function AnswerBlock({ view }: AnswerBlockProps) {
  if (!view.markdown.trim()) return view.streaming ? <p role="status" className="text-sm text-muted-foreground">Writing an answer…</p> : null
  return (
    <section aria-label="Answer" aria-busy={view.streaming === true} className="min-w-0 text-foreground">
      <ChatAssistantText text={view.markdown} />
    </section>
  )
}
