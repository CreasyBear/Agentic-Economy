import { RemovalRequestForm } from './components/RemovalRequestForm'
import { AeRemoveBusinessPageSkeleton } from './AeRemoveBusinessPageSkeleton'
import { useRemoveBusinessPage } from './useRemoveBusinessPage'

export function AeRemoveBusinessPage() {
  const { hydrated, form } = useRemoveBusinessPage()

  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      {!hydrated ? <AeRemoveBusinessPageSkeleton /> : <RemovalRequestForm {...form} />}
    </div>
  )
}
