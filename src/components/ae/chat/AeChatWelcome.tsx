import { AeHandDrawnHero } from '@/components/ae/landing/AeHandDrawnHero'

export function AeChatWelcome() {
  return (
    <div className="ae-chat-welcome">
      <AeHandDrawnHero
        src="/images/illustration/hero-victorian-house.png"
        alt="Hand-drawn pen-and-ink Victorian suburban house with a faint city skyline behind it."
        caption="A register of who handles what, where."
      />
      <div className="ae-chat-welcome__copy">
        <p className="ae-chat-welcome__kicker">Agentic Economy</p>
        <h1 className="ae-chat-welcome__title">Ask for a local service. Get a cited answer.</h1>
        <p className="ae-chat-welcome__lede">
          Type a real need and a place. The answer names listed local businesses, what they handle, and where they work.
          No booking, no payment.
        </p>
        <p className="ae-chat-welcome__assistants">
          Assistants: <a href="/llms.txt">/llms.txt</a>
        </p>
      </div>
    </div>
  )
}
