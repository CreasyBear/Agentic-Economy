import type { ConversationTurn } from '../../workspace-types'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import { customerFacingAeTurn } from './prompts'
/*
 * The AE turn carries no accent rule. A thick left border is the most
 * recognizable tell of a generated interface, and with real weight contrast
 * restored the label and heading already separate the speakers.
 */
export function Conversation({ turns }: { turns: readonly ConversationTurn[] }) {
  return (
    <div className="grid gap-3" aria-label="Request conversation">
      {turns.map((turn, index) => turn.speaker === 'customer' ? (
        <Message key={`${index}:${turn.text}`} align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent>{turn.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Message key={`${index}:${turn.text}`} align="start">
          <MessageContent>
            <Bubble variant="ghost" className="w-full">
              <BubbleContent>
                <p className="text-sm font-semibold text-brand">AE</p>
                <h2 className="mt-1 text-2xl font-semibold">{customerFacingAeTurn(turn.text)}</h2>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ))}
    </div>
  )
}
