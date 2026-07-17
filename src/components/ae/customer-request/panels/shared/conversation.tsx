import { Heading, Text } from '@astryxdesign/core/Text'
import type { ConversationTurn } from '../../workspace-types'
import { customerFacingAeTurn } from './prompts'

export function Conversation({ turns }: { turns: readonly ConversationTurn[] }) { return <div className="grid gap-3" aria-label="Request conversation">{turns.map((turn, index) => turn.speaker === 'customer' ? <div key={`${index}:${turn.text}`} className="ml-auto max-w-[85%] rounded-md bg-accent px-4 py-3 text-on-accent">{turn.text}</div> : <div key={`${index}:${turn.text}`} className="max-w-[90%] border-l-2 border-accent py-1 pl-4"><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">{customerFacingAeTurn(turn.text)}</Heading></div>)}</div> }
