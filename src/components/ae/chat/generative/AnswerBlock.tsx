import { ChatAssistantText } from '@/components/ae/chat/ChatAssistantText'
import type { AnswerBlockProps } from './generative.contracts'

export function AnswerBlock({ view }: AnswerBlockProps) {
  if (!view.markdown.trim()) return view.streaming ? <p role="status" className="text-sm text-muted-foreground">Writing an answer…</p> : null
  return (
    <section aria-label="Answer" aria-busy={view.streaming === true} className="min-w-0 text-foreground [&>div]:text-base [&_p]:leading-relaxed [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight">
      <ChatAssistantText text={view.markdown} />
    </section>
  )
}
