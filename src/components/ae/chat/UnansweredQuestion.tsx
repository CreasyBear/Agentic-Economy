import { Button } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { MessageScrollerItem } from '@/components/ui/message-scroller'

export function UnansweredQuestion({
  question,
  onRetry,
  onEdit,
}: Readonly<{
  question: string
  onRetry: (question: string) => void
  onEdit?: (question: string) => void
}>) {
  return (
    <MessageScrollerItem messageId="unanswered" className="col-span-12 md:col-start-3 md:col-span-8">
      <DecisionPanel role="status">
        <p className="text-sm text-muted-foreground">This question has no answer yet.</p>
        <div className="arc-decision-actions">
          <Button type="button" variant="primary" onClick={() => { if (question) onRetry(question) }}>Try again</Button>
          {onEdit === undefined ? null : (
            <Button type="button" variant="secondary" onClick={() => { if (question) onEdit(question) }}>
              Edit question
            </Button>
          )}
        </div>
      </DecisionPanel>
    </MessageScrollerItem>
  )
}
