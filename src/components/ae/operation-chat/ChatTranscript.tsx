import { OperationCard } from './OperationCard'
import { projectOperationCard, textFromParts, type TranscriptMessage } from './presentation'

export function ChatTranscript({
  messages,
  handoffAfter,
}: {
  messages: readonly TranscriptMessage[]
  handoffAfter?: number
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex max-w-prose flex-1 flex-col justify-center px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">What operation do you need?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search, compare, inspect, and safely run keyless operations.</p>
      </div>
    )
  }

  return (
    <ol className="mx-auto flex w-full max-w-3xl list-none flex-col gap-6 px-4 py-6" aria-label="Conversation">
      {messages.map((message, index) => {
        const text = textFromParts(message.parts)
        const cards = message.parts.flatMap((part) => {
          const card = projectOperationCard(part)
          return card === null ? [] : [card]
        })
        return (
          <li key={message.id} className="contents">
            <article
              aria-label={message.role === 'user' ? 'You' : 'Assistant'}
              className={message.role === 'user' ? 'ml-auto max-w-[85%]' : 'max-w-[65ch]'}
            >
              <p className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </p>
              {text.length === 0 ? null : (
                <div className={message.role === 'user'
                  ? 'whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground'
                  : 'whitespace-pre-wrap text-sm leading-7 text-foreground'}>
                  {text}
                </div>
              )}
              {cards.length === 0 ? null : (
                <div className="mt-3 flex flex-col gap-2">
                  {cards.map((card, cardIndex) => <OperationCard key={`${message.id}-${card.toolId}-${cardIndex}`} projection={card} />)}
                </div>
              )}
            </article>
            {handoffAfter === index + 1 ? (
              <div className="flex items-center gap-3" role="status">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">Signed in — messages from here are saved.</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
