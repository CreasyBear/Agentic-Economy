import { createFileRoute } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { OperationChat } from '@/components/ae/operation-chat'

export const Route = createFileRoute('/t/$threadId')({
  head: () => ({
    meta: [
      { title: 'Private chat | Agentic Economy' },
      { name: 'robots', content: 'noindex, noarchive' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  headers: () => ({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  }),
  errorComponent: ChatUnavailable,
  component: ThreadPage,
})

function ThreadPage() {
  const { threadId } = Route.useParams()
  const navigate = Route.useNavigate()
  const openThread = (nextThreadId: string) => void navigate({
    to: '/t/$threadId',
    params: { threadId: nextThreadId },
  })
  return (
    <OperationChat
      threadId={threadId}
      onThreadCreated={openThread}
      onOpenThread={openThread}
      onNewChat={() => void navigate({ to: '/t/new' })}
    />
  )
}

function ChatUnavailable() {
  return (
    <AePageState
      tone="danger"
      title="Chat unavailable"
      description="This conversation could not be opened."
    />
  )
}

