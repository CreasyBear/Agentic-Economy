import { FadeIn } from '@/components/animate/fade-in'
import { AeDaylightRoutingObject } from '@/components/ae/landing/AeDaylightRoutingObject'

export function AeChatWelcome() {
  return (
    <FadeIn className="ae-chat-welcome">
      <AeDaylightRoutingObject />
      <div className="ae-chat-welcome__copy">
        <p className="ae-chat-welcome__kicker">Agentic Economy</p>
        <h1 className="ae-chat-welcome__title">Ask for a local service. See who fits.</h1>
        <p className="ae-chat-welcome__lede">
          Type a real need, or name a different place. The answer names local businesses, what they handle, and where
          they work.
        </p>
        <p className="ae-chat-welcome__assistants">
          Assistants: <a href="/llms.txt">/llms.txt</a>
        </p>
      </div>
    </FadeIn>
  )
}
