/* Retrieved upstream source SHA-256: b2ddf16e99097944ad1bf0d3bf6f349e7582ba61bf09755c733f24d3c31c4645 */
/* Arc Pro AI Chat UserMessage/AssistantMessage source frames, 2026-10-03.
 * The caller supplies its native streamed markdown, Tool decisions and recovery.
 * Demo edit/version/model controls are omitted because AE owns those capabilities.
 */
import type { ReactNode } from 'react'

import styles from './ai-chat-message.module.css'

export function ArcAiChatMessage({ role, text, children }: Readonly<{
  role: 'user' | 'assistant'
  text: string
  children: ReactNode
}>) {
  return <article className={styles.messageItem} aria-label={role === 'user' ? 'You' : 'Assistant'} data-role={role}>
    {role === 'user' ? <div className={styles.user}>
      <div className={styles.bubble}><p className={styles.bubbleText}>{text}</p></div>
      {children}
    </div> : <div className={styles.assistant}><div className={styles.answer}>{children}</div></div>}
  </article>
}
