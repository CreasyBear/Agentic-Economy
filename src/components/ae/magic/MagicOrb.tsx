import { ThinkingOrb, type OrbState } from 'thinking-orbs'

/**
 * AE-facing wrapper over `thinking-orbs` (MIT). Maps the product's own
 * semantics — which agent, which step — to the orb's nine tuned states.
 * Canvas-only, SSR-safe, auto themes from the host project, and pauses
 * offscreen + under reduced motion on its own.
 */
export type MagicOrbIntent =
  | 'engage' // Ask is assembling options / composing the shortlist
  | 'search' // discovering published businesses
  | 'read'   // reading published facts / checking details
  | 'write'  // preparing the next step / routing
  | 'idle'

const ORB_STATE: Record<MagicOrbIntent, OrbState> = {
  engage: 'composing',
  search: 'searching',
  read: 'connecting',
  write: 'weaving',
  idle: 'breathing',
}

export type MagicOrbProps = {
  intent?: MagicOrbIntent
  /** 64 for chat-avatar scale, 20 for inline-text scale. @default 20 */
  size?: 64 | 20
  className?: string
}

export function MagicOrb({ intent = 'engage', size = 20, className }: MagicOrbProps) {
  return <ThinkingOrb state={ORB_STATE[intent]} size={size} className={className} />
}
