import { CopyIcon } from 'lucide-react'

import { resolveThreadAgentJson } from '@/modules/answer-thread/public'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { Button } from '@/components/ui/button'
import { copyThreadLink } from './copy-thread-link'

export type AeThreadFooterProps = {
  threadId: string
  turns: readonly { query: string }[]
}

export function AeThreadFooter({ threadId, turns }: AeThreadFooterProps) {
  if (turns.length === 0) {
    return null
  }

  const { needQuery, agentJsonUrl } = resolveThreadAgentJson(turns)

  return (
    <footer className="ae-thread-footer">
      <AeProtectedByAe />
      <div className="ae-thread-footer__actions">
        <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={needQuery} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ae-thread-footer__copy"
          onClick={() => void copyThreadLink(threadId)}
        >
          <CopyIcon data-icon="inline-start" />
          Copy thread link
        </Button>
      </div>
    </footer>
  )
}
