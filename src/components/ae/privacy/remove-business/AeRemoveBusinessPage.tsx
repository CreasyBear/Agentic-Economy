import './CorrectionComposition.css'

import { RemovalRequestForm } from './components/RemovalRequestForm'
import { AeRemoveBusinessPageSkeleton } from './AeRemoveBusinessPageSkeleton'
import { useRemoveBusinessPage } from './useRemoveBusinessPage'

export function AeRemoveBusinessPage() {
  const { hydrated, form } = useRemoveBusinessPage()

  return (
    <div className="arc-market arc-correction-page">
      {!hydrated ? <AeRemoveBusinessPageSkeleton /> : <RemovalRequestForm {...form} />}
    </div>
  )
}
