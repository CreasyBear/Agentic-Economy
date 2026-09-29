import { Button } from '@/components/ui/button'
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
      <div className="grid gap-2" role="status">
        <p className="text-sm text-muted-foreground">This question has no answer yet.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-10" onClick={() => { if (question) onRetry(question) }}>Try again</Button>
          {onEdit === undefined ? null : (
            <Button type="button" variant="secondary" className="min-h-10" onClick={() => { if (question) onEdit(question) }}>
              Edit question
            </Button>
          )}
        </div>
      </div>
    </MessageScrollerItem>
  )
}
